import { STAGE_DEPENDENCIES, type StageId } from '../types';

// Findings #103/#104: auto-added dependency stages used to be tracked as a
// separate `autoStages` Set on ManualScanPage, incrementally patched by side
// effects nested inside a `setSelectedStages` functional updater (which React
// may invoke more than once per commit under StrictMode/concurrent rendering —
// double-adding/removing entries) and never fully re-evaluated on deselect
// (deselecting a stage cleared only *that* stage's own dependents, never
// re-checking whether ITS OWN dependencies were still needed by anything else
// still selected — a shared dependency could get stuck in `autoStages` forever,
// greyed out and unremovable).
//
// This pure function replaces both bugs at the root: given only the user's own
// manual picks, it recomputes which stages are required as dependencies from
// scratch every time — nothing can go stale, and there's no incremental state
// to double-apply.
export function computeAutoStages(manual: StageId[]): Set<StageId> {
  const auto = new Set<StageId>();
  const visited = new Set<StageId>();
  const visit = (stage: StageId) => {
    if (visited.has(stage)) return;
    visited.add(stage);
    const deps = (STAGE_DEPENDENCIES[stage] || []) as StageId[];
    for (const dep of deps) {
      if (!manual.includes(dep)) auto.add(dep);
      visit(dep);
    }
  };
  manual.forEach(visit);
  return auto;
}
