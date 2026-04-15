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
  }

  update(dt) {
    this.updatePlayerCombat(dt);
    // Enemy AI is now handled server-side (ServerWorld)
  }

  handleWorldClick(worldX, worldY) {
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
    if (!this.targetEnemyId) {
      this.game.ui.addMessage("No target.");
      return;
    }
    this.engaged = true;
    this.tryPlayerAttack(true);
  }

  useSkill(skillId) {
    const skillDef = this.game.data.skills[skillId];
    if (!skillDef) return;

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
    if (skillDef.targeting === "enemy" || skillDef.targeting === "aoe") {
      if (!this.targetEnemyId) {
        this.game.ui.addMessage("No target.");
        return;
      }
      const enemy = this.game.entities.getEnemyById(this.targetEnemyId);
      if (!enemy || enemy.dead) {
        this.game.ui.addMessage("Invalid target.");
        return;
      }
      // Range check for targeted skills
      const dist = distance(player.x, player.y, enemy.x, enemy.y);
      const skillRange = skillDef.range || player.attackRange;
      if (dist > skillRange) {
        this.game.ui.addMessage("Out of range.");
        return;
      }
    }

    // Record cooldown & send to server
    if (!this._skillCooldowns) this._skillCooldowns = {};
    this._skillCooldowns[skillId] = now;
    this.game.network.sendSkill(skillId, this.targetEnemyId);

    // Play cast SFX
    if (skillDef.castSfx) this.game.audio.play(skillDef.castSfx);
    else if (skillDef.sfx) this.game.audio.play(skillDef.sfx);

    // Emit particle on self for buffs/support/heals
    if ((skillDef.targeting === "self" || skillDef.targeting === "aoe_ally") && skillDef.particle) {
      this.game.particles?.emit(skillDef.particle, player.x, player.y);
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
}