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
    this.resourceNodes = [];
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
      _baseHitParticle: PLAYER_BASE.hitParticle || "hit_spark",
      _baseHitSfx: PLAYER_BASE.hitSfx || "sword_hit",
      _baseSwingSfx: PLAYER_BASE.swingSfx || "sword_swing",
      gold: 12,
      dead: false,
      deathUntil: 0,
      activeBuffs: [],
      inventorySlots: Array(20).fill(null),
      bank: Array(48).fill(null),
      hotbar: [
        { type: "skill", skillId: "attack" },
        { type: "skill", skillId: "heal" },
        null, null, null, null, null, null, null, null
      ],
      equipment: {
        mainHand: null,
        offHand: null,
        armor: null,
        helmet: null,
        pants: null,
        boots: null,
        ring1: null,
        ring2: null,
        amulet: null
      },
      gatheringSkills: {}
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
        craftingSkill: def.craftingSkill || null,
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
        y: s.ty * tileSize,
        floor: s.floor || 0
      });
    }

    return result;
  }

  getClosestStatueInRange(range = 92) {
    const player = this.player;
    let closest = null;
    let bestDist = Infinity;

    const floor = this.game.world.currentFloor;
    for (const statue of this.statues) {
      if ((statue.floor || 0) !== floor) continue;
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
    let speedMult = 1;
    if (player.activeBuffs) {
      for (const b of player.activeBuffs) {
        if (b.stat === 'moveSpeed') speedMult += b.modifier;
      }
    }
    this.moveEntityWithCollision(player, dir.x * player.moveSpeed * speedMult, dir.y * player.moveSpeed * speedMult, dt);
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
    const floor = this.game.world.currentFloor;
    return (
      this.enemies.find(
        (enemy) =>
          !enemy.dead && (enemy.floor || 0) === floor && distance(worldX, worldY, enemy.x, enemy.y) <= enemy.radius + clickableRadius
      ) || null
    );
  }

  getPlayerAtWorld(worldX, worldY) {
    const clickableRadius = 24;
    const floor = this.game.world.currentFloor;
    return (
      this.remotePlayers.find(
        (rp) =>
          !rp.dead && (rp.floor || 0) === floor && distance(worldX, worldY, rp.x, rp.y) <= 16 + clickableRadius
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

  getClosestResourceNodeInRange(range = 60) {
    const player = this.player;
    let closest = null;
    let bestDist = Infinity;

    for (const node of this.resourceNodes) {
      if (node.floor !== this.game.world.currentFloor) continue;
      const d = distance(player.x, player.y, node.x, node.y);
      if (d < range && d < bestDist) {
        closest = node;
        bestDist = d;
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
      this.game.particles.emit("levelup", player.x, player.y);
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

  static EQUIPPABLE_TYPES = new Set([
    "weapon", "shield", "quiver", "armor", "helmet", "pants", "boots", "ring", "amulet"
  ]);

  _equipSlotForItem(item) {
    const eq = this.player.equipment;
    switch (item.type) {
      case "weapon": return "mainHand";
      case "shield": case "quiver": return "offHand";
      case "armor":  return "armor";
      case "helmet": return "helmet";
      case "pants":  return "pants";
      case "boots":  return "boots";
      case "amulet": return "amulet";
      case "ring":
        if (!eq.ring1) return "ring1";
        if (!eq.ring2) return "ring2";
        return "ring1";
      default: return null;
    }
  }

  equipItemAtIndex(index) {
    const slots = this.player.inventorySlots;
    const item = slots[index];

    if (this.player.dead) return;
    if (!item || !EntitySystem.EQUIPPABLE_TYPES.has(item.type)) return;

    const slot = this._equipSlotForItem(item);
    if (!slot) return;

    // Prevent equipping offHand when a 2H weapon is in mainHand (unless bow + quiver)
    if (slot === "offHand") {
      const mainWeapon = this.player.equipment.mainHand;
      const mainDef = mainWeapon ? this.game.data.items[mainWeapon.id] : null;
      if (mainDef?.handed === 2) {
        if (!(mainDef.requiresQuiver && item.type === "quiver")) {
          this.game.ui.addMessage("Cannot equip off-hand with a two-handed weapon.");
          return;
        }
      }
    }

    const oldItem = this.player.equipment[slot];
    this.player.equipment[slot] = item;
    slots[index] = oldItem || null;

    this.recalculateDerivedStats();
    this.game.ui.addMessage(`${item.name} equipped.`);
  }

  recalculateDerivedStats() {
    const player = this.player;
    const eq = player.equipment;

    const weapon = eq.mainHand;
    player.damage = player.baseDamage + (weapon?.attackBonus || 0);

    // Use weapon range if present (ranged weapons), otherwise default melee range
    const weaponDef = weapon ? this.game.data.items[weapon.id] : null;
    player.attackRange = weaponDef?.range || PLAYER_BASE.attackRange;

    // Sum HP bonuses from armour-like slots
    let hpBonus = 0;
    for (const s of ["armor", "offHand", "helmet", "pants", "boots"]) {
      hpBonus += eq[s]?.hpBonus || 0;
    }

    // Sum mana bonuses from rings + amulet
    let manaBonus = 0;
    for (const s of ["ring1", "ring2", "amulet"]) {
      manaBonus += eq[s]?.manaBonus || 0;
    }

    const maxHp = PLAYER_BASE.maxHp + (player.level - 1) * 24 + hpBonus;
    const maxMana = PLAYER_BASE.maxMana + (player.level - 1) * 16 + manaBonus;

    const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1;
    const manaRatio = player.maxMana > 0 ? player.mana / player.maxMana : 1;

    player.maxHp = maxHp;
    player.maxMana = maxMana;
    player.hp = clamp(player.maxHp * hpRatio, 1, player.maxHp);
    player.mana = clamp(player.maxMana * manaRatio, 0, player.maxMana);
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

    // Draw resource nodes
    const currentFloor = this.game.world.currentFloor;
    for (const node of this.resourceNodes) {
      if (node.floor !== currentFloor) continue;
      const x = node.x - camera.x;
      const y = node.y - camera.y;

      const img = sprites && sprites.get(`gathering/${node.type}`);
      if (img) {
        ctx.globalAlpha = node.active ? 1.0 : 0.3;
        ctx.drawImage(img, x - img.width / 2, y - img.height / 2);
        ctx.globalAlpha = 1.0;
      } else {
        // Fallback: colored circle with outline
        const [r, g, b] = node.color || [128, 128, 128];
        ctx.globalAlpha = node.active ? 1.0 : 0.3;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = node.active ? "#fff" : "#666";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1.0;
      }

      // Name label
      if (this.game.labelToggles.resourceNodes) {
        ctx.fillStyle = node.active ? "#f0e6d0" : "#777";
        ctx.font = "10px Trebuchet MS";
        ctx.textAlign = "center";
        ctx.fillText(node.name, x, y - 16);
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

      if (this.game.labelToggles.npcs) {
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
    }

    // Draw statues (waystone pillars)
    for (const statue of this.statues) {
      if ((statue.floor || 0) !== currentFloor) continue;
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
      if (this.game.labelToggles.waystones) {
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
    }

    for (const enemy of this.enemies) {
      if (enemy.dead || (enemy.floor || 0) !== currentFloor) {
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
      if (rp.dead || (rp.floor || 0) !== currentFloor) continue;

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
      if (this.game.labelToggles.players) {
        ctx.fillStyle = "#e0dcc8";
        ctx.font = "11px Trebuchet MS";
        ctx.textAlign = "center";
        ctx.fillText(rp.name, x, y - 22);
      }

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
    if (!player.dead && this.game.labelToggles.players) {
      ctx.fillStyle = "#e8e8f8";
      ctx.font = "11px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(player.name, player.x - camera.x, player.y - camera.y - 22);
    }

    // Hover-to-reveal names
    if (this.game.labelToggles.hoverNames) {
      this._drawHoverName(ctx, camera);
    }
  }

  _drawHoverName(ctx, camera) {
    const mx = this.game.input.mouse.x;
    const my = this.game.input.mouse.y;
    const currentFloor = this.game.world.currentFloor;

    // Check NPCs
    if (!this.game.labelToggles.npcs) {
      for (const npc of this.npcs) {
        if (npc.floor !== currentFloor) continue;
        const x = npc.x - camera.x;
        const y = npc.y - camera.y;
        if (Math.abs(mx - x) < 16 && Math.abs(my - y) < 16) {
          ctx.fillStyle = "#1a1006";
          ctx.font = "12px Trebuchet MS";
          ctx.textAlign = "center";
          ctx.fillText(npc.name, x, y - 20);
          return;
        }
      }
    }

    // Check enemies
    for (const enemy of this.enemies) {
      if (enemy.dead || (enemy.floor || 0) !== currentFloor) continue;
      const x = Math.round(enemy.x - camera.x);
      const y = Math.round(enemy.y - camera.y);
      const r = enemy.radius || 15;
      if (Math.abs(mx - x) < r + 4 && Math.abs(my - y) < r + 4) {
        ctx.fillStyle = "#e8c8c8";
        ctx.font = "11px Trebuchet MS";
        ctx.textAlign = "center";
        ctx.fillText(enemy.name, x, y - r - 8);
        return;
      }
    }

    // Check remote players
    if (!this.game.labelToggles.players) {
      for (const rp of this.remotePlayers) {
        if (rp.dead || (rp.floor || 0) !== currentFloor) continue;
        const x = Math.round(rp.x - camera.x);
        const y = Math.round(rp.y - camera.y);
        if (Math.abs(mx - x) < 18 && Math.abs(my - y) < 18) {
          ctx.fillStyle = "#e0dcc8";
          ctx.font = "11px Trebuchet MS";
          ctx.textAlign = "center";
          ctx.fillText(rp.name, x, y - 22);
          return;
        }
      }
    }
  }
}