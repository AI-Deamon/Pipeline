#!/usr/bin/env python3
"""
Generate TypeScript types from Backend OpenAPI Schema

This script fetches the OpenAPI schema from the running backend server
and generates TypeScript types for use in the frontend.

Usage:
    python3 scripts/generate-frontend-types.py

The generated types are written to src/types-generated.ts
"""

import json
import sys
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# Configuration
BACKEND_URL = "http://localhost:8000"
OPENAPI_ENDPOINT = f"{BACKEND_URL}/openapi.json"
OUTPUT_FILE = Path(__file__).parent.parent / "src" / "types-generated.ts"

# Header for generated file
FILE_HEADER = '''/**
 * Auto-generated TypeScript types from Backend OpenAPI schema
 * 
 * DO NOT EDIT MANUALLY - This file is generated automatically.
 * Run: npm run generate:types
 * 
 * Generated from: {url}
 */

'''


def fetch_openapi_schema() -> dict:
    """Fetch OpenAPI schema from backend server."""
    print(f"Fetching OpenAPI schema from {OPENAPI_ENDPOINT}...")
    
    try:
        req = Request(OPENAPI_ENDPOINT)
        req.add_header("Accept", "application/json")
        
        with urlopen(req, timeout=10) as response:
            schema = json.loads(response.read().decode("utf-8"))
            print(f"✓ Successfully fetched OpenAPI schema (version {schema.get('openapi', 'unknown')})")
            return schema
    except HTTPError as e:
        print(f"✗ HTTP Error {e.code}: {e.reason}")
        print(f"  Make sure the backend server is running at {BACKEND_URL}")
        sys.exit(1)
    except URLError as e:
        print(f"✗ Failed to connect to backend: {e.reason}")
        print(f"  Make sure the backend server is running at {BACKEND_URL}")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        sys.exit(1)


def extract_enum_from_schema(schema: dict, enum_name: str) -> list[str] | None:
    """Extract enum values from OpenAPI schema component."""
    components = schema.get("components", {})
    schemas = components.get("schemas", {})
    
    enum_schema = schemas.get(enum_name)
    if enum_schema and "enum" in enum_schema:
        return enum_schema["enum"]
    
    return None


def generate_scan_state_enum(values: list[str]) -> str:
    """Generate TypeScript enum for ScanState."""
    lines = [
        "// Auto-generated ScanState enum from backend",
        "export const SCAN_STATE = {",
    ]
    
    for value in values:
        # Convert backend value to TypeScript constant name
        # e.g., "IN_PROGRESS" -> "IN_PROGRESS"
        const_name = value.upper().replace(" ", "_")
        lines.append(f"  {const_name}: '{value}' as const,")
    
    lines.append("} as const;")
    lines.append("")
    lines.append("export type ScanState = typeof SCAN_STATE[keyof typeof SCAN_STATE];")
    lines.append("")
    
    return "\n".join(lines)


def generate_response_types(schema: dict) -> str:
    """Generate TypeScript types for API response schemas."""
    components = schema.get("components", {})
    schemas = components.get("schemas", {})
    
    lines = ["// Auto-generated response types from backend schemas", ""]
    
    # Generate types for key schemas
    type_mappings = {
        "ScanResponse": "Scan",
        "ProjectResponse": "Project", 
        "ScanResultsResponse": "ScanResults",
    }
    
    for schema_name, type_name in type_mappings.items():
        if schema_name in schemas:
            props = schemas[schema_name].get("properties", {})
            required = set(schemas[schema_name].get("required", []))
            
            lines.append(f"export type {type_name} = {{")
            for prop_name, prop_schema in props.items():
                # Determine TypeScript type
                prop_type = schema_to_typescript_type(prop_schema)
                optional = "?" if prop_name not in required else ""
                lines.append(f"  {prop_name}{optional}: {prop_type};")
            lines.append("};")
            lines.append("")
    
    return "\n".join(lines)


def schema_to_typescript_type(schema: dict) -> str:
    """Convert OpenAPI schema type to TypeScript type."""
    if "$ref" in schema:
        # Reference to another schema
        ref = schema["$ref"]
        return ref.split("/")[-1]
    
    if "enum" in schema:
        # Enum type
        values = schema["enum"]
        return " | ".join(f"'{v}'" for v in values)
    
    type_mapping = {
        "string": "string",
        "integer": "number",
        "number": "number",
        "boolean": "boolean",
        "array": f"Array<{schema_to_typescript_type(schema.get('items', {}))}>",
        "object": "Record<string, unknown>",
    }
    
    ts_type = schema.get("type")
    if ts_type in type_mapping:
        return type_mapping[ts_type]
    
    return "unknown"


def generate_types(schema: dict) -> str:
    """Generate complete TypeScript types file."""
    output = FILE_HEADER.format(url=OPENAPI_ENDPOINT)
    
    # Generate ScanState enum if available
    scan_state_values = extract_enum_from_schema(schema, "ScanState")
    if scan_state_values:
        output += generate_scan_state_enum(scan_state_values)
    
    # Generate response types
    output += generate_response_types(schema)
    
    # Add utility types
    output += """
// Utility types for API responses
export type ApiError = {
  detail: string;
  status_code?: number;
};

// Stage status types (normalized)
export type StageStatus = 'PASS' | 'FAIL' | 'SKIPPED' | 'WARN';

export type ScanStage = {
  stage: string;
  status: StageStatus;
  summary?: string;
  artifact_url?: string;
  artifact_size_bytes?: number;
  artifact_sha256?: string;
};
"""
    
    return output


def write_output(content: str) -> None:
    """Write generated types to output file."""
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(content)
    
    print(f"✓ Generated types written to {OUTPUT_FILE}")


def main():
    """Main entry point."""
    print("=" * 60)
    print("Frontend Type Generator")
    print("=" * 60)
    
    # Fetch schema
    schema = fetch_openapi_schema()
    
    # Generate types
    types_content = generate_types(schema)
    
    # Write output
    write_output(types_content)
    
    print("=" * 60)
    print("✓ Type generation complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
