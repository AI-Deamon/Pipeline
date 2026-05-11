## 2026-02-10 - Optimized Scan Status Polling and Re-renders

**Learning:** `JSON.stringify` is a convenient but inefficient way to perform deep equality checks in frequently executing code (like polling loops). While acceptable for tiny arrays, it's a performance anti-pattern for larger or more complex datasets because of the serialization overhead on every tick.

**Action:** Prefer manual property-based comparison or specialized deep equality libraries when checking if API response data has changed to prevent redundant React state updates.

**Learning:** `useEffect` dependency arrays containing objects/arrays that are updated *within* the effect (directly or indirectly) can cause infinite loops or redundant effect restarts.

**Action:** Always verify that state updates within an effect don't inadvertently trigger the same effect again. Use functional updates or separate effects to isolate different data-fetching concerns.

## 2026-02-12 - Parallelizing Polling and Object Reference Stability

**Learning:** Sequential `await` calls in polling loops create a cumulative network bottleneck. Parallelizing with `Promise.all` can significantly reduce the "active" time of each poll tick. Furthermore, returning a new array from a state setter (like `setResults`) triggers re-renders for all list children unless object references for individual unchanged items are preserved, even if the child components are wrapped in `React.memo`.

**Action:** Use `Promise.all` for independent API calls in effects. When updating lists in state, map over the new data and keep references to old objects if their properties haven't changed to maximize the effectiveness of `React.memo`.

## 2026-02-18 - Consolidating API Calls for Polling Efficiency
**Learning:** While parallelizing independent API calls with `Promise.all` is better than sequential calls, the most efficient approach for high-frequency polling is to consolidate related data into a single API response. This reduces network overhead (fewer HTTP handshakes, smaller total header overhead) and simplifies client-side state management.
**Action:** When a client consistently needs multiple pieces of data together (e.g., scan metadata and scan results), update the backend schema and API to return them in a single response. This cuts the number of polling requests by half.
## 2026-02-16 - Reference Stability in Polling
**Learning:** Returning a new object reference in a React state setter *always* triggers a re-render, even if the data is identical. In polling views, this can lead to massive CPU waste as the entire page and its children re-render every few seconds.
**Action:** Use reference-preserving diffing in state setters (`setResults(prev => ...)`). Only return a new array/object if data has actually changed, and reuse existing object references for unchanged items in a list to enable `React.memo` to skip child re-renders.

## 2026-02-16 - Parallelizing Polling Requests
**Learning:** Sequential `await` calls in a polling loop multiply network latency. If you fetch status then results, the total time is sum of both, which can delay the UI update.
**Action:** Use `Promise.all` to fire independent API requests in parallel, reducing the total latency per polling tick to the slowest single request.

## 2026-02-17 - Search Debouncing and Memoized Filtering
**Learning:** Filtering large lists on every keystroke causes cumulative UI lag as the number of items grows. Debouncing the search term by 300ms significantly reduces CPU usage and re-renders during user input. Combining this with `useMemo` for the filtered list and `React.memo` for individual list items ensures that typing only causes a single "heavy" render after the user stops, and that unchanged items don't re-render unnecessarily.
**Action:** Implement a generic `useDebounce` hook for all search inputs. Always wrap search-based list filtering in `useMemo` and use `React.memo` for list items to maintain UI responsiveness.

## 2026-02-20 - Connection Pooling for External Service Clients
**Learning:** Initializing a new TCP connection for every HTTP request is expensive, especially for internal services or APIs called frequently (like Jenkins). The `requests` library in Python creates a new session (and thus a new connection) for every call to `requests.request()`.
**Action:** Use `requests.Session()` within service clients to enable connection pooling. This allows the reuse of underlying TCP connections, reducing latency and resource consumption significantly for sequential requests to the same host.

## 2026-03-02 - Optimized list_scans N+1 queries and batch commits
**Learning:** The `list_scans` endpoint previously triggered an individual project lookup for every scan to check for timeouts, leading to an N+1 query bottleneck. Additionally, every timed-out scan triggered a separate `db.commit()`, causing significant I/O overhead.
**Action:** Use batch project fetching (`.in_(project_ids)`) to resolve N+1 queries. Refactor timeout helpers to support an `auto_commit=False` flag, allowing all scan state transitions to be persisted in a single database transaction at the end of the loop.
