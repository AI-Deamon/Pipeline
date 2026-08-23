#!/usr/bin/env python3
"""
Generate TypeScript types from Backend OpenAPI Schema

This script fetches the OpenAPI schema from the running backend server
and generates TypeScript types for use in the frontend.

Usage:
    python3 scripts/generate-frontend-types.py

The generated types are written to src/types-generated.ts

NOTE (finding #120): this file was accidentally deleted entirely by a commit whose
message claimed it was "replaced by scripts/generate-frontend-types.py" — it never
was, `npm run generate:types` has been a bare ENOENT since. Restored from the last
commit that had it (a281a32).

Scope honesty: this only covers ScanState plus 3 hardcoded response schemas
(ScanResponse/ProjectResponse/ScanResultsResponse) into a separate
src/types-generated.ts that nothing in src/ currently imports from — the real,
hand-maintained src/types.ts is what the app actually uses. Running this makes the
documented command work again; it does not by itself close the broader "frontend/
backend type drift" risk the finding raised, since the generated output isn't wired
into anything yet.
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


# Populated by schema_to_typescript_type whenever it emits a bare $ref name — the
# original script referenced these (e.g. "StageResult" inside Scan.results) without
# ever defining them, which compiles fine as loose JS but is a hard `tsc` error
# (TS2304: Cannot find name) the moment this generated file is type-checked, which
# it now is via the CI workflow added for #64. Tracked here so generate_types can
# emit definitions for every referenced schema, not just the 3 top-level ones.
_referenced_schemas: set[str] = set()


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


def generate_referenced_types(schema: dict, already_emitted: set[str] | None = None) -> str:
    """Emit a definition for every schema name collected in _referenced_schemas
    (and anything *those* reference in turn), so the output never has a dangling
    reference to an undefined type name. `already_emitted` seeds names that were
    already defined by an earlier generation step (e.g. ScanState, handled
    specially by generate_scan_state_enum) so they aren't emitted a second time as
    a plain type alias, which `tsc` rejects as a duplicate identifier."""
    components = schema.get("components", {})
    schemas = components.get("schemas", {})

    emitted: set[str] = set(already_emitted or ())
    lines: list[str] = []
    worklist = list(_referenced_schemas)

    while worklist:
        name = worklist.pop()
        if name in emitted or name not in schemas:
            continue
        emitted.add(name)

        target = schemas[name]
        if "enum" in target:
            values = target["enum"]
            lines.append(f"export type {name} = {' | '.join(repr(v) for v in values)};")
            lines.append("")
            continue

        props = target.get("properties", {})
        required = set(target.get("required", []))
        before = set(_referenced_schemas)
        lines.append(f"export type {name} = {{")
        for prop_name, prop_schema in props.items():
            prop_type = schema_to_typescript_type(prop_schema)
            optional = "?" if prop_name not in required else ""
            lines.append(f"  {prop_name}{optional}: {prop_type};")
        lines.append("};")
        lines.append("")
        # Following properties may have referenced further schemas — queue those too.
        worklist.extend(_referenced_schemas - before)

    return "\n".join(lines)


def schema_to_typescript_type(schema: dict) -> str:
    """Convert OpenAPI schema type to TypeScript type."""
    if "$ref" in schema:
        # Reference to another schema
        ref = schema["$ref"]
        name = ref.split("/")[-1]
        _referenced_schemas.add(name)
        return name

    if "enum" in schema:
        # Enum type
        values = schema["enum"]
        return " | ".join(f"'{v}'" for v in values)
    
    # NOTE (finding #120): the dict-literal form this used to have built every
    # branch's value eagerly, including the "array" branch's recursive call — for
    # *every* schema, array or not, since Python evaluates all dict values at
    # construction time regardless of which key ends up being read. That recursed
    # on schema.get('items', {}) => {} => recurse on {} => {} forever, so this
    # function never actually returned for any real property; the script had never
    # successfully run even once. `ts_type` is checked first now, so the recursive
    # array branch is only ever evaluated when the schema actually is an array.
    ts_type = schema.get("type")
    if ts_type == "array":
        return f"Array<{schema_to_typescript_type(schema.get('items', {}))}>"
    type_mapping = {
        "string": "string",
        "integer": "number",
        "number": "number",
        "boolean": "boolean",
        "object": "Record<string, unknown>",
    }
    if ts_type in type_mapping:
        return type_mapping[ts_type]

    return "unknown"


def generate_types(schema: dict) -> str:
    """Generate complete TypeScript types file."""
    output = FILE_HEADER.format(url=OPENAPI_ENDPOINT)
    
    # Generate ScanState enum if available
    scan_state_values = extract_enum_from_schema(schema, "ScanState")
    already_emitted: set[str] = set()
    if scan_state_values:
        output += generate_scan_state_enum(scan_state_values)
        already_emitted.add("ScanState")

    # Generate response types
    output += generate_response_types(schema)

    # Definitions for every schema referenced above (must run after
    # generate_response_types, which is what populates _referenced_schemas)
    output += generate_referenced_types(schema, already_emitted)

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
