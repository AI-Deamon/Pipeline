# Palette's Journal 🎨

## 2025-05-21 - Accessible Password Toggle
**Learning:** Password visibility toggles are a critical micro-UX win that improves both accessibility (allowing users to verify input) and usability. When implementing them, it is essential to use `type="button"` to prevent accidental form submission and provide clear `aria-label` updates for screen readers. Using decorative icons like `Eye` and `EyeOff` should always be accompanied by `aria-hidden="true"` if they are inside a button with a descriptive label.
**Action:** Always include a password visibility toggle for any password input fields, ensuring full keyboard and screen reader support.
