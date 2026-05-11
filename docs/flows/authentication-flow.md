# Authentication Flow

Complete authentication flow including user registration, login, token management, and request interception.

---

## 1. User Registration Flow

### UI Flow

```
User visits /register
       │
       ▼
┌─────────────────────────────────┐
│ RegisterPage.tsx                │
│ ┌───────────────────────────┐  │
│ │ Username: [alice________] │  │
│ │ Password: [••••••••••••] │  │
│ │                           │  │
│ │ [Register] [Cancel]       │  │
│ └───────────────────────────┘  │
└─────────────────────────────────┘
       │
       │ User fills form, clicks "Register"
       ▼
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "alice",
  "password": "secret123",
  "email": "alice@example.com"  // Auto-generated if not provided
}
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Backend: auth.py::register()                                    │
│                                                                 │
│ 1. Check username collision                                     │
│    db.query(UserDB).filter(UserDB.username == "alice").first() │
│    → If exists: HTTP 400 "Username already registered"         │
│                                                                 │
│ 2. Hash password with Argon2                                    │
│    hashed = security.get_password_hash("secret123")            │
│    → "$argon2id$v=19$m=65536,t=3,p=4$..."                     │
│                                                                 │
│ 3. Create UserDB                                                │
│    UserDB(                                                     │
│      id="uuid-123-abc",                                        │
│      username="alice",                                         │
│      hashed_password="$argon2id$..."                           │
│    )                                                           │
│                                                                 │
│ 4. Commit to PostgreSQL                                         │
│    db.add(user)                                                │
│    db.commit()                                                 │
│    db.refresh(user)                                            │
│                                                                 │
│ 5. Return UserResponse                                          │
│    {                                                           │
│      "username": "alice",                                      │
│      "id": "uuid-123-abc",                                     │
│      "created_at": "2026-04-13T10:00:00Z"                      │
│    }                                                           │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
Frontend receives response
       │
       ▼
Redirect to /login with success message
state: { message: "Registration successful! Please login." }
       │
       ▼
┌─────────────────────────────────┐
│ LoginPage.tsx                   │
│                                 │
│ ✅ Registration successful!     │
│    Please login.                │
│                                 │
│ ┌───────────────────────────┐  │
│ │ Username: [alice________] │  │
│ │ Password: [••••••••••••] │  │
│ │                           │  │
│ │ [Login] [Register]        │  │
│ └───────────────────────────┘  │
└─────────────────────────────────┘
```

### Database State

```sql
INSERT INTO users (id, username, hashed_password, created_at, updated_at)
VALUES (
  'uuid-123-abc',
  'alice',
  '$argon2id$v=19$m=65536,t=3,p=4$...',
  '2026-04-13T10:00:00Z',
  '2026-04-13T10:00:00Z'
);
```

### Key Files
- Frontend: `src/pages/RegisterPage.tsx`, `src/services/api.ts`
- Backend: `backend/app/api/auth.py`, `backend/app/core/security.py`
- Database: `backend/app/models/db_models.py::UserDB`

---

## 2. User Login Flow

### UI Flow

```
User on /login
       │
       ▼
┌─────────────────────────────────┐
│ LoginPage.tsx                   │
│                                 │
│ ┌───────────────────────────┐  │
│ │ Username: [alice________] │  │
│ │ Password: [••••••••••••] │  │
│ │                           │  │
│ │ [Login] [Register]        │  │
│ └───────────────────────────┘  │
└─────────────────────────────────┘
       │
       │ User fills form, clicks "Login"
       ▼
POST /api/v1/auth/login
Content-Type: application/x-www-form-urlencoded

username=alice&password=secret123
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Backend: auth.py::login_for_access_token()                      │
│                                                                 │
│ 1. Query user by username                                       │
│    user = db.query(UserDB).filter(UserDB.username == "alice")  │
│         .first()                                                │
│                                                                 │
│ 2. Verify password with Argon2                                  │
│    if not user or not security.verify_password(                │
│        "secret123", user.hashed_password):                     │
│      → HTTP 401 "Incorrect username or password"               │
│         headers: { "WWW-Authenticate": "Bearer" }              │
│                                                                 │
│ 3. Create JWT access token                                      │
│    access_token = security.create_access_token(                │
│      data={"sub": "alice"},                                    │
│      expires_delta=timedelta(minutes=30)                        │
│    )                                                           │
│                                                                 │
│    JWT Payload:                                                │
│    {                                                           │
│      "sub": "alice",                                           │
│      "exp": 1713016800,  // now + 30 minutes                   │
│      "iat": 1713015000   // issued at                          │
│    }                                                           │
│                                                                 │
│ 4. Return TokenResponse                                         │
│    {                                                           │
│      "access_token": "eyJhbGciOiJIUzI1NiIs...",               │
│      "token_type": "bearer"                                    │
│    }                                                           │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
Frontend receives token
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ useAuth.tsx::login(token)                                       │
│                                                                 │
│ 1. sessionStorage.setItem('token', 'eyJhbGci...')               │
│ 2. setToken('eyJhbGci...')  // React state update               │
│ 3. isAuthenticated becomes true (!!token)                       │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
ProtectedRoute allows access
       │
       ▼
Redirect to /dashboard
       │
       ▼
All future requests include:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
  X-API-Key: z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4
```

### Request Interceptor

Every outgoing request passes through `src/services/api.ts`:

```typescript
apiClient.interceptors.request.use((config) => {
  // JWT token (from session storage)
  const token = sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // API key (for service-to-service auth, e.g., Jenkins callback)
  const apiKey = sessionStorage.getItem('API_KEY') || import.meta.env.VITE_API_KEY;
  if (apiKey) {
    config.headers['X-API-Key'] = apiKey;
  }

  return config;
});
```

### Response Error Handler

```typescript
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    throw ApiError.fromAxiosError(error);
  }
);
```

### Token Lifecycle

| Event | Action |
|-------|--------|
| Login | Token stored in sessionStorage, set in React state |
| API Request | Interceptor adds `Authorization: Bearer <token>` |
| Token Expiry | 30 minutes after issuance (JWT `exp` claim) |
| Logout | Token removed from sessionStorage, state cleared |
| Page Refresh | Token read from sessionStorage on app init |

### Protected Routes

```typescript
// App.tsx
<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
  <Route path="/dashboard" element={<DashboardPage />} />
  <Route path="/projects/:projectId" element={<ProjectControlPage />} />
  <Route path="/scans/:scanId" element={<ScanStatusPage />} />
  ...
</Route>
```

**ProtectedRoute Component** checks `useAuth().isAuthenticated`:
- If false → Redirect to `/login`
- If true → Render children (Layout + routes)

### Public Endpoints (No Auth Required)

Defined in `backend/app/main.py`:

```python
PUBLIC_ENDPOINTS = [
    "/api/v1/auth/login",      # Login
    "/api/v1/auth/register",   # Register
    "/",                       # Health check
    "/docs",                   # Swagger UI
    "/redoc",                  # ReDoc
    "/openapi.json",           # OpenAPI spec
    "/api/v1/ws"               # WebSocket (auth via query params)
]
```

All other endpoints require valid JWT token via `Depends(get_current_user)`.

---

## 3. JWT Token Structure

### Token Creation (`backend/app/core/security.py`)

```python
def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
```

**Configuration:**
- Algorithm: `HS256`
- Access token expiry: `ACCESS_TOKEN_EXPIRE_MINUTES = 30`
- Secret key: From environment variable

### Token Validation

```python
def get_current_user(
    token: str = Depends(OAuth2PasswordBearer(tokenUrl="login"))
) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(401, "Invalid token")
    except JWTError:
        raise HTTPException(401, "Invalid token")

    user = db.query(UserDB).filter(UserDB.username == username).first()
    if user is None:
        raise HTTPException(401, "User not found")

    return user
```

---

## 4. Password Security

### Hashing Algorithm: Argon2

**Why Argon2 (not bcrypt)?**
- Python 3.13 compatibility (bcrypt had issues)
- Memory-hard function (resistant to GPU attacks)
- Winner of Password Hashing Competition (2015)

**Implementation:**

```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
```

---

## 5. Authentication Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  REGISTRATION                                                         │
│                                                                       │
│  User → POST /auth/register → Hash(Argon2) → Store UserDB → Success  │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LOGIN                                                               │
│                                                                       │
│  User → POST /auth/login → Verify(Argon2) → JWT(HS256) → Token      │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  SESSION MANAGEMENT                                                  │
│                                                                       │
│  Frontend: sessionStorage.setItem('token', token)                    │
│  Interceptor: Authorization: Bearer <token>                          │
│  Backend: get_current_user() → JWT.decode() → UserDB lookup          │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PROTECTED ROUTES                                                    │
│                                                                       │
│  /dashboard, /projects/*, /scans/* → Requires valid JWT              │
│  /auth/*, /docs, /ws → Public (no auth)                              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Security Considerations

| Aspect | Implementation |
|--------|---------------|
| **Password Storage** | Argon2 hashing (memory-hard, competition winner) |
| **Token Storage** | sessionStorage (cleared on tab close, not persistent) |
| **Token Expiry** | 30 minutes (balance between UX and security) |
| **Token Transmission** | Bearer token in Authorization header |
| **API Key** | Separate `X-API-Key` header for service-to-service auth |
| **CORS** | Configured origins only (`settings.CORS_ORIGINS`) |
| **Rate Limiting** | SlowAPI on endpoints (10/min for scans, 1000/min for tests) |
| **Callback Auth** | `X-Callback-Token` header for Jenkins webhook validation |

---

## 7. Error Scenarios

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Username already exists | 400 | `"Username already registered"` |
| Wrong password | 401 | `"Incorrect username or password"` |
| Invalid JWT | 401 | `"Invalid token"` |
| User not found (JWT valid but user deleted) | 401 | `"User not found"` |
| Expired JWT | 401 | JWT decode fails → `"Invalid token"` |
| Missing token on protected route | 401 | OAuth2PasswordBearer raises |

---

*Generated: 2026-04-13 | Files: auth.py, security.py, useAuth.tsx, api.ts*
