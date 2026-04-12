/**
 * ParticleSystem – lightweight 2D particle emitter & renderer.
 *
 * Usage:
 *   await this.particles.load();          // load presets from particles.json
 *   this.particles.emit("hit_spark", x, y);  // burst at world position
 *   this.particles.update(dt);            // call each frame
 *   this.particles.draw(ctx, camera);     // draw after entities
 */
export class ParticleSystem {
  constructor(game) {
    this.game = game;
    /** @type {Object<string, Object>} preset name → config */
    this.presets = {};
    /** @type {Array} live particle pool */
    this._particles = [];
    /** Hard cap to prevent runaway allocations */
    this._maxParticles = 2000;
  }

  async load() {
    const res = await fetch("/data/particles.json");
    this.presets = await res.json();
  }

  /**
   * Spawn a burst of particles at a world position.
   * @param {string} presetName – key in particles.json
   * @param {number} wx – world X
   * @param {number} wy – world Y
   * @param {Object} [overrides] – per-call overrides (e.g. { count: [1,2] })
   */
  emit(presetName, wx, wy, overrides) {
    const preset = this.presets[presetName];
    if (!preset) return;

    const cfg = overrides ? { ...preset, ...overrides } : preset;
    const count = this._rand(cfg.count[0], cfg.count[1]) | 0;
    const colors = cfg.color;

    for (let i = 0; i < count; i++) {
      if (this._particles.length >= this._maxParticles) break;

      const angleDeg = this._rand(cfg.angle[0], cfg.angle[1]);
      const angleRad = angleDeg * Math.PI / 180;
      const speed = this._rand(cfg.speed[0], cfg.speed[1]);
      const life = this._rand(cfg.lifetime[0], cfg.lifetime[1]);
      const size = this._rand(cfg.size[0], cfg.size[1]);

      this._particles.push({
        x: wx,
        y: wy,
        vx: Math.cos(angleRad) * speed,
        vy: Math.sin(angleRad) * speed,
        life,
        maxLife: life,
        size,
        sizeEnd: cfg.sizeEnd ?? 0,
        color: colors[(Math.random() * colors.length) | 0],
        gravity: cfg.gravity || 0,
        friction: cfg.friction ?? 1,
        fadeOut: cfg.fadeOut !== false,
        blendMode: cfg.blendMode || "source-over"
      });
    }
  }

  /**
   * Advance all live particles.
   * @param {number} dt – seconds since last frame
   */
  update(dt) {
    const particles = this._particles;
    let write = 0;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) continue;

      p.vy += p.gravity * dt;
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      particles[write++] = p;
    }

    particles.length = write;
  }

  /**
   * Render all live particles to the canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x: number, y: number}} camera
   */
  draw(ctx, camera) {
    if (this._particles.length === 0) return;

    const prevAlpha = ctx.globalAlpha;
    const prevBlend = ctx.globalCompositeOperation;

    // Group draws by blend mode to minimize state changes
    // Most particles use "lighter", so batch them
    let currentBlend = null;

    for (let i = 0; i < this._particles.length; i++) {
      const p = this._particles[i];
      const t = 1 - p.life / p.maxLife; // 0 → 1 over lifetime
      const size = p.size + (p.sizeEnd - p.size) * t;
      if (size <= 0) continue;

      const alpha = p.fadeOut ? p.life / p.maxLife : 1;
      const sx = p.x - camera.x;
      const sy = p.y - camera.y;

      if (p.blendMode !== currentBlend) {
        currentBlend = p.blendMode;
        ctx.globalCompositeOperation = currentBlend;
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(sx - size * 0.5, sy - size * 0.5, size, size);
    }

    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevBlend;
  }

  /** Clear all particles (map change, etc.) */
  clear() {
    this._particles.length = 0;
  }

  /** @private */
  _rand(min, max) {
    return min + Math.random() * (max - min);
  }
}
