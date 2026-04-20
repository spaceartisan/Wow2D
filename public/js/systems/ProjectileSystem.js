/**
 * ProjectileSystem – manages visual projectiles that travel from source to target.
 *
 * Usage:
 *   this.projectiles.spawn({ ... });      // launch a projectile
 *   this.projectiles.update(dt);          // call each frame
 *   this.projectiles.draw(ctx, camera);   // draw after entities, before particles
 */
export class ProjectileSystem {
  constructor(game) {
    this.game = game;
    /** @type {Array} active projectiles */
    this._projectiles = [];
    /** Cached sprite images keyed by path */
    this._spriteCache = new Map();
  }

  /**
   * Pre-load a sprite image and cache it.
   * @param {string} src – image path (e.g. "assets/sprites/entities/arrow.png")
   * @returns {HTMLImageElement|null}
   */
  _getSprite(src) {
    if (!src) return null;
    let img = this._spriteCache.get(src);
    if (img) return img.complete ? img : null;
    img = new Image();
    img.src = src;
    this._spriteCache.set(src, img);
    return null; // not ready yet, will be available next frame
  }

  /**
   * Spawn a projectile that travels from (sx,sy) toward a target entity or point.
   * @param {Object} opts
   * @param {number} opts.sx – start world X
   * @param {number} opts.sy – start world Y
   * @param {number} opts.tx – target world X
   * @param {number} opts.ty – target world Y
   * @param {string} [opts.targetId] – enemy ID to track (projectile homes on entity)
   * @param {number} opts.speed – pixels per second
   * @param {string} [opts.color] – projectile color (default "#f5df8e")
   * @param {number} [opts.size] – projectile radius (default 4)
   * @param {string} [opts.trail] – trail color (default same as color)
   * @param {string} [opts.sprite] – path to a sprite image (drawn rotated to travel direction)
   * @param {number} [opts.spriteW] – render width for sprite (default: natural width)
   * @param {number} [opts.spriteH] – render height for sprite (default: natural height)
   * @param {Function} [opts.onHit] – callback when projectile reaches target
   */
  spawn(opts) {
    const dx = opts.tx - opts.sx;
    const dy = opts.ty - opts.sy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // Pre-load the sprite image if provided
    if (opts.sprite) this._getSprite(opts.sprite);

    this._projectiles.push({
      x: opts.sx,
      y: opts.sy,
      tx: opts.tx,
      ty: opts.ty,
      targetId: opts.targetId || null,
      targetPlayerId: opts.targetPlayerId || null,
      dirX: dx / dist,
      dirY: dy / dist,
      speed: opts.speed || 300,
      color: opts.color || "#f5df8e",
      size: opts.size || 4,
      trail: opts.trail || opts.color || "#f5df8e",
      sprite: opts.sprite || null,
      spriteW: opts.spriteW || 0,
      spriteH: opts.spriteH || 0,
      onHit: opts.onHit || null,
      // trail history (last 6 positions)
      history: [],
      alive: true
    });
  }

  /**
   * Advance all projectiles. Homing projectiles track their target entity.
   * @param {number} dt – seconds since last frame
   */
  update(dt) {
    const projectiles = this._projectiles;
    let write = 0;

    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (!p.alive) continue;

      // If tracking a living enemy, update target position
      if (p.targetId) {
        const enemy = this.game.entities.getEnemyById(p.targetId);
        if (enemy && !enemy.dead) {
          p.tx = enemy.x;
          p.ty = enemy.y;
          // Recalculate direction
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          p.dirX = dx / dist;
          p.dirY = dy / dist;
        }
      }

      // If tracking a player (PVP), update target position
      if (p.targetPlayerId) {
        const tp = this.game.entities.remotePlayers.find(rp => rp.id === p.targetPlayerId)
          || (this.game.entities.player && this.game.entities.player.id === p.targetPlayerId ? this.game.entities.player : null);
        if (tp && !tp.dead) {
          p.tx = tp.x;
          p.ty = tp.y;
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          p.dirX = dx / dist;
          p.dirY = dy / dist;
        }
      }

      // Store trail position
      p.history.push({ x: p.x, y: p.y });
      if (p.history.length > 6) p.history.shift();

      // Move
      const step = p.speed * dt;
      p.x += p.dirX * step;
      p.y += p.dirY * step;

      // Check if arrived at target
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const distSq = dx * dx + dy * dy;
      const hitRadius = p.size + 8; // generous hit area

      if (distSq <= hitRadius * hitRadius || step * step >= distSq) {
        // Arrived — fire callback
        if (p.onHit) p.onHit();
        p.alive = false;
        continue;
      }

      projectiles[write++] = p;
    }

    projectiles.length = write;
  }

  /**
   * Render all active projectiles.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x: number, y: number}} camera
   */
  draw(ctx, camera) {
    if (this._projectiles.length === 0) return;

    const prevAlpha = ctx.globalAlpha;
    const prevBlend = ctx.globalCompositeOperation;

    for (const p of this._projectiles) {
      const sx = p.x - camera.x;
      const sy = p.y - camera.y;

      // ── Sprite-based projectile ──
      const spriteImg = p.sprite ? this._getSprite(p.sprite) : null;
      if (spriteImg) {
        // Draw a subtle trail behind sprite projectiles
        if (p.history.length > 1) {
          ctx.globalCompositeOperation = "lighter";
          for (let t = 0; t < p.history.length; t++) {
            const h = p.history[t];
            const alpha = (t + 1) / (p.history.length + 1) * 0.15;
            const sz = p.size * 0.6;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.trail;
            ctx.beginPath();
            ctx.arc(h.x - camera.x, h.y - camera.y, sz, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // The arrow sprite faces UP (−Y), so rotation 0 = travelling up.
        // atan2(dirY, dirX) gives angle from +X axis; subtract π/2 to align.
        const angle = Math.atan2(p.dirY, p.dirX) + Math.PI / 2;
        const w = p.spriteW || spriteImg.naturalWidth;
        const h = p.spriteH || spriteImg.naturalHeight;

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(spriteImg, -w / 2, -h / 2, w, h);
        ctx.restore();
        continue;
      }

      // ── Glow-circle projectile (original) ──

      // Draw trail
      if (p.history.length > 1) {
        ctx.globalCompositeOperation = "lighter";
        for (let t = 0; t < p.history.length; t++) {
          const h = p.history[t];
          const alpha = (t + 1) / (p.history.length + 1) * 0.4;
          const size = p.size * (t + 1) / (p.history.length + 1);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.trail;
          ctx.beginPath();
          ctx.arc(h.x - camera.x, h.y - camera.y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw projectile body (bright glow)
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevBlend;
  }

  /** Clear all projectiles (on map change). */
  clear() {
    this._projectiles.length = 0;
  }
}
