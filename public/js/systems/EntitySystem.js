import { PLAYER_BASE } from "../config.js";
import { clamp, distance, normalize } from "../utils.js";

export class EntitySystem {
  constructor(game) {
    this.game = game;
    this.player = this.createPlayer();
    this.npcs = this.createNpcs();
    this.statues = this.createStatues();
    this.enemies = [];
    this.remotePlayers = [];
    this.drops = [];
  }

  createPlayer() {
    const spawn = this.game.world.spawnPoint;
    const charData = this.game.charData;
    return {
      name: charData.name || "Adventurer",
      charClass: charData.charClass || "warrior",
      x: spawn.x,
      y: spawn.y,
      radius: 16,
      level: 1,
      xp: 0,
      xpToLevel: 160,
      hp: PLAYER_BASE.maxHp,
      maxHp: PLAYER_BASE.maxHp,
      mana: PLAYER_BASE.maxMana,
      maxMana: PLAYER_BASE.maxMana,
      moveSpeed: PLAYER_BASE.moveSpeed,
      baseDamage: PLAYER_BASE.damage,
      attackRange: PLAYER_BASE.attackRange,
      attackCooldown: PLAYER_BASE.attackCooldown,
      gold: 12,
      dead: false,
      deathUntil: 0,
      inventorySlots: Array(20).fill(null),
      bank: Array(48).fill(null),
      hotbar: [
        { type: "skill", skillId: "attack" },
        { type: "skill", skillId: "heal" },
        null, null, null, null, null, null, null, null
      ],
      equipment: {
        weapon: null,
        armor: null,
        trinket: null
      }
    };
  }

  createNpcs() {
    const npcData = this.game.data?.npcs || {};
    const mapNpcs = this.game.world.mapData?.npcs || [];
    const tileSize = this.game.world.tileSize;
    const result = [];

    for (const placement of mapNpcs) {
      const def = npcData[placement.npcId];
      if (!def) continue;

      result.push({
        id: def.id,
        name: def.name,
        x: placement.tx * tileSize,
        y: placement.ty * tileSize,
        color: def.color,
        dialog: def.defaultDialog,
        questIds: def.questIds || [],
        type: def.type || "generic",
        shop: def.shop || null,
        floor: placement.floor ?? 0
      });
    }

    return result;
  }

  createStatues() {
    const mapStatues = this.game.world.mapData?.statues || [];
    const tileSize = this.game.world.tileSize;
    const result = [];

    for (const s of mapStatues) {
      result.push({
        id: s.id,
        name: s.name,
        x: s.tx * tileSize,
        y: s.ty * tileSize
      });
    }

    return result;
  }

  getClosestStatueInRange(range = 92) {
    const player = this.player;
    let closest = null;
    let bestDist = Infinity;

    for (const statue of this.statues) {
      const dist = distance(player.x, player.y, statue.x, statue.y);
      if (dist < range && dist < bestDist) {
        closest = statue;
        bestDist = dist;
      }
    }

    return closest;
  }

  update(dt) {
    this.updatePlayerMovement(dt);
    this.updateRegeneration(dt);
    this.handlePlayerDeathState();
  }

  updatePlayerMovement(dt) {
    const { input } = this.game;
    const player = this.player;

    if (player.dead) {
      return;
    }

    let moveX = 0;
    let moveY = 0;

    if (input.isDown("w", "arrowup")) {
      moveY -= 1;
    }
    if (input.isDown("s", "arrowdown")) {
      moveY += 1;
    }
    if (input.isDown("a", "arrowleft")) {
      moveX -= 1;
    }
    if (input.isDown("d", "arrowright")) {
      moveX += 1;
    }

    if (moveX === 0 && moveY === 0) {
      return;
    }

    const dir = normalize(moveX, moveY);
    this.moveEntityWithCollision(player, dir.x * player.moveSpeed, dir.y * player.moveSpeed, dt);
  }

  updateRegeneration(dt) {
    // Server-authoritative: regen is handled server-side and synced via world state.
    // No client-side regen to avoid jitter.
  }

  moveEntityWithCollision(entity, velocityX, velocityY, dt) {
    const stepX = velocityX * dt;
    const stepY = velocityY * dt;

    const newX = entity.x + stepX;
    if (!this.game.world.isBlockedPoint(newX, entity.y, entity.radius)) {
      entity.x = newX;
    }

    const newY = entity.y + stepY;
    if (!this.game.world.isBlockedPoint(entity.x, newY, entity.radius)) {
      entity.y = newY;
    }
  }

  nudgePlayerToward(targetX, targetY, dt, speedFactor = 0.86) {
    const player = this.player;
    if (player.dead) {
      return;
    }

    const dir = normalize(targetX - player.x, targetY - player.y);
    this.moveEntityWithCollision(
      player,
      dir.x * player.moveSpeed * speedFactor,
      dir.y * player.moveSpeed * speedFactor,
      dt
    );
  }

  getEnemyById(id) {
    return this.enemies.find((enemy) => enemy.id === id) || null;
  }

  getEnemyAtWorld(worldX, worldY) {
    const clickableRadius = 24;
    return (
      this.enemies.find(
        (enemy) =>
          !enemy.dead && distance(worldX, worldY, enemy.x, enemy.y) <= enemy.radius + clickableRadius
      ) || null
    );
  }

  getPlayerAtWorld(worldX, worldY) {
    const clickableRadius = 24;
    return (
      this.remotePlayers.find(
        (rp) =>
          !rp.dead && distance(worldX, worldY, rp.x, rp.y) <= 16 + clickableRadius
      ) || null
    );
  }

  getClosestNpcInRange(range = 60) {
    const player = this.player;
    let closest = null;
    let bestDist = Infinity;

    for (const npc of this.npcs) {
      if (npc.floor !== this.game.world.currentFloor) continue;
      const dist = distance(player.x, player.y, npc.x, npc.y);
      if (dist < range && dist < bestDist) {
        closest = npc;
        bestDist = dist;
      }
    }

    return closest;
  }

  // Drop creation + enemy kills are now handled by the server via NetworkSystem.
  // killEnemy, createLootForEnemy, damagePlayer, onPlayerDeath removed.

  grantXp(amount) {
    const player = this.player;
    player.xp += amount;

    while (player.xp >= player.xpToLevel) {
      player.xp -= player.xpToLevel;
      player.level += 1;
      player.xpToLevel = Math.round(player.xpToLevel * 1.28);
      player.maxHp += 24;
      player.maxMana += 16;
      player.baseDamage += 4;
      player.hp = player.maxHp;
      player.mana = player.maxMana;
      this.game.ui.addMessage(`Level up! You reached level ${player.level}.`);
      this.game.audio.play("level_up");
      this.recalculateDerivedStats();
    }
  }

  addItemToInventory(item) {
    const slots = this.player.inventorySlots;
    const itemDefs = this.game.data?.items || {};
    const template = itemDefs[item.id];
    const maxStack = (template && template.stackSize) || 1;

    // Try stacking first
    if (maxStack > 1) {
      for (let i = 0; i < slots.length; i++) {
        if (slots[i] && slots[i].id === item.id && (slots[i].qty || 1) < maxStack) {
          slots[i].qty = (slots[i].qty || 1) + (item.qty || 1);
          return true;
        }
      }
    }

    // Find empty slot
    for (let i = 0; i < slots.length; i += 1) {
      if (!slots[i]) {
        slots[i] = { ...item, qty: item.qty || 1 };
        return true;
      }
    }
    return false;
  }

  equipItemAtIndex(index) {
    const slots = this.player.inventorySlots;
    const item = slots[index];

    if (this.player.dead) return;
    if (!item || !["weapon", "armor", "trinket"].includes(item.type)) {
      return;
    }

    const oldItem = this.player.equipment[item.type];
    this.player.equipment[item.type] = item;
    slots[index] = oldItem || null;

    this.recalculateDerivedStats();
    this.game.ui.addMessage(`${item.name} equipped.`);
  }

  recalculateDerivedStats() {
    const player = this.player;

    const weapon = player.equipment.weapon;
    const armor = player.equipment.armor;
    const trinket = player.equipment.trinket;

    player.damage = player.baseDamage + (weapon?.attackBonus || 0);

    const maxHp = PLAYER_BASE.maxHp + (player.level - 1) * 24 + (armor?.hpBonus || 0);
    const maxMana = PLAYER_BASE.maxMana + (player.level - 1) * 16 + (trinket?.manaBonus || 0);

    const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1;
    const manaRatio = player.maxMana > 0 ? player.mana / player.maxMana : 1;

    player.maxHp = maxHp;
    player.maxMana = maxMana;
    player.hp = clamp(player.maxHp * hpRatio, 1, player.maxHp);
    player.mana = clamp(player.maxMana * manaRatio, 0, player.maxMana);
  }

  handlePlayerDeathState() {
    // death/respawn is now driven by server messages in NetworkSystem.
    // This only drives the visual death overlay timer on the client.
    const player = this.player;
    if (!player.dead) {
      return;
    }
    // the server will send a you_respawned message; no local timer needed
  }

  draw(ctx, camera, sprites) {
    for (const drop of this.drops) {
      const x = drop.x - camera.x;
      const y = drop.y - camera.y;

      const img = sprites && sprites.get("entities/drop");
      if (img) {
        ctx.drawImage(img, x - img.width / 2, y - img.height / 2);
      } else {
        ctx.fillStyle = "#72582b";
        ctx.fillRect(x - 6, y - 5, 12, 10);
        ctx.strokeStyle = "#d7ba7a";
        ctx.strokeRect(x - 6, y - 5, 12, 10);
      }
    }

    for (const npc of this.npcs) {
      if (npc.floor !== this.game.world.currentFloor) continue;
      const x = npc.x - camera.x;
      const y = npc.y - camera.y;

      const img = sprites && sprites.get(`entities/${npc.id}`);
      if (img) {
        ctx.drawImage(img, x - img.width / 2, y - img.height / 2);
      } else {
        ctx.fillStyle = npc.color;
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "#1a1006";
      ctx.font = "12px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(npc.name, x, y - 20);

      // Quest marker: show "?" for turn-in, "!" for available quests
      const marker = this.game.quests.getNpcQuestMarker(npc);
      if (marker) {
        ctx.fillStyle = marker === "?" ? "#5ec9f5" : "#ffdf84";
        ctx.font = "bold 16px Trebuchet MS";
        ctx.fillText(marker, x, y - 34);
      }
    }

    // Draw statues (waystone pillars)
    for (const statue of this.statues) {
      const x = statue.x - camera.x;
      const y = statue.y - camera.y;

      const img = sprites && sprites.get("entities/waystone");
      if (img) {
        ctx.drawImage(img, x - img.width / 2, y - img.height / 2);
      } else {
        // Fallback: draw a blue-tinted stone pillar
        ctx.fillStyle = "#5a7a9e";
        ctx.fillRect(x - 8, y - 18, 16, 28);
        ctx.fillStyle = "#8ab8d8";
        ctx.fillRect(x - 6, y - 16, 12, 24);
        // Glowing top
        ctx.fillStyle = "#b0e0ff";
        ctx.beginPath();
        ctx.arc(x, y - 18, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Name tag
      ctx.fillStyle = "#a0d4f0";
      ctx.font = "11px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(statue.name, x, y - 26);

      // Show attunement indicator if this is the player's bound stone
      const hs = this.player.hearthstone;
      if (hs && hs.statueId === statue.id) {
        ctx.fillStyle = "#5ee87a";
        ctx.font = "bold 10px Trebuchet MS";
        ctx.fillText("✦ Bound", x, y - 38);
      }
    }

    for (const enemy of this.enemies) {
      if (enemy.dead) {
        continue;
      }

      const x = Math.round(enemy.x - camera.x);
      const y = Math.round(enemy.y - camera.y);

      const img = sprites && sprites.get(`entities/${enemy.type}`);
      if (img) {
        ctx.drawImage(img, x - img.width / 2, y - img.height / 2);
      } else {
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.arc(x, y, enemy.radius || 15, 0, Math.PI * 2);
        ctx.fill();
      }

      const hpRatio = enemy.hp / enemy.maxHp;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(x - 18, y - 23, 36, 5);
      ctx.fillStyle = "#9f2524";
      ctx.fillRect(x - 18, y - 23, 36 * hpRatio, 5);

      if (this.game.combat.targetEnemyId === enemy.id) {
        ctx.strokeStyle = "#f5df8e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, (enemy.radius || 15) + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // draw remote players
    for (const rp of this.remotePlayers) {
      if (rp.dead) continue;

      const x = Math.round(rp.x - camera.x);
      const y = Math.round(rp.y - camera.y);

      const img = sprites && sprites.get(`entities/player_${rp.charClass}`);
      if (img) {
        ctx.drawImage(img, x - img.width / 2, y - img.height / 2);
      } else {
        const classColors = { warrior: "#d48a5e", mage: "#8a7dc9", rogue: "#7cc97d" };
        ctx.fillStyle = classColors[rp.charClass] || "#b0b0b0";
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#d0d0e0";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // name tag
      ctx.fillStyle = "#e0dcc8";
      ctx.font = "11px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(rp.name, x, y - 22);

      // selection ring if targeted
      if (this.game.combat.targetPlayerId === rp.id) {
        ctx.strokeStyle = "#5ec9f5";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // draw local player
    const player = this.player;
    const playerKey = player.dead ? "entities/player_dead" : "entities/player_local";
    const playerImg = sprites && sprites.get(playerKey);
    if (playerImg) {
      ctx.drawImage(playerImg, player.x - camera.x - playerImg.width / 2, player.y - camera.y - playerImg.height / 2);
    } else {
      ctx.fillStyle = player.dead ? "#5d4b67" : "#7db1d5";
      ctx.beginPath();
      ctx.arc(player.x - camera.x, player.y - camera.y, player.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e8e8f8";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // player name tag
    if (!player.dead) {
      ctx.fillStyle = "#e8e8f8";
      ctx.font = "11px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(player.name, player.x - camera.x, player.y - camera.y - 22);
    }
  }
}