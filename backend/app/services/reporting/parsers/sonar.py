import asyncio
import os
import logging
import httpx
from typing import Optional, List
from .base import SecurityFinding

logger = logging.getLogger(__name__)


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


class SonarAuthError(Exception):
    """Raised when SonarQube returns 401/403."""
    pass


SEVERITY_MAP = {
    "BLOCKER": "Critical",
    "CRITICAL": "High",
    "MAJOR": "Medium",
    "MINOR": "Low",
    "INFO": "Info",
}


def _build_sonar_finding(issue: dict, rule_cache: dict[str, dict]) -> SecurityFinding:
    component = issue.get("component", "")
    file_path = component.split(":", 1)[1] if ":" in component else component
    severity = SEVERITY_MAP.get(issue.get("severity", ""), "Unknown")
    rule_key = issue.get("rule", "")

    rule_data = rule_cache.get(rule_key, {})

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
    if response.status_code in (401, 403):
        logger.error(
            "SonarQube auth error %d: %s", response.status_code, response.text
        )
        raise SonarAuthError(f"SonarQube returned {response.status_code}")
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
    except SonarAuthError:
        raise
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

    max_retries = 3
    retry_delay = 10

    for attempt in range(max_retries):
        try:
            result = await _fetch_all_sonar_issues(url, sonar_key, issue_types, auth)
        except SonarAuthError:
            raise
        if result is not None:
            all_issues, raw_json = result

            # Request-scoped rule cache: a local dict per call instead of a module global,
            # so two scans running concurrently in the same worker can't clear/overwrite
            # each other's rule lookups and produce wrong description/recommendation text.
            rule_cache: dict[str, dict] = {}
            unique_rules = list(set(
                issue.get("rule", "") for issue in all_issues if issue.get("rule")
            ))
            if unique_rules:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    rule_cache.update(
                        await _fetch_sonar_rules(client, unique_rules, auth)
                    )

            findings = [_build_sonar_finding(issue, rule_cache) for issue in all_issues]
            return findings, raw_json

        if attempt < max_retries - 1:
            logger.info(
                f"SonarQube returned 0 issues for {sonar_key} "
                f"(attempt {attempt+1}/{max_retries}), retrying in {retry_delay}s..."
            )
            await asyncio.sleep(retry_delay)

    return [], ""

HOTSPOT_SEVERITY_MAP = {
    "HIGH": "Critical",
    "MEDIUM": "High",
    "LOW": "Medium",
}


async def fetch_sonar_hotspots(
    sonar_key: str,
    sonar_url: str = None,
    sonar_protocol: str = None,
    sonar_token: str = None,
) -> tuple[List[SecurityFinding], str]:
    if not sonar_url:
        sonar_url = get_sonar_url()
    proto = sonar_protocol or get_sonar_protocol()
    url = f"{proto}://{sonar_url}/api/hotspots/search"

    token = sonar_token or ""
    if not token:
        from app.core.config import settings
        token = settings.SONARQUBE_TOKEN or ""

    auth = (token, "") if token else None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            all_hotspots: list[dict] = []
            raw_json = ""
            page = 1
            page_size = 500
            total = None

            while total is None or len(all_hotspots) < total:
                params = {
                    "project": sonar_key,
                    "ps": page_size,
                    "p": page,
                }
                data, raw = await _fetch_sonar_page(client, url, params, auth)
                if data is None:
                    break
                if total is None:
                    total = data.get("paging", {}).get("total", 0)
                    raw_json = raw
                hotspots = data.get("hotspots", [])
                if not hotspots:
                    break
                all_hotspots.extend(hotspots)
                page += 1

            if not all_hotspots:
                return [], ""

            findings: List[SecurityFinding] = []
            for hs in all_hotspots:
                prob = hs.get("vulnerabilityProbability", "MEDIUM")
                severity = HOTSPOT_SEVERITY_MAP.get(prob, "Medium")

                component = hs.get("component", "")
                file_path = component.split(":", 1)[1] if ":" in component else component

                findings.append(SecurityFinding(
                    id=f"SONAR-HOTSPOT-{hs.get('key', 'unknown')}",
                    tool="sonar",
                    severity=severity,
                    title=hs.get("message", "Security Hotspot"),
                    description=f"Security Hotspot in {file_path}. Needs security review.",
                    host=component.split(":")[0] if component else "",
                    recommendation="Review the hotspot and determine if the code poses a security risk. Apply secure coding practices.",
                    raw_evidence=str(hs),
                    rule=hs.get("ruleKey", ""),
                    finding_type="SECURITY_HOTSPOT",
                    line_number=hs.get("line"),
                    file_path=file_path,
                    tags=hs.get("tags", []) or [],
                    sonar_status=hs.get("status", "TO_REVIEW"),
                ))

            return findings, raw_json
    except SonarAuthError:
        raise
    except Exception as e:
        logger.error(f"Error fetching SonarQube hotspots: {e}")
        return [], ""


async def fetch_sonar_measures(component_key: str) -> dict:
    """
    Fetch code measures for a specific component (file).

    Returns:
        {
            "coverage": "78.5",
            "complexity": "15",
            "cognitive_complexity": "12",
            "duplicated_lines_density": "3.2",
            "ncloc": "311"
        }
    """
    try:
        from app.core.config import settings
        token = settings.SONARQUBE_TOKEN
        if not token:
            return {}

        url = f"{get_sonar_protocol()}://{get_sonar_url()}/api/measures/component"
        params = {
            "component": component_key,
            "metricKeys": "coverage,complexity,cognitive_complexity,duplicated_lines_density,ncloc",
        }
        auth = (token, "")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params, auth=auth)
            if response.status_code != 200:
                logger.warning(f"SonarQube measures API returned {response.status_code}")
                return {}

            data = response.json()
            measures = {}
            for m in data.get("component", {}).get("measures", []):
                measures[m["metric"]] = m.get("value", "0")
            return measures

    except Exception as e:
        logger.error(f"Error fetching SonarQube measures: {e}")
        return {}


async def fetch_sonar_project_measures(sonar_key: str) -> dict:
    """Fetch aggregate project-level measures from SonarQube.

    Returns a flat dict of metric key → string value, e.g.
    {"bugs": "5", "vulnerabilities": "12", "coverage": "78.5", ...}
    """
    try:
        from app.core.config import settings
        token = settings.SONARQUBE_TOKEN
        if not token:
            return {}

        url = f"{get_sonar_protocol()}://{get_sonar_url()}/api/measures/component"
        params = {
            "component": sonar_key,
            "metricKeys": (
                "bugs,vulnerabilities,code_smells,coverage,"
                "duplicated_lines_density,sqale_index,ncloc,"
                "reliability_rating,security_rating,security_review_rating,"
                "alert_status"
            ),
        }
        auth = (token, "")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params, auth=auth)
            if response.status_code != 200:
                logger.warning(f"SonarQube project measures API returned {response.status_code}")
                return {}

            data = response.json()
            result = {}
            for m in data.get("component", {}).get("measures", []):
                metric = m.get("metric", "")
                value = m.get("value", "0")
                period = m.get("period", {})
                if period:
                    result[f"{metric}_diff"] = period.get("value", "0")
                result[metric] = value
            return result

    except SonarAuthError:
        raise
    except Exception as e:
        logger.error(f"Error fetching SonarQube project measures: {e}")
        return {}


async def fetch_sonar_quality_gate(sonar_key: str) -> dict:
    """
    Fetch quality gate status for a project.

    Returns:
        {
            "status": "OK",
            "conditions": [
                {"metric": "coverage", "status": "OK", "actual": "78.5"},
                {"metric": "duplicated_lines", "status": "ERROR", "actual": "3.2"}
            ]
        }
    """
    try:
        from app.core.config import settings
        token = settings.SONARQUBE_TOKEN
        if not token:
            return {"status": "UNKNOWN", "conditions": []}

        url = f"{get_sonar_protocol()}://{get_sonar_url()}/api/qualitygates/project_status"
        params = {"projectKey": sonar_key}
        auth = (token, "")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params, auth=auth)
            if response.status_code != 200:
                logger.warning(f"SonarQube quality gate API returned {response.status_code}")
                return {"status": "UNKNOWN", "conditions": []}

            data = response.json()
            project_status = data.get("projectStatus", {})
            return {
                "status": project_status.get("status", "UNKNOWN"),
                "conditions": [
                    {
                        "metric": c.get("metric", ""),
                        "status": c.get("status", ""),
                        "actual": c.get("actual", ""),
                        "expected": c.get("expected", ""),
                    }
                    for c in project_status.get("conditions", [])
                ],
            }

    except Exception as e:
        logger.error(f"Error fetching SonarQube quality gate: {e}")
        return {"status": "UNKNOWN", "conditions": []}


async def fetch_sonar_source(component_key: str) -> list:
    """
    Fetch source code for a component.

    Returns:
        [
            {"line": 1, "code": "function parseInput(data) {"},
            {"line": 2, "code": "  const lines = data.split('\\n');"},
            ...
        ]
    """
    try:
        from app.core.config import settings
        token = settings.SONARQUBE_TOKEN
        if not token:
            return []

        url = f"{get_sonar_protocol()}://{get_sonar_url()}/api/sources/show"
        params = {"key": component_key}
        auth = (token, "")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params, auth=auth)
            if response.status_code != 200:
                logger.warning(f"SonarQube source API returned {response.status_code}")
                return []

            data = response.json()
            sources = data.get("sources", [])
            return [
                {"line": s.get("line", 0), "code": s.get("code", "")}
                for s in sources
            ]

    except Exception as e:
        logger.error(f"Error fetching SonarQube source: {e}")
        return []

