import '@testing-library/jest-dom'

// jsdom does not implement IntersectionObserver. Components that use it for
// scroll-spy behavior (e.g. UnifiedReportPage) only need it to construct
// without throwing in tests; real intersection geometry isn't exercised here.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe = () => {};
    unobserve = () => {};
    disconnect = () => {};
    takeRecords = () => [];
  }
  globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
}
