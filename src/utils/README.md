# Utilities

Helper functions and shared logic.

## Utilities

| File | Purpose |
|------|---------|
| `apiError.ts` | API error handling and formatting |

## API Error Handling
- Extracts error messages from API responses
- Formats errors for display
- Handles network errors vs HTTP errors
- Type-safe error extraction

## Connection to Other Modules
- Used by services for error processing
- Used by hooks for mutation error handling
- Displayed by components (ErrorSuggestions, ScanErrorModal)
