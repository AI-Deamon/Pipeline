// Run an async mapper over items with a bounded number of in-flight promises.
// Prevents pages that fan out one request per (project × tool) from firing hundreds
// of concurrent XHRs on load (e.g. the Dashboard's Team Workload tab on a large
// portfolio). Results
// are returned in the same order as `items`. Rejections propagate — wrap the mapper
// in try/catch if you want per-item tolerance.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = next++;
      if (current >= items.length) return;
      results[current] = await mapper(items[current], current);
    }
  });

  await Promise.all(workers);
  return results;
}
