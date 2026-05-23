# Infrastructure Layer

External service integrations and HTTP clients.

## Modules
| Module | Purpose |
|--------|---------|
| `http/client.py` | HTTP client wrapper for external API calls |
| `jenkins/jenkins_client.py` | Jenkins API client wrapper |

## Jenkins Client
- Authenticates with Jenkins server
- Triggers pipeline builds
- Retrieves build status and console output
- Handles Jenkins CSRF crumb requirements

## HTTP Client
- Generic HTTP request wrapper
- Handles timeouts, retries
- JSON request/response serialization
- Error handling for non-2xx responses

## Connection to Other Modules
- Used by `app.services.jenkins_service`
- Called by `app.tasks.jenkins_tasks`
- Configuration from `app.core.config`
