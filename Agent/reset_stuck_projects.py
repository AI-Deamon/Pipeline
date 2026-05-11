#!/usr/bin/env python3
"""
Reset stuck projects to allow new scans

Usage:
    python reset_stuck_projects.py [--project-id ID]
"""

import argparse
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from sqlalchemy import create_engine, text
from app.core.config import settings

def reset_all_stuck(database_url: str):
    """Reset all QUEUED/RUNNING projects to NONE"""
    engine = create_engine(database_url)
    
    with engine.connect() as conn:
        # Reset stuck projects
        result = conn.execute(
            text("""
                UPDATE projects 
                SET last_scan_state = 'NONE' 
                WHERE last_scan_state IN ('QUEUED', 'RUNNING')
            """)
        )
        conn.commit()
        print(f"✓ Reset {result.rowcount} stuck project(s) to NONE state")
        
        # Show current state
        result = conn.execute(
            text("SELECT project_id, name, last_scan_state FROM projects")
        )
        print("\nCurrent project states:")
        print("-" * 80)
        for row in result:
            print(f"{row.project_id[:8]}... | {row.name:30} | {row.last_scan_state}")
        print("-" * 80)

def reset_specific_project(database_url: str, project_id: str):
    """Reset a specific project to NONE state"""
    engine = create_engine(database_url)
    
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                UPDATE projects 
                SET last_scan_state = 'NONE' 
                WHERE project_id = :project_id
            """),
            {"project_id": project_id}
        )
        conn.commit()
        
        if result.rowcount > 0:
            print(f"✓ Reset project {project_id} to NONE state")
        else:
            print(f"✗ Project {project_id} not found")

def main():
    parser = argparse.ArgumentParser(description="Reset stuck projects")
    parser.add_argument("--project-id", help="Reset specific project ID")
    parser.add_argument("--all", action="store_true", help="Reset all stuck projects")
    args = parser.parse_args()
    
    database_url = settings.DATABASE_URL
    
    if args.project_id:
        reset_specific_project(database_url, args.project_id)
    elif args.all:
        reset_all_stuck(database_url)
    else:
        # Default: reset all stuck projects
        reset_all_stuck(database_url)

if __name__ == "__main__":
    main()
