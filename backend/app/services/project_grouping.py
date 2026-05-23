"""
Project grouping service with fuzzy matching for auto-assignment of scans.
"""
import fnmatch
import re
import hashlib
from difflib import SequenceMatcher
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.models.db_models import (
    ProjectGroupDB,
    ScanAssignmentDB,
    ScanDB,
    ProjectDB,
    ScanReportDB,
)


class ProjectGroupingService:
    """
    Service for managing project groups and auto-assigning scans based on naming patterns.
    """

    # Minimum confidence score for auto-assignment (0-100)
    MIN_AUTO_ASSIGN_CONFIDENCE = 70

    @staticmethod
    def _compute_finding_hash(finding: dict) -> str:
        """
        Compute a unique hash for a finding to enable deduplication.
        
        Uses key attributes that identify the same vulnerability:
        - title (normalized)
        - severity
        - host (if available)
        - CVE (if available)
        - package (if available)
        """
        key_parts = [
            str(finding.get("title", "")).lower().strip(),
            str(finding.get("severity", "")).lower().strip(),
            str(finding.get("host", "")).lower().strip(),
            str(finding.get("cve", "")).lower().strip(),
            str(finding.get("package", "")).lower().strip(),
        ]
        key_string = "||".join(key_parts)
        return hashlib.sha256(key_string.encode()).hexdigest()[:16]

    @staticmethod
    def deduplicate_findings(findings: list[dict]) -> list[dict]:
        """
        Remove duplicate findings based on content similarity.
        
        When multiple scans report the same vulnerability (e.g., same CVE on same host),
        only the first occurrence is kept.
        """
        seen_hashes = set()
        unique_findings = []

        for finding in findings:
            finding_hash = ProjectGroupingService._compute_finding_hash(finding)
            if finding_hash not in seen_hashes:
                seen_hashes.add(finding_hash)
                unique_findings.append(finding)

        return unique_findings

    @staticmethod
    def calculate_match_confidence(pattern: str, name: str) -> int:
        """
        Calculate confidence score between a naming pattern and a scan/project name.
        
        Uses multiple strategies:
        1. Exact fnmatch pattern matching (e.g., "kilo_*" matches "kilo_frontend")
        2. Fuzzy string matching via Levenshtein-like similarity
        3. Regex pattern matching if pattern is valid regex
        
        Returns confidence score from 0-100.
        """
        if not pattern or not name:
            return 0

        # Try fnmatch pattern first (handles wildcards like *, ?)
        if fnmatch.fnmatch(name, pattern):
            return 100

        # Try regex pattern matching
        try:
            if re.search(pattern, name, re.IGNORECASE):
                # Calculate similarity ratio for regex matches too
                ratio = SequenceMatcher(None, pattern.lower(), name.lower()).ratio()
                return int(ratio * 100)
        except re.error:
            pass  # Not a valid regex, fall through to fuzzy matching

        # Fuzzy matching for typos (e.g., "kilp_backend" vs "kilo_backend")
        # Extract prefix from pattern (remove wildcards)
        base_pattern = pattern.replace("*", "").replace("?", "")
        if base_pattern and name.lower().startswith(base_pattern.lower()[:3]):
            ratio = SequenceMatcher(None, base_pattern.lower(), name.lower()).ratio()
            return int(ratio * 100)

        return 0

    @staticmethod
    def find_matching_scans(
        db: Session,
        naming_pattern: str,
        limit: int = 100
    ) -> list[tuple[ScanDB, int]]:
        """
        Find scans that match the given naming pattern.
        
        Returns list of (scan, confidence) tuples sorted by confidence descending.
        """
        scans = db.query(ScanDB).limit(limit).all()
        matches = []

        for scan in scans:
            confidence = ProjectGroupingService.calculate_match_confidence(
                naming_pattern, scan.scan_id
            )
            if confidence >= ProjectGroupingService.MIN_AUTO_ASSIGN_CONFIDENCE:
                matches.append((scan, confidence))

        return sorted(matches, key=lambda x: x[1], reverse=True)

    @staticmethod
    def find_matching_projects(
        db: Session,
        naming_pattern: str,
        limit: int = 100
    ) -> list[tuple[ProjectDB, int]]:
        """
        Find projects that match the given naming pattern.
        """
        projects = db.query(ProjectDB).limit(limit).all()
        matches = []

        for project in projects:
            confidence = ProjectGroupingService.calculate_match_confidence(
                naming_pattern, project.project_id
            )
            if confidence >= ProjectGroupingService.MIN_AUTO_ASSIGN_CONFIDENCE:
                matches.append((project, confidence))

        return sorted(matches, key=lambda x: x[1], reverse=True)

    @staticmethod
    def auto_assign_group_scans(
        db: Session,
        group_id: str,
        naming_pattern: str,
    ) -> dict:
        """
        Auto-assign scans to a project group based on naming pattern.
        
        Returns summary of assignments made.
        """
        # Find all scans matching the pattern
        matches = ProjectGroupingService.find_matching_scans(db, naming_pattern)

        assignments_count = 0
        for scan, confidence in matches:
            # Check if already assigned
            existing = (
                db.query(ScanAssignmentDB)
                .filter(
                    ScanAssignmentDB.group_id == group_id,
                    ScanAssignmentDB.scan_id == scan.scan_id,
                )
                .first()
            )

            if not existing:
                assignment = ScanAssignmentDB(
                    group_id=group_id,
                    scan_id=scan.scan_id,
                    project_id=scan.project_id,
                    match_confidence=confidence,
                    is_auto_assigned="true",
                    assigned_at=datetime.now(timezone.utc),
                )
                db.add(assignment)
                assignments_count += 1

        db.commit()
        return {"assigned_count": assignments_count, "total_matches": len(matches)}

    @staticmethod
    def get_group_aggregated_report(
        db: Session,
        group_id: str,
    ) -> dict:
        """
        Generate aggregated security report for all scans in a group.
        
        Includes deduplication to prevent the same finding from appearing
        multiple times when detected by different tools or scans.
        """
        # Get all assigned scans
        assignments = (
            db.query(ScanAssignmentDB)
            .filter(ScanAssignmentDB.group_id == group_id)
            .all()
        )

        scan_ids = [a.scan_id for a in assignments]

        # Get all reports for these scans
        reports = (
            db.query(ScanReportDB)
            .filter(ScanReportDB.scan_id.in_(scan_ids))
            .all()
        )

        # Aggregate findings with deduplication
        total_findings = 0
        severity_summary = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        all_findings = []

        for report in reports:
            severity = report.severity_summary or {}
            for key in severity_summary:
                severity_summary[key] += severity.get(key, 0)
            findings = report.findings or []
            total_findings += sum(severity.values())
            all_findings.extend(findings)

        # Remove duplicate findings
        unique_findings = ProjectGroupingService.deduplicate_findings(all_findings)

        # Recalculate totals based on deduplicated findings
        deduplicated_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for finding in unique_findings:
            severity = str(finding.get("severity", "low")).lower()
            if severity in deduplicated_severity:
                deduplicated_severity[severity] += 1

        return {
            "total_findings": len(unique_findings),
            "severity_summary": deduplicated_severity,
            "findings": unique_findings,
            "assigned_scans_count": len(scan_ids),
        }

    @staticmethod
    def suggest_naming_pattern(project_name: str) -> str:
        """
        Suggest a naming pattern based on project name.
        
        Examples:
        - "kilo" -> "kilo_*"
        - "test1" -> "test1_*"
        """
        # Extract clean prefix from project name
        prefix = project_name.split("_")[0] if "_" in project_name else project_name
        return f"{prefix}_*"


# Singleton instance
grouping_service = ProjectGroupingService()
