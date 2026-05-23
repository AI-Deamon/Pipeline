# Backend Tests

pytest test suite for the Python FastAPI backend.

## Test Structure
```
tests/
├── test_integration.py     # Integration tests
├── test_concurrent_scans.py # Concurrent scan handling tests
└── ...                      # Additional test files
```

## Running Tests
```bash
pytest tests/               # Run all tests
pytest tests/test_integration.py::test_integration_v1  # Run single test
pytest -v                   # Verbose output
pytest --tb=short           # Shorter tracebacks
```

## Test Patterns
- Use `fastapi.testclient.TestClient` for API testing
- Mock external services: `unittest.mock.patch`
- Database isolation: Each test gets clean DB state
- Mock Jenkins API calls - never hit real Jenkins in tests

## What's Tested
- API endpoint request/response validation
- Authentication and authorization
- Scan trigger and callback flow
- Concurrent scan prevention
- Error handling and edge cases
- Database constraint enforcement

## Test Environment
- Uses `.env.test` configuration
- Isolated test database
- Mocked external service calls (Jenkins, etc.)
