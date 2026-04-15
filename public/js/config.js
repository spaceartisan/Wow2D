/* Gameplay constants — shared with server via public/data/playerBase.json */

// Fetch is async; for simplicity we keep the import synchronous and just
// ensure the JSON stays in sync.  The server reads the same file at startup.
const _pb = await fetch("/data/playerBase.json").then(r => r.json());

export const PLAYER_BASE_DATA = _pb;
export const CLASSES = _pb.classes || {};

// Helper: resolve a class's effective stat (class override → defaults fallback)
export function classStats(classId) {
  const cls = CLASSES[classId] || {};
  return { ..._pb.defaults, ...cls };
}

// Backward compat: PLAYER_BASE points to defaults
export const PLAYER_BASE = _pb.defaults;