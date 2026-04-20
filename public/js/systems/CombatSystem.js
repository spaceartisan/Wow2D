import { distance } from "../utils.js";
import { PLAYER_BASE } from "../config.js";

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.targetEnemyId = null;
    this.targetPlayerId = null;
    this.engaged = false;
    this.lastPlayerAttackAt = 0;
    this.lastHealCastAt = 0;
    /** @type {{ skillId: string, pattern: object, targeting: string } | null} */
    this.aoeTargeting = null;
  }

  update(dt) {
    this.updatePlayerCombat(dt);
    // Enemy AI is now handled server-side (ServerWorld)
  }

  handleWorldClick(worldX, worldY) {
    // If in AoE targeting mode, confirm placement
    if (this.aoeTargeting) {
      this.confirmAoeTarget(worldX, worldY);
      return;
    }

    const clickedEnemy = this.game.entities.getEnemyAtWorld(worldX, worldY);
    if (clickedEnemy) {
      this.targetEnemyId = clickedEnemy.id;
      this.targetPlayerId = null;
      this.engaged = false;
      this.game.ui.addMessage(`Target: ${clickedEnemy.name}`);
      return;
    }

    const clickedPlayer = this.game.entities.getPlayerAtWorld(worldX, worldY);
    if (clickedPlayer) {
      this.targetPlayerId = clickedPlayer.id;
      this.targetEnemyId = null;
      this.engaged = false;
      this.game.ui.addMessage(`Target: ${clickedPlayer.name}`);
      return;
    }

    this.clearTarget();
  }

  handleWorldRightClick(worldX, worldY) {
    if (this.aoeTargeting) {
      this.cancelAoeTargeting();
      return;
    }

    // Right-click a drop to open loot window
    const clickedDrop = this.game.entities.getDropAtWorld(worldX, worldY);
    if (clickedDrop) {
      if (this.game.network) this.game.network.sendLootOpen(clickedDrop.id);
      return;
    }

    // Right-click a player to show context menu
    const clickedPlayer = this.game.entities.getPlayerAtWorld(worldX, worldY);
    if (clickedPlayer) {
      this.targetPlayerId = clickedPlayer.id;
      this.targetEnemyId = null;
      this.engaged = false;
      const sx = this.game.input.mouse.clientX || 0;
      const sy = this.game.input.mouse.clientY || 0;
      this.game.ui.showPlayerContextMenu(sx, sy, clickedPlayer);
      return;
    }

    const clickedEnemy = this.game.entities.getEnemyAtWorld(worldX, worldY);
    if (clickedEnemy) {
      this.targetEnemyId = clickedEnemy.id;
      this.targetPlayerId = null;
      this.engaged = true;
      return;
    }
  }

  clearTarget() {
    this.targetEnemyId = null;
    this.targetPlayerId = null;
    this.engaged = false;
  }

  useAttackAbility() {
    if (!this.targetEnemyId && !this.targetPlayerId) {
      this.game.ui.addMessage("No target.");
      return;
    }
    this.engaged = true;
    this.tryPlayerAttack(true);
  }

  useSkill(skillId) {
    const skillDef = this.game.data.skills[skillId];
    if (!skillDef) return;

    // Cancel any active AoE targeting when a new skill is used
    this.aoeTargeting = null;

    // Delegate "attack" (auto-attack) and legacy "heal" to existing handlers
    if (skillId === "attack") { this.useAttackAbility(); return; }
    if (skillId === "heal") { this.useMinorHeal(); return; }

    const player = this.game.entities.player;
    if (player.dead) return;

    // Level requirement check
    if (player.level < (skillDef.levelReq || 1)) {
      this.game.ui.addMessage(`Requires level ${skillDef.levelReq}.`);
      return;
    }

    // Class restriction check
    if (skillDef.classes && !skillDef.classes.includes(player.charClass)) {
      this.game.ui.addMessage("Your class cannot use that skill.");
      return;
    }

    // Cooldown check
    const now = performance.now();
    const cooldownMs = (skillDef.cooldown || 0) * 1000;
    const lastUsed = this._skillCooldowns?.[skillId] || 0;
    if (cooldownMs > 0 && now - lastUsed < cooldownMs) {
      const remaining = ((cooldownMs - (now - lastUsed)) / 1000).toFixed(1);
      this.game.ui.addMessage(`${skillDef.name} cooling down (${remaining}s).`);
      return;
    }

    // Mana check
    if ((skillDef.manaCost || 0) > player.mana) {
      this.game.ui.addMessage("Not enough mana.");
      return;
    }

    // Targeting check for enemy-targeted skills
    if (skillDef.targeting === "enemy") {
      if (!this.targetEnemyId && !this.targetPlayerId) {
        this.game.ui.addMessage("No target.");
        return;
      }
      if (this.targetPlayerId) {
        // PVP player target
        const tp = this.game.entities.remotePlayers.find(p => p.id === this.targetPlayerId);
        if (!tp || tp.dead) {
          this.game.ui.addMessage("Invalid target.");
          return;
        }
        const dist = distance(player.x, player.y, tp.x, tp.y);
        const skillRange = skillDef.range || player.attackRange;
        if (dist > skillRange) {
          this.game.ui.addMessage("Out of range.");
          return;
        }
      } else {
        const enemy = this.game.entities.getEnemyById(this.targetEnemyId);
        if (!enemy || enemy.dead) {
          this.game.ui.addMessage("Invalid target.");
          return;
        }
        const dist = distance(player.x, player.y, enemy.x, enemy.y);
        const skillRange = skillDef.range || player.attackRange;
        if (dist > skillRange) {
          this.game.ui.addMessage("Out of range.");
          return;
        }
      }
    }

    // Ground-targeted or directional AoE — enter targeting mode (don't fire yet)
    if (skillDef.targeting === "ground_aoe" || skillDef.targeting === "directional") {
      const pattern = this.game.data.aoePatterns?.[skillDef.aoePattern];
      if (!pattern) {
        this.game.ui.addMessage("Missing AoE pattern.");
        return;
      }
      this.aoeTargeting = { skillId, pattern, targeting: skillDef.targeting };
      this.game.ui.addMessage("Click to place AoE. Right-click or Escape to cancel.");
      return;
    }

    // Record cooldown & send to server
    if (!this._skillCooldowns) this._skillCooldowns = {};
    this._skillCooldowns[skillId] = now;

    if (skillDef.targeting === "self_aoe") {
      this.game.network.sendSkill(skillId, null, null, null);
    } else {
      this.game.network.sendSkill(skillId, this.targetEnemyId, null, null, this.targetPlayerId);
    }

    // For channeled or cast-time skills, let the server response handle SFX/particles
    if (!skillDef.channeled && !skillDef.castTime) {
      if (skillDef.castSfx) this.game.audio.play(skillDef.castSfx);
      else if (skillDef.sfx) this.game.audio.play(skillDef.sfx);

      // Emit particle on self for buffs/support/heals/self_aoe
      if ((skillDef.targeting === "self" || skillDef.targeting === "self_aoe") && skillDef.particle) {
        this.game.particles?.emit(skillDef.particle, player.x, player.y);
      }
    }
  }

  useMinorHeal() {
    const player = this.game.entities.player;
    const now = performance.now();

    if (player.dead) {
      return;
    }

    if (!this._skillCooldowns) this._skillCooldowns = {};
    const lastUsed = this._skillCooldowns["heal"] || 0;
    if (now - lastUsed < 5300) {
      const remaining = ((5300 - (now - lastUsed)) / 1000).toFixed(1);
      this.game.ui.addMessage(`Minor Heal cooling down (${remaining}s).`);
      return;
    }

    if (player.mana < 22) {
      this.game.ui.addMessage("Not enough mana.");
      return;
    }

    this._skillCooldowns["heal"] = now;
    // send heal request to server
    this.game.network.sendHeal();
    this.game.audio.play("heal");
  }

  updatePlayerCombat(dt) {
    const player = this.game.entities.player;
    if (player.dead) {
      return;
    }

    if (this.engaged) {
      this.tryPlayerAttack(false, dt);
    }
  }

  tryPlayerAttack(forceAttack = false, dt = 0) {
    const player = this.game.entities.player;

    // PVP target
    if (this.targetPlayerId) {
      const pvpMode = this.game.pvpMode || "none";
      if (pvpMode === "none") return;
      if (pvpMode === "duel" && !this.game._duelOpponent) return;

      const targetPlayer = this.game.entities.remotePlayers.find(p => p.id === this.targetPlayerId);
      if (!targetPlayer || targetPlayer.dead) {
        this.clearTarget();
        return;
      }
      const d = distance(player.x, player.y, targetPlayer.x, targetPlayer.y);
      const now = performance.now();
      const cooldownMs = player.attackCooldown * 1000;

      const manualMove = this.game.input.isDown("w","a","s","d","arrowup","arrowdown","arrowleft","arrowright");
      if (d > player.attackRange && !manualMove && dt > 0) {
        this.game.entities.nudgePlayerToward(targetPlayer.x, targetPlayer.y, dt, 0.82);
      }
      if (d > player.attackRange) return;
      if (!forceAttack && now - this.lastPlayerAttackAt < cooldownMs) return;

      this.lastPlayerAttackAt = now;
      this.game.network.sendPvpAttack(this.targetPlayerId);

      const weapon = player.equipment?.mainHand;
      const weaponDef = weapon ? this.game.data.items[weapon.id] : null;
      const swingSfx = weaponDef?.swingSfx || PLAYER_BASE.swingSfx || "sword_swing";
      this.game.audio.play(swingSfx);
      return;
    }

    // PVE target
    const enemy = this.targetEnemyId ? this.game.entities.getEnemyById(this.targetEnemyId) : null;

    if (!enemy || enemy.dead) {
      if (this.targetEnemyId) {
        this.clearTarget();
      }
      return;
    }

    const dist = distance(player.x, player.y, enemy.x, enemy.y);
    const now = performance.now();
    const cooldownMs = player.attackCooldown * 1000;

    const manualMove = this.game.input.isDown(
      "w",
      "a",
      "s",
      "d",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright"
    );

    if (dist > player.attackRange && !manualMove && dt > 0) {
      this.game.entities.nudgePlayerToward(enemy.x, enemy.y, dt, 0.82);
    }

    if (dist > player.attackRange) {
      return;
    }

    if (!forceAttack && now - this.lastPlayerAttackAt < cooldownMs) {
      return;
    }

    this.lastPlayerAttackAt = now;
    // send attack request to server instead of applying damage locally
    this.game.network.sendAttack(enemy.id);

    // Use weapon-specific swing SFX, fall back to playerBase default
    const weapon = this.game.entities.player.equipment?.mainHand;
    const weaponDef = weapon ? this.game.data.items[weapon.id] : null;
    const swingSfx = weaponDef?.swingSfx || PLAYER_BASE.swingSfx || "sword_swing";
    this.game.audio.play(swingSfx);
  }

  // ── AoE targeting ────────────────────────────────────
  confirmAoeTarget(worldX, worldY) {
    if (!this.aoeTargeting) return;
    const { skillId, targeting } = this.aoeTargeting;
    const skillDef = this.game.data.skills[skillId];
    if (!skillDef) { this.cancelAoeTargeting(); return; }

    const player = this.game.entities.player;

    // Range check — target must be within skill range
    if (skillDef.range) {
      const dist = distance(player.x, player.y, worldX, worldY);
      if (dist > skillDef.range) {
        this.game.ui.addMessage("Out of range.");
        return;
      }
    }

    // Record cooldown & send
    if (!this._skillCooldowns) this._skillCooldowns = {};
    this._skillCooldowns[skillId] = performance.now();
    this.game.network.sendSkill(skillId, null, worldX, worldY);

    if (!skillDef.channeled && !skillDef.castTime) {
      if (skillDef.castSfx) this.game.audio.play(skillDef.castSfx);
      else if (skillDef.sfx) this.game.audio.play(skillDef.sfx);
    }

    this.aoeTargeting = null;
  }

  cancelAoeTargeting() {
    if (this.aoeTargeting) {
      this.game.ui.addMessage("AoE targeting cancelled.");
      this.aoeTargeting = null;
    }
  }

  /** Draw semi-transparent tile overlay showing AoE area. */
  drawAoeIndicator(ctx, cam) {
    if (!this.aoeTargeting) return;
    const { skillId, pattern, targeting } = this.aoeTargeting;
    const ts = this.game.world.tileSize || 48;
    const player = this.game.entities.player;
    const mouse = this.game.input.mouse;

    let originX, originY;
    if (targeting === "ground_aoe") {
      if (mouse.worldX == null || mouse.worldY == null) return;
      originX = mouse.worldX;
      originY = mouse.worldY;
    } else {
      // directional — origin is the player's tile
      originX = player.x;
      originY = player.y;
    }

    const originTx = Math.floor(originX / ts);
    const originTy = Math.floor(originY / ts);

    // Calculate direction index for directional patterns
    let dirIdx = 0;
    if (pattern.directional) {
      const dx = mouse.worldX - player.x;
      const dy = mouse.worldY - player.y;
      const angle = Math.atan2(dy, dx);
      dirIdx = Math.round(((angle + Math.PI) / (Math.PI * 2)) * 8) % 8;
      // remap: atan2 gives 0=E, we want 0=N
      dirIdx = (dirIdx + 6) % 8;
    }

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#ff4444";

    for (const [dx, dy] of pattern.tiles) {
      let rx = dx, ry = dy;
      if (pattern.directional && dirIdx !== 0) {
        [rx, ry] = this._rotateTile(dx, dy, dirIdx);
      }
      const px = (originTx + rx) * ts - cam.x;
      const py = (originTy + ry) * ts - cam.y;
      ctx.fillRect(px, py, ts, ts);
    }

    // Draw border on each tile
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#ff2222";
    ctx.lineWidth = 1;
    for (const [dx, dy] of pattern.tiles) {
      let rx = dx, ry = dy;
      if (pattern.directional && dirIdx !== 0) {
        [rx, ry] = this._rotateTile(dx, dy, dirIdx);
      }
      const px = (originTx + rx) * ts - cam.x;
      const py = (originTy + ry) * ts - cam.y;
      ctx.strokeRect(px, py, ts, ts);
    }
    ctx.restore();
  }

  /** Rotate a tile offset by direction index (0=N, 1=NE, 2=E, ... 7=NW). */
  _rotateTile(dx, dy, dirIdx) {
    switch (dirIdx) {
      case 0: return [dx, dy];       // N  (identity)
      case 1: {                       // NE (45°)
        const c = 0.7071;
        return [Math.round((dx - dy) * c), Math.round((dx + dy) * c)];
      }
      case 2: return [-dy, dx];      // E  (90°)
      case 3: {                       // SE (135°)
        const c = 0.7071;
        return [Math.round((-dx - dy) * c), Math.round((dx - dy) * c)];
      }
      case 4: return [-dx, -dy];     // S  (180°)
      case 5: {                       // SW (225°)
        const c = 0.7071;
        return [Math.round((-dx + dy) * c), Math.round((-dx - dy) * c)];
      }
      case 6: return [dy, -dx];      // W  (270°)
      case 7: {                       // NW (315°)
        const c = 0.7071;
        return [Math.round((dx + dy) * c), Math.round((-dx + dy) * c)];
      }
      default: return [dx, dy];
    }
  }
}