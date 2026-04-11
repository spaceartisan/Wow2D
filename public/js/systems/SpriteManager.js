/**
 * SpriteManager — preloads and caches all PNG sprites.
 * Usage:
 *   const sprites = new SpriteManager();
 *   await sprites.load();
 *   const img = sprites.get("tiles/meadow");    // HTMLImageElement
 *   const img = sprites.get("entities/wolf");
 */
export class SpriteManager {
  constructor() {
    /** @type {Map<string, HTMLImageElement>} */
    this._cache = new Map();
    this._basePath = "/assets/sprites";
  }

  /**
   * Preload all required sprites. Call once during game init.
   * Fetches the sprite manifest, then loads every image in parallel.
   */
  async load(tilePalette, enemyIds, npcIds, itemIds) {
    const promises = [];

    // Tiles — one per palette entry
    for (const name of Object.keys(tilePalette)) {
      promises.push(this._loadOne(`tiles/${name}`));
    }

    // Enemies
    for (const id of enemyIds) {
      promises.push(this._loadOne(`entities/${id}`));
    }

    // NPCs
    for (const id of npcIds) {
      promises.push(this._loadOne(`entities/${id}`));
    }

    // Players (class variants + local + dead)
    for (const key of ["player_warrior", "player_mage", "player_rogue", "player_local", "player_dead"]) {
      promises.push(this._loadOne(`entities/${key}`));
    }

    // Drop
    promises.push(this._loadOne("entities/drop"));

    // Portal
    promises.push(this._loadOne("props/portal"));

    // Trees
    for (const variant of ["tree_default", "tree_dark", "tree_light", "tree_autumn"]) {
      promises.push(this._loadOne(`props/${variant}`));
    }

    // Ambient props
    for (const prop of ["flower", "mushroom", "rock"]) {
      promises.push(this._loadOne(`props/${prop}`));
    }

    // Item icons
    if (itemIds) {
      for (const id of itemIds) {
        promises.push(this._loadOne(`icons/${id}`));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Get a cached sprite image.
   * @param {string} key - e.g. "tiles/meadow", "entities/wolf"
   * @returns {HTMLImageElement|null}
   */
  get(key) {
    return this._cache.get(key) || null;
  }

  /** @private */
  _loadOne(key) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this._cache.set(key, img);
        resolve(img);
      };
      img.onerror = () => {
        console.warn(`SpriteManager: failed to load ${key}`);
        resolve(null); // don't block on missing sprites
      };
      img.src = `${this._basePath}/${key}.png`;
    });
  }
}
