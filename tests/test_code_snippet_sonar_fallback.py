"""Regression tests for a real gap reported live: the code-snippet endpoint
only ever tried GitHub (raw.githubusercontent.com) and a local workspace
clone. For a private repo — confirmed live: Meraki's git_url (meraki-pda/api)
returns 404 from GitHub's own API, meaning raw fetch can never work for it
regardless of the earlier URL-corruption fix (#129) — there was no fallback
at all, so every finding on that project showed no code snippet.

SonarQube already indexed the source when it scanned the project, so it
works regardless of GitHub repo visibility. `fetch_sonar_source` was already
fully implemented in sonar.py but had zero call sites anywhere — the same
"built but never wired" gap already found once for this same endpoint
(#130) — until this fix.
"""
import os
from unittest.mock import patch, AsyncMock, Mock

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_code_snippet_sonar_fallback.db')
os.environ.setdefault('JENKINS_BASE_URL', 'http://localhost:8080')
os.environ.setdefault('JENKINS_TOKEN', 'test-token')
os.environ.setdefault('STORAGE_PATH', '/tmp/storage-test')
os.environ.setdefault('SCAN_TIMEOUT', '7200')
os.environ.setdefault('LOG_LEVEL', 'INFO')
os.environ.setdefault('CALLBACK_TOKEN', 'test-callback-token-1234567890')
os.environ.setdefault('API_KEY', 'test-api-key-1234567890')
os.environ.setdefault('TEST_BYPASS_AUTH', 'True')
os.environ.setdefault('MOCK_EXECUTION', 'True')
os.environ.setdefault('SONARQUBE_TOKEN', 'test-sonar-token-1234567890')

import pytest
from fastapi.testclient import TestClient

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import ProjectDB
from app.api.projects import _strip_sonar_source_markup


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    db.add(ProjectDB(
        project_id="proj-private",
        name="Private Repo Project",
        status="ACTIVE",
        git_url="https://github.com/meraki-pda/api.git",
        branch="staging",
        sonar_key="private-project-key",
    ))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


def test_falls_back_to_sonarqube_source_when_github_is_unreachable(client):
    with patch("httpx.get") as mock_github_get, \
         patch("app.services.reporting.parsers.sonar.httpx.AsyncClient") as mock_sonar_client:
        mock_github_get.return_value = Mock(status_code=404)

        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "sources": [
                {"line": 40, "code": '<span class="k">const</span> x = 1;'},
                {"line": 41, "code": "y = 2"},
            ]
        }
        mock_sonar_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_resp)

        response = client.get(
            "/api/v1/projects/proj-private/code-snippet?file=src/app.ts&line=41",
            headers={"Authorization": "Bearer test-bypass"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "sonar"
    assert data["git_url"] is None
    # The HTML syntax-highlighting markup SonarQube returns must be stripped
    # to plain text before it reaches the frontend's own syntax highlighter.
    assert "<span" not in data["content"]
    assert "const x = 1;" in data["content"]
    assert "y = 2" in data["content"]


def test_returns_404_when_github_fails_and_no_sonar_key(client):
    db = SessionLocal()
    db.add(ProjectDB(
        project_id="proj-no-sonar",
        name="No Sonar Key",
        status="ACTIVE",
        git_url="https://github.com/meraki-pda/api.git",
    ))
    db.commit()
    db.close()

    with patch("httpx.get") as mock_github_get:
        mock_github_get.return_value = Mock(status_code=404)
        response = client.get(
            "/api/v1/projects/proj-no-sonar/code-snippet?file=src/app.ts&line=41",
            headers={"Authorization": "Bearer test-bypass"},
        )

    assert response.status_code == 404


class TestStripSonarSourceMarkup:
    def test_strips_span_tags(self):
        assert _strip_sonar_source_markup('<span class="k">const</span> x = 1;') == "const x = 1;"

    def test_unescapes_html_entities(self):
        assert _strip_sonar_source_markup("a &lt; b &amp;&amp; c &gt; d") == "a < b && c > d"

    def test_plain_text_passes_through_unchanged(self):
        assert _strip_sonar_source_markup("  return x;") == "  return x;"
