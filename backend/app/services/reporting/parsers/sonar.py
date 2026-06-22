import asyncio
import os
import logging
import httpx
from typing import Optional, List
from .base import SecurityFinding

logger = logging.getLogger(__name__)

_sonar_rule_cache: dict[str, dict] = {}


def get_sonar_url() -> str:
    from app.core.config import settings
    return settings.SONARQUBE_URL


def get_sonar_protocol() -> str:
    from app.core.config import settings
    return getattr(settings, "SONARQUBE_PROTOCOL", "http")


def get_sonar_dashboard_link(sonar_key: str) -> str:
    sonar_url = get_sonar_url()
    proto = get_sonar_protocol()
    return f"{proto}://{sonar_url}/dashboard?id={sonar_key}"


def create_sonar_report_link(sonar_key: Optional[str]) -> Optional[str]:
    if not sonar_key:
        return None
    return get_sonar_issues_link(sonar_key)


def get_sonar_issues_link(sonar_key: str) -> str:
    sonar_url = get_sonar_url()
    proto = get_sonar_protocol()
    return f"{proto}://{sonar_url}/project/issues?id={sonar_key}&resolved=false"


SEVERITY_MAP = {
    "BLOCKER": "Critical",
    "CRITICAL": "High",
    "MAJOR": "Medium",
    "MINOR": "Low",
    "INFO": "Info",
}


def _clear_rule_cache() -> None:
    _sonar_rule_cache.clear()


def _build_sonar_finding(issue: dict) -> SecurityFinding:
    component = issue.get("component", "")
    file_path = component.split(":", 1)[1] if ":" in component else component
    severity = SEVERITY_MAP.get(issue.get("severity", ""), "Unknown")
    rule_key = issue.get("rule", "")

    rule_data = _sonar_rule_cache.get(rule_key, {})

    description = rule_data.get("htmlDesc") or rule_data.get("description") or ""
    recommendation = rule_data.get("htmlNote") or ""
    if not recommendation:
        debt_fn = rule_data.get("debtRemFnType", "")
        debt_offset = rule_data.get("debtRemFnOffset", "")
        if debt_fn and debt_offset:
            recommendation = f"Estimated remediation effort: {debt_offset} ({debt_fn})"

    rule_name = rule_data.get("name", "")
    language = rule_data.get("lang", "")

    return SecurityFinding(
        id=f"SONAR-{issue.get('key', 'unknown')}",
        tool="sonar",
        severity=severity,
        title=issue.get("message", ""),
        description=description,
        host=component.split(":")[0] if component else "",
        recommendation=recommendation,
        raw_evidence=str(issue),
        rule=rule_key,
        finding_type=issue.get("type", ""),
        line_number=issue.get("line"),
        file_path=file_path,
        effort=issue.get("effort"),
        tags=issue.get("tags", []) or [],
        sonar_status=issue.get("status"),
        sonar_resolution=issue.get("resolution"),
        code_snippet_language=language,
    )


async def _fetch_sonar_page(client: httpx.AsyncClient, url: str, params: dict, auth) -> tuple[dict | None, str]:
    response = await client.get(url, params=params, auth=auth)
    if response.status_code != 200:
        logger.warning(
            f"SonarQube API returned {response.status_code}: {response.text}"
        )
        return None, ""
    return response.json(), response.text


async def _fetch_all_sonar_issues(url: str, sonar_key: str, issue_types: str, auth) -> tuple[list[dict], str] | None:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            all_issues: list[dict] = []
            raw_json = ""
            page = 1
            page_size = 500
            total = None

            while total is None or len(all_issues) < total:
                params = {
                    "componentKeys": sonar_key,
                    "ps": page_size,
                    "p": page,
                    "types": issue_types,
                }
                data, raw = await _fetch_sonar_page(client, url, params, auth)
                if data is None:
                    break
                if total is None:
                    total = data.get("total", 0)
                    raw_json = raw
                issues = data.get("issues", [])
                if not issues:
                    break
                all_issues.extend(issues)
                page += 1

            if total is not None and total > 0:
                return all_issues, raw_json
            return None
    except Exception as e:
        logger.error(f"Error fetching SonarQube issues: {e}")
        return None


async def _fetch_sonar_rules(client: httpx.AsyncClient, rule_keys: list[str], auth) -> dict[str, dict]:
    if not rule_keys:
        return {}

    from app.core.config import settings
    proto = get_sonar_protocol()
    sonar_url = get_sonar_url()
    rules_url = f"{proto}://{sonar_url}/api/rules/search"

    results: dict[str, dict] = {}
    batch_size = 200
    for i in range(0, len(rule_keys), batch_size):
        batch = rule_keys[i:i + batch_size]
        params = {
            "rule_keys": ",".join(batch),
            "ps": batch_size,
        }
        try:
            response = await client.get(rules_url, params=params, auth=auth)
            if response.status_code == 200:
                data = response.json()
                for rule in data.get("rules", []):
                    key = rule.get("key", "")
                    results[key] = rule
            else:
                logger.warning(
                    f"SonarQube rules API returned {response.status_code}: {response.text}"
                )
        except Exception as e:
            logger.error(f"Error fetching SonarQube rules batch: {e}")

    return results


async def fetch_sonar_issues(
    sonar_key: str,
    sonar_url: str = None,
    issue_types: str = "BUG,VULNERABILITY,CODE_SMELL",
) -> tuple[List[SecurityFinding], str]:
    if not sonar_url:
        sonar_url = get_sonar_url()

    proto = get_sonar_protocol()
    url = f"{proto}://{sonar_url}/api/issues/search"

    from app.core.config import settings
    if not settings.SONARQUBE_TOKEN:
        logger.warning(
            "SONARQUBE_TOKEN is not set - SonarQube API will not authenticate. "
            "Set SONARQUBE_TOKEN env var to fetch issues."
        )
    auth = (settings.SONARQUBE_TOKEN, "") if settings.SONARQUBE_TOKEN else None

    _clear_rule_cache()

    max_retries = 3
    retry_delay = 10

    for attempt in range(max_retries):
        result = await _fetch_all_sonar_issues(url, sonar_key, issue_types, auth)
        if result is not None:
            all_issues, raw_json = result

            unique_rules = list(set(
                issue.get("rule", "") for issue in all_issues if issue.get("rule")
            ))
            if unique_rules:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    _sonar_rule_cache.update(
                        await _fetch_sonar_rules(client, unique_rules, auth)
                    )

            findings = [_build_sonar_finding(issue) for issue in all_issues]
            return findings, raw_json

        if attempt < max_retries - 1:
            logger.info(
                f"SonarQube returned 0 issues for {sonar_key} "
                f"(attempt {attempt+1}/{max_retries}), retrying in {retry_delay}s..."
            )
            await asyncio.sleep(retry_delay)

    return [], ""
