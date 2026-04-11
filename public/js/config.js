/* Gameplay constants — shared with server via public/data/playerBase.json */

// Fetch is async; for simplicity we keep the import synchronous and just
// ensure the JSON stays in sync.  The server reads the same file at startup.
const _pb = await fetch("/data/playerBase.json").then(r => r.json());

export const PLAYER_BASE = _pb;