/**
 * Finding #39: tool-supplied reference URLs (parser output, potentially derived
 * from a target-under-test's response content) were rendered as `<a href>` with
 * no scheme check. A non-http(s) value — e.g. a `javascript:` string reflected
 * into a ZAP finding — would execute in the Sentinel origin on click.
 */
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
