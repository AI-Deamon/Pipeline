# Pydantic Schemas

Request and response validation schemas using Pydantic BaseModel.

## Schemas
| Schema | Purpose |
|--------|---------|
| `ScanCreate` | Request body for triggering a scan |
| `ScanResponse` | Full scan object returned to client |
| `ScanResultsResponse` | Stage results with summary |
| `ScanCancelResponse` | Response for cancel endpoint |
| `ScanHistoryResponse` | Scan record in project history |
| `ScanError` | Error details object |
| `ProjectCreate` | Request body for creating a project |
| `ProjectResponse` | Full project object returned to client |

## Validation Rules
- Scan mode must be AUTOMATED or MANUAL
- Selected stages must be in VALID_STAGES list
- Stage dependencies must be satisfied
- Project must not have active scan when triggering new one

## Connection to Other Modules
- Used by `app.api.*` for request validation and response serialization
- References types from `app.models.*` and `app.state.scan_state`
- Used by frontend TypeScript types as source of truth
