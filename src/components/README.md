# React Components

Reusable UI components used across pages.

## Component Categories

### Layout
| Component | Purpose |
|-----------|---------|
| `Layout.tsx` | Main app layout (sidebar + header + content) |
| `Breadcrumbs.tsx` | Navigation breadcrumbs |

### UI Elements
| Component | Purpose |
|-----------|---------|
| `Button.tsx` | Styled button with variants |
| `FormInput.tsx` | Form input with validation display |
| `EmptyState.tsx` | Empty state placeholder |
| `Skeleton.tsx` | Loading skeleton placeholder |
| `PageSkeleton.tsx` | Full-page loading skeleton |
| `ConfirmModal.tsx` | Confirmation dialog |
| `Toast.tsx` | Toast notification (needs integration) |

### Scan-Specific
| Component | Purpose |
|-----------|---------|
| `ScanProgressBar.tsx` | Visual scan progress with stages |
| `ScanErrorModal.tsx` | Error display with Jenkins link |
| `ErrorSuggestions.tsx` | Common causes and fixes |

### Forms
| Component | Purpose |
|-----------|---------|
| `ProjectForm.tsx` | Project creation/edit form |

### Auth & Navigation
| Component | Purpose |
|-----------|---------|
| `ProtectedRoute.tsx` | Auth route wrapper |

## Component Rules
- **Under 300 lines each** - Split if larger
- **Named exports** - For reusable components
- **Default exports** - Only for pages
- **Props typed** - No `any` in prop types
- **memo()** - Used for frequently re-rendering components

## Connection to Other Modules
- Use hooks from `src/hooks/` for logic
- Call services from `src/services/api.ts` for data
- Use types from `src/types.ts` for prop definitions
- Imported by pages in `src/pages/`
