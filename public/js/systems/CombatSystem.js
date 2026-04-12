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

  useMinorHeal() {
    const player = this.game.entities.player;
    const now = performance.now();

    if (player.dead) {
      return;
    }

    if (now - this.lastHealCastAt < 5300) {
      const remaining = ((5300 - (now - this.lastHealCastAt)) / 1000).toFixed(1);
      this.game.ui.addMessage(`Minor Heal cooling down (${remaining}s).`);
      return;
    }

    if (player.mana < 22) {
      this.game.ui.addMessage("Not enough mana.");
      return;
    }

    this.lastHealCastAt = now;
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
    const weapon = this.game.entities.player.equipment?.weapon;
    const weaponDef = weapon ? this.game.data.items[weapon.id] : null;
    const swingSfx = weaponDef?.swingSfx || PLAYER_BASE.swingSfx || "sword_swing";
    this.game.audio.play(swingSfx);
  }
}