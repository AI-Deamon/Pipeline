"""
API endpoints for Unified Project View - Project Groups.
"""
import uuid
from datetime import datetime, timezone
from typing import Annotated, List, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.db_models import (
    ProjectGroupDB,
    ScanAssignmentDB,
    ProjectDB,
    ScanDB,
    ScanReportDB,
)
from app.schemas.project import (
    ProjectGroupCreate,
    ProjectGroupUpdate,
    ProjectGroupResponse,
    ProjectGroupDetail,
)
from app.services.project_grouping import ProjectGroupingService

router = APIRouter(prefix="/project-groups", tags=["project-groups"])

_PROJECT_GROUP_NOT_FOUND = "Project group not found"


@router.get("/", response_model=List[ProjectGroupResponse])
def list_project_groups(db: Annotated[Session, Depends(get_db)], skip: int = 0, limit: int = 100):
    """List all project groups."""
    groups = db.query(ProjectGroupDB).offset(skip).limit(limit).all()
    return [
        ProjectGroupResponse(
            group_id=g.group_id,
            name=g.name,
            description=g.description,
            naming_pattern=g.naming_pattern,
            created_at=g.created_at,
            updated_at=g.updated_at,
        )
        for g in groups
    ]


@router.post("/", response_model=ProjectGroupResponse, status_code=status.HTTP_201_CREATED,
  responses={400: {"description": "Bad request"}})
def create_project_group(
    group: ProjectGroupCreate,
    db: Annotated[Session, Depends(get_db)],
):
    """Create a new project group."""
    group_id = str(uuid.uuid4())
    
    # Validate naming pattern
    if not group.naming_pattern:
        raise HTTPException(status_code=400, detail="naming_pattern is required")
    
    db_group = ProjectGroupDB(
        group_id=group_id,
        name=group.name,
        description=group.description,
        naming_pattern=group.naming_pattern,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    
    return ProjectGroupResponse(
        group_id=db_group.group_id,
        name=db_group.name,
        description=db_group.description,
        naming_pattern=db_group.naming_pattern,
        created_at=db_group.created_at,
        updated_at=db_group.updated_at,
    )


@router.get("/{group_id}", response_model=ProjectGroupDetail,
  responses={404: {"description": "Not found"}})
def get_project_group(
    group_id: str,
    db: Annotated[Session, Depends(get_db)],
):
    """Get a project group with its details and aggregated report."""
    group = db.query(ProjectGroupDB).filter(ProjectGroupDB.group_id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail=_PROJECT_GROUP_NOT_FOUND)
    
    # Get assigned scans with confidence
    assignments = (
        db.query(ScanAssignmentDB)
        .filter(ScanAssignmentDB.group_id == group_id)
        .all()
    )
    
    scan_assignments = [
        {
            "scan_id": a.scan_id,
            "project_id": a.project_id,
            "match_confidence": a.match_confidence,
            "is_auto_assigned": a.is_auto_assigned == "true",
            "assigned_at": a.assigned_at,
        }
        for a in assignments
    ]
    
    # Get aggregated report
    service = ProjectGroupingService()
    aggregated = service.get_group_aggregated_report(db, group_id)
    
    return ProjectGroupDetail(
        group_id=group.group_id,
        name=group.name,
        description=group.description,
        naming_pattern=group.naming_pattern,
        created_at=group.created_at,
        updated_at=group.updated_at,
        assigned_scans=scan_assignments,
        total_findings=aggregated["total_findings"],
        severity_summary=aggregated["severity_summary"],
    )


@router.patch("/{group_id}", response_model=ProjectGroupResponse,
  responses={404: {"description": "Not found"}})
def update_project_group(
    group_id: str,
    group_update: ProjectGroupUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    """Update a project group."""
    group = db.query(ProjectGroupDB).filter(ProjectGroupDB.group_id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail=_PROJECT_GROUP_NOT_FOUND)
    
    update_data = group_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(group, field, value)
    
    group.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(group)
    
    return ProjectGroupResponse(
        group_id=group.group_id,
        name=group.name,
        description=group.description,
        naming_pattern=group.naming_pattern,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


@router.delete("/{group_id}",
  responses={404: {"description": "Not found"}})
def delete_project_group(
    group_id: str,
    db: Annotated[Session, Depends(get_db)],
):
    """Delete a project group and its assignments."""
    group = db.query(ProjectGroupDB).filter(ProjectGroupDB.group_id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail=_PROJECT_GROUP_NOT_FOUND)
    
    # Delete assignments first
    db.query(ScanAssignmentDB).filter(ScanAssignmentDB.group_id == group_id).delete()
    
    # Delete group
    db.delete(group)
    db.commit()
    
    return {"status": "success", "message": f"Project group {group_id} deleted"}


@router.post("/{group_id}/auto-assign",
  responses={404: {"description": "Not found"}})
def auto_assign_scans(
    group_id: str,
    db: Annotated[Session, Depends(get_db)],
):
    """Auto-assign scans to a project group based on naming pattern."""
    group = db.query(ProjectGroupDB).filter(ProjectGroupDB.group_id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail=_PROJECT_GROUP_NOT_FOUND)
    
    service = ProjectGroupingService()
    result = service.auto_assign_group_scans(db, group_id, group.naming_pattern)
    
    return {
        "status": "success",
        "message": f"Auto-assigned {result['assigned_count']} scans",
        **result,
    }


@router.post("/{group_id}/refresh",
  responses={404: {"description": "Not found"}})
def refresh_group(group_id: str, db: Annotated[Session, Depends(get_db)], auto_reassign: bool = True):
    """
    Refresh a project group - re-run auto-assignment and recalculate aggregates.
    
    This is useful for keeping groups up-to-date as new scans are created.
    Set auto_reassign=false to only recalculate without changing assignments.
    """
    group = db.query(ProjectGroupDB).filter(ProjectGroupDB.group_id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail=_PROJECT_GROUP_NOT_FOUND)
    
    service = ProjectGroupingService()
    result = {"auto_assigned": 0, "refreshed_scans": 0}
    
    if auto_reassign:
        auto_result = service.auto_assign_group_scans(db, group_id, group.naming_pattern)
        result["auto_assigned"] = auto_result["assigned_count"]
    
    # Get refreshed report
    aggregated = service.get_group_aggregated_report(db, group_id)
    result["total_findings"] = aggregated["total_findings"]
    result["severity_summary"] = aggregated["severity_summary"]
    
    return {
        "status": "success",
        "message": "Group refreshed successfully",
        **result,
    }


@router.get("/suggest", response_model=List[dict])
def suggest_project_groups(db: Annotated[Session, Depends(get_db)], limit: int = 50):
    """
    Suggest potential project groups based on existing scan/project naming patterns.
    
    Returns a list of suggested prefixes that could form project groups.
    """
    service = ProjectGroupingService()
    
    # Get all projects to analyze naming
    projects = db.query(ProjectDB).limit(limit).all()
    
    # Extract unique prefixes (auto-identify potential group patterns)
    prefix_counts = {}
    for project in projects:
        # Extract prefix (everything before first underscore or take full name)
        name = project.name or project.project_id
        parts = name.split("_")
        base = parts[0] if len(parts) > 1 else name.split("-")[0] if "-" in name else name
        
        prefix_counts[base] = prefix_counts.get(base, 0) + 1
    
    # Return suggestions with count of related projects
    suggestions = [
        {
            "pattern": f"{prefix}_*",
            "name_suggestion": f"{prefix.replace('_', ' ').title()} Platform",
            "related_projects": count,
        }
        for prefix, count in sorted(prefix_counts.items(), key=lambda x: -x[1])
        if count > 1  # Only suggest if multiple related projects
    ]
    
    return suggestions[:10]  # Top 10 suggestions


@router.post("/{group_id}/bulk-assign",
  responses={404: {"description": "Not found"}})
def bulk_assign_scans(
    group_id: str,
    scan_ids: List[str],
    db: Annotated[Session, Depends(get_db)],
):
    """Bulk assign multiple scans to a project group."""
    group = db.query(ProjectGroupDB).filter(ProjectGroupDB.group_id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail=_PROJECT_GROUP_NOT_FOUND)
    
    assigned = 0
    for scan_id in scan_ids:
        scan = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
        if not scan:
            continue
        
        existing = (
            db.query(ScanAssignmentDB)
            .filter(
                ScanAssignmentDB.group_id == group_id,
                ScanAssignmentDB.scan_id == scan_id,
            )
            .first()
        )
        
        if not existing:
            assignment = ScanAssignmentDB(
                group_id=group_id,
                scan_id=scan_id,
                project_id=scan.project_id,
                match_confidence=100,
                is_auto_assigned="false",
                assigned_at=datetime.now(timezone.utc),
            )
            db.add(assignment)
            assigned += 1
    
    db.commit()
    return {"status": "success", "message": f"Assigned {assigned} scans to group"}


@router.post("/{group_id}/assignments",
  responses={404: {"description": "Not found"}})
def add_scan_assignment(
    group_id: str,
    scan_id: str,
    db: Annotated[Session, Depends(get_db)],
):
    """Manually assign a scan to a project group."""
    group = db.query(ProjectGroupDB).filter(ProjectGroupDB.group_id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail=_PROJECT_GROUP_NOT_FOUND)
    
    scan = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Check if already assigned
    existing = (
        db.query(ScanAssignmentDB)
        .filter(
            ScanAssignmentDB.group_id == group_id,
            ScanAssignmentDB.scan_id == scan_id,
        )
        .first()
    )
    
    if existing:
        return {"status": "success", "message": "Scan already assigned to group"}
    
    assignment = ScanAssignmentDB(
        group_id=group_id,
        scan_id=scan_id,
        project_id=scan.project_id,
        match_confidence=100,
        is_auto_assigned="false",
        assigned_at=datetime.now(timezone.utc),
    )
    db.add(assignment)
    db.commit()
    
    return {"status": "success", "message": f"Scan {scan_id} assigned to group"}


@router.delete("/{group_id}/assignments/{scan_id}",
  responses={404: {"description": "Not found"}})
def remove_scan_assignment(
    group_id: str,
    scan_id: str,
    db: Annotated[Session, Depends(get_db)],
):
    """Remove a scan from a project group."""
    assignment = (
        db.query(ScanAssignmentDB)
        .filter(
            ScanAssignmentDB.group_id == group_id,
            ScanAssignmentDB.scan_id == scan_id,
        )
        .first()
    )
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    db.delete(assignment)
    db.commit()
    
    return {"status": "success", "message": f"Scan {scan_id} removed from group"}
