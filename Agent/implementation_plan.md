# Implementation Plan: Fix Jenkins Integration & Auth Issues

## [Overview]
Fix critical bugs in the Jenkins integration pipeline and resolve bcrypt/passlib compatibility issue with Python 3.13.

## [Scope]
1. Jenkins integration bugs (already fixed in code)
2. Python 3.13 bcrypt/passlib compatibility - needs implementation

## [Types]
No type changes required.

## [Files]

### Existing Files to Modify

1. **`Agent/backend/app/core/security.py`**
   - Change password hashing from bcrypt to argon2 for Python 3.13 compatibility

2. **`Agent/backend/requirements.txt`**
   - Add argon2-cffi dependency

## [Functions]

### Modified Functions

1. **`security.py::pwd_context`**
   - Change from `CryptContext(schemes=["bcrypt"], deprecated="auto")`
   - To: `CryptContext(schemes=["argon2"], deprecated="auto")`

## [Dependencies]
- Add: `argon2-cffi>=23.1.0,<24.0.0`

## [Testing]
- Test user registration and login after fix

## [Implementation Order]
- [x] Step 1: Update requirements.txt to add argon2-cffi ✅
- [x] Step 2: Update security.py to use argon2 instead of bcrypt ✅
- [x] Step 3: Install argon2-cffi package ✅

## [Status]
ALL FIXES IMPLEMENTED! ✅

### 1. Jenkins Integration Bugs - Already Fixed:
- MODE → SCAN_MODE ✅
- name → project_name ✅
- params → data for POST ✅

### 2. Auth/BCrypt Fix - Now Fixed:
- Added argon2-cffi to requirements.txt ✅
- Updated security.py to use argon2 ✅
- Installed argon2-cffi package ✅

### 3. Registration Page - New Feature Added:
- Created RegisterPage.tsx ✅
- Added /register route in App.tsx ✅
- Added register API method in api.ts ✅
- Added link to registration from login page ✅
- Build successful ✅

