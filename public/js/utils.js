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