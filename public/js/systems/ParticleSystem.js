/**
 * ParticleSystem – lightweight 2D particle emitter & renderer.
 *
 * Supports two emission modes:
 *  1. **Burst** (one-shot): `emit("hit_spark", x, y)` – spawns a batch of particles instantly.
 *  2. **Continuous**: `emitContinuous(id, "fire", x, y)` – spawns particles at a fixed rate
 *     until stopped with `stopContinuous(id)` or the optional `duration` expires.
 *
 * Continuous emitters are identified by a caller-supplied string id so they can be
 * moved (`moveContinuous`), stopped, or checked (`hasContinuous`).
 *
 * Usage:
 *   await this.particles.load();                      // load presets from particles.json
 *   this.particles.emit("hit_spark", x, y);           // burst at world position
 *   this.particles.emitContinuous("campfire", "fire", x, y);  // looping emitter
 *   this.particles.moveContinuous("campfire", x2, y2);        // reposition
 *   this.particles.stopContinuous("campfire");                 // stop
 *   this.particles.update(dt);                        // call each frame
 *   this.particles.draw(ctx, camera);                 // draw after entities
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

    /**
     * Active continuous emitters.
     * Map<id, { preset, x, y, rate, elapsed, duration, age }>
     *   rate     – seconds between bursts (from preset.emitInterval or 0.15)
     *   elapsed  – time accumulator since last burst
     *   duration – total lifetime in seconds (Infinity = until manually stopped)
     *   age      – seconds since created
     */
    this._emitters = new Map();
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

  // ── Continuous emitter API ──────────────────────────────────────────

  /**
   * Start a continuous particle emitter at a world position.
   * @param {string} id – unique caller-supplied identifier
   * @param {string} presetName – key in particles.json (must exist)
   * @param {number} wx – world X
   * @param {number} wy – world Y
   * @param {Object} [opts]
   * @param {number} [opts.duration] – seconds to emit (default Infinity)
   * @param {number} [opts.rate] – override seconds between bursts
   * @param {Object} [opts.overrides] – per-emit preset overrides
   */
  emitContinuous(id, presetName, wx, wy, opts = {}) {
    const preset = this.presets[presetName];
    if (!preset) return;
    this._emitters.set(id, {
      preset: presetName,
      x: wx,
      y: wy,
      rate: opts.rate ?? preset.emitInterval ?? 0.15,
      elapsed: 999,       // emit immediately on first frame
      duration: opts.duration ?? Infinity,
      age: 0,
      overrides: opts.overrides || null
    });
  }

  /**
   * Move an existing continuous emitter to a new position.
   * @param {string} id
   * @param {number} wx
   * @param {number} wy
   */
  moveContinuous(id, wx, wy) {
    const e = this._emitters.get(id);
    if (e) { e.x = wx; e.y = wy; }
  }

  /**
   * Stop and remove a continuous emitter. Existing particles finish naturally.
   * @param {string} id
   */
  stopContinuous(id) {
    this._emitters.delete(id);
  }

  /**
   * Check whether a continuous emitter is active.
   * @param {string} id
   * @returns {boolean}
   */
  hasContinuous(id) {
    return this._emitters.has(id);
  }

  /**
   * Advance all live particles and tick continuous emitters.
   * @param {number} dt – seconds since last frame
   */
  update(dt) {
    // ── Tick continuous emitters ──
    for (const [id, em] of this._emitters) {
      em.age += dt;
      if (em.age >= em.duration) {
        this._emitters.delete(id);
        continue;
      }
      em.elapsed += dt;
      if (em.elapsed >= em.rate) {
        em.elapsed -= em.rate;
        this.emit(em.preset, em.x, em.y, em.overrides);
      }
    }

    // ── Advance particles ──
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
      const t = p.maxLife > 0 ? (1 - p.life / p.maxLife) : 1; // 0 → 1 over lifetime
      const size = p.size + (p.sizeEnd - p.size) * t;
      if (size <= 0) continue;

      const alpha = p.fadeOut && p.maxLife > 0 ? p.life / p.maxLife : 1;
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

  /** Clear all particles and emitters (map change, etc.) */
  clear() {
    this._particles.length = 0;
    this._emitters.clear();
  }

  /** @private */
  _rand(min, max) {
    return min + Math.random() * (max - min);
  }
}
