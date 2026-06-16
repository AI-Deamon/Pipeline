import sys
import os
import pytest

# Add backend directory to Python path for imports
backend_path = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.insert(0, os.path.abspath(backend_path))

# Set required environment variables for Settings before app is imported
os.environ.setdefault('ENV', 'test')
# Use a per-process unique file-based SQLite database. Each test fixture
# drops + recreates the schema so tests are isolated without lock contention.
import tempfile
import uuid as _uuid
_test_db_path = os.path.join(tempfile.gettempdir(), f"test_{_uuid.uuid4().hex[:8]}.db")
os.environ.setdefault('DATABASE_URL', f"sqlite:///{_test_db_path}")
os.environ.setdefault('JENKINS_BASE_URL', 'http://localhost:8080')
os.environ.setdefault('JENKINS_TOKEN', 'test-token')
os.environ.setdefault('STORAGE_PATH', '/tmp/storage')
os.environ.setdefault('SCAN_TIMEOUT', '7200')
os.environ.setdefault('LOG_LEVEL', 'INFO')
os.environ.setdefault('CALLBACK_TOKEN', 'test-callback-token-1234567890')
os.environ.setdefault('API_KEY', 'test-api-key-1234567890')
os.environ.setdefault('DEBUG', 'False')
os.environ.setdefault('MOCK_EXECUTION', 'True')
os.environ.setdefault('SONARQUBE_TOKEN', 'test-sonar-token-1234567890')
os.environ.setdefault('TEST_BYPASS_AUTH', 'True')  # Enable test env auth bypass for existing tests

# Import after env setup but before tests run
from app.core.db import engine, Base
# Import all models that any test might use so SQLAlchemy registers them
# on Base.metadata before create_all() runs.
from app.models.db_models import (
    ProjectDB,
    ScanDB,
    ScanReportDB,
    IssueDB,
    IssueHistoryDB,
    IssueScanDB,
    ProjectAssignmentDB,
    AccessChangeDB,
    RescanRequestDB,
    UserDB,
)


@pytest.fixture(autouse=True)
def setup_database():
    """Setup and teardown database for each test.

    Drops and recreates the schema so each test starts from a clean slate
    without sharing state. Tests run sequentially by default, so the file
    lock issue is not triggered.
    """
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
