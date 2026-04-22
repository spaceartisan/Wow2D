export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const distance = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.hypot(dx, dy);
};

export const randRange = (min, max) => Math.random() * (max - min) + min;

export const randInt = (min, max) => Math.floor(randRange(min, max + 1));

export const chance = (probability) => Math.random() < probability;

export const normalize = (x, y) => {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
};

export const tileKey = (x, y) => `${x},${y}`;

export const formatSeconds = (seconds) => `${seconds.toFixed(1)}s`;

// Sprite rotation helpers.
// Our entity sprites are authored facing DOWN (+Y). To make a sprite face the
// vector (dx, dy), rotate the canvas by atan2(-dx, dy) before drawing.
export const facingAngleFromVector = (dx, dy) => {
  if (!dx && !dy) return 0;
  return Math.atan2(-dx, dy);
};

// Convert a facing string from JSON (e.g. npcs.json) into a sprite rotation.
// Supports 8 cardinal/intercardinal directions. Unknown values fall back to "down".
export const facingAngleFromString = (facing) => {
  switch (String(facing || "").toLowerCase()) {
    case "up":         return Math.PI;
    case "down":       return 0;
    case "left":       return Math.PI / 2;
    case "right":      return -Math.PI / 2;
    case "up-left":
    case "upleft":     return 3 * Math.PI / 4;
    case "up-right":
    case "upright":    return -3 * Math.PI / 4;
    case "down-left":
    case "downleft":   return Math.PI / 4;
    case "down-right":
    case "downright":  return -Math.PI / 4;
    default:           return 0;
  }
};