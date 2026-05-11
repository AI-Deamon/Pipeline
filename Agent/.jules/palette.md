## 2025-05-15 - Playwright Strict Mode & Label Targeting
**Learning:** When using Playwright's `get_by_label`, it may resolve to multiple elements if interactive elements (like a password toggle button) are nested near or associated with the label. Using specific ID selectors or `page.locator("label[for='...']")` is more robust.
**Action:** Use specific ID selectors for form inputs in Playwright scripts when interactive decorators are present.

## 2025-05-16 - [Standard Accessible Modal Pattern]
**Learning:** Modals require more than just a center-aligned `div`. They must have `role="dialog"`, `aria-modal="true"`, and descriptive labels via `aria-labelledby`/`aria-describedby`. Critical interactions include closing via Backdrop click, Escape key, and an explicit close button.
**Action:** Always implement the "holy trinity" of modal dismissal (Backdrop, Escape, Close Button) and ensure correct ARIA roles and labels are present for screen readers.

## 2025-05-17 - [Interactive Feedback and Form Accessibility]
**Learning:** Micro-interactions like "Copy to Clipboard" need immediate visual feedback (e.g., icon swap) to confirm success to the user. Additionally, standardizing form accessibility by using explicit `id` and `htmlFor` mappings is critical for screen reader compatibility and better tap targets on mobile.
**Action:** Use a temporary state (e.g., `copiedField`) to toggle between `Copy` and `Check` icons for 2 seconds after a successful copy. Always ensure every form input has a unique `id` linked to its label's `htmlFor`.

## 2025-05-18 - [Password Visibility Toggle for Improved Error Correction]
**Learning:** Adding a visibility toggle to password fields significantly reduces friction during login by allowing users to verify their input before submission. Using a `type="button"` ensures the toggle does not accidentally trigger form submission.
**Action:** Always include a visibility toggle for sensitive inputs using `Eye`/`EyeOff` icons and dynamic `aria-label` attributes for screen reader clarity.
