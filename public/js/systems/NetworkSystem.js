/**
 * NetworkSystem – client-side WebSocket manager with Source-style
 * entity interpolation.
 *
 * Implements the Valve Source Engine networking model:
 *
 * 1. **Snapshot buffer**: Each server tick (20 Hz) delivers a world-
 *    state snapshot.  The client stores the last several snapshots
 *    in a short ring buffer per entity (keyed by server tick number).
 *
 * 2. **Interpolation delay**: Remote entities are rendered at a fixed
 *    time *in the past* (interpDelay, default = 2 server ticks =
 *    100 ms at 20 Hz).  This guarantees that we always have two
 *    snapshots to interpolate between, producing perfectly smooth
 *    linear motion with zero pulsing.
 *
 * 3. **Client-side prediction**: The local player uses client-
 *    authoritative movement (instant response, no smoothing).
 *    The server corrects only if drift exceeds a threshold.
 *
 * 4. **Immediate overrides**: Damage / death events are patched on
 *    top of interpolated data so HP bars react before the next
 *    snapshot arrives.
 *
 * This replaces the previous exponential-smoothing / dead-reckoning
 * approach which could pulse and overshoot.
 */
export class NetworkSystem {
  constructor(game, credentials) {
    this.game = game;
    this.credentials = credentials; // { username, token, charData }
    this.ws = null;
    this.myId = null;
    this.connected = false;
    this.positionSendInterval = null;
    this.lastSentX = 0;
    this.lastSentY = 0;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._intentionalClose = false;

    /* ── Source-style snapshot interpolation state ──── */

    /** Immediate overrides applied on top of interpolated data. */
    this.enemyOverrides = new Map(); // enemyId → partial object

    /** Server tick rate (Hz) — set from welcome message. */
    this._serverTickRate = 20;

    /** Duration of one server tick in ms. */
    this._tickMs = 17;

    /**
     * Interpolation delay in server ticks.  3 ticks = 50 ms at 60 Hz.
     * Ensures we always have a pair of snapshots to interpolate between.
     */
    this._interpTicks = 3;

    /**
     * Per-entity snapshot ring buffers.
     * Map<entityId, Array<{tick, x, y, ...scalar fields}>>
     * Each buffer stores up to _bufLen snapshots (oldest evicted first).
     */
    this._enemySnaps = new Map();
    this._playerSnaps = new Map();
    this._bufLen = 16; // keep last 16 snapshots (~267 ms at 60 Hz)

    /**
     * Mapping from server tick to client receive time (performance.now).
     * Used to convert the render-time target into a server tick for
     * interpolation without requiring clock synchronisation.
     */
    this._tickTimeMap = [];     // [{tick, time}]  – last ~16 entries
    this._tickTimeMapLen = 16;

    /** Latest server tick received. */
    this._serverTick = 0;

    /** Cache arrays — reused each frame to avoid GC pressure. */
    this._enemyResult = [];
    this._playerResult = [];

    /** Latest raw arrays from server (used for scalar-field lookup). */
    this._latestEnemyMap = new Map();
    this._latestPlayerMap = new Map();

    /**
     * Per-entity last-rendered position for output smoothing.
     * Prevents any single frame from jumping more than a blended step.
     * Map<entityId, {x, y}>
     */
    this._smoothPosEnemy = new Map();
    this._smoothPosPlayer = new Map();

    /* ── Client-side prediction & server reconciliation ── */

    /** Auto-incrementing sequence number tagged on every move sent. */
    this._moveSeq = 0;

    /**
     * Prediction buffer — stores {seq, x, y} for each move sent.
     * When the server acks a sequence, we compare its authoritative
     * position against our prediction at that seq.  If they differ
     * (server rejected the move / collision mismatch), we apply a
     * smooth correction rather than a hard teleport.
     */
    this._predBuffer = [];  // [{seq, x, y}]
    this._predBufferMax = 64;

    /**
     * Accumulated correction vector applied smoothly over frames.
     * Each frame we blend a fraction toward zero so the player
     * glides to the corrected position without jarring snaps.
     */
    this._correctionX = 0;
    this._correctionY = 0;
    this._correctionRate = 0.2; // fraction of error applied per frame
  }

  connect() {
    this._intentionalClose = false;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}`;

    this.ws = new WebSocket(url);

    this.ws.addEventListener("open", () => {
      this.connected = true;
      this._reconnectAttempts = 0;

      // authenticate + join with token
      this.send({
        type: "join",
        token: this.credentials.token,
        charData: this.credentials.charData
      });

      // send position updates at server tick rate (~60 Hz = 17 ms)
      this.positionSendInterval = setInterval(() => this.sendPosition(), this._tickMs);
    });

    this.ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      this.onMessage(msg);
    });

    this.ws.addEventListener("close", () => {
      this.connected = false;
      clearInterval(this.positionSendInterval);

      if (!this._intentionalClose) {
        this.game.ui.addMessage("[System] Disconnected from server.");
        this._attemptReconnect();
      }
    });

    this.ws.addEventListener("error", () => {
      this.connected = false;
    });
  }

  _attemptReconnect() {
    if (this._intentionalClose || this._reconnectAttempts >= 5) {
      if (this._reconnectAttempts >= 5) {
        this.game.ui.addMessage("[System] Could not reconnect. Please log out and try again.");
      }
      return;
    }

    this._reconnectAttempts++;
    const delay = Math.min(2000 * this._reconnectAttempts, 10000);
    this.game.ui.addMessage(`[System] Reconnecting in ${Math.round(delay / 1000)}s... (attempt ${this._reconnectAttempts}/5)`);

    this._reconnectTimer = setTimeout(() => {
      if (!this._intentionalClose) {
        this.connect();
      }
    }, delay);
  }

  disconnect() {
    this._intentionalClose = true;
    clearTimeout(this._reconnectTimer);
    clearInterval(this.positionSendInterval);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendPosition() {
    const player = this.game.entities.player;
    // only send if position changed
    if (Math.abs(player.x - this.lastSentX) < 0.5 && Math.abs(player.y - this.lastSentY) < 0.5) {
      return;
    }
    const seq = ++this._moveSeq;
    this.lastSentX = player.x;
    this.lastSentY = player.y;

    // Store prediction so we can reconcile against server ack
    this._predBuffer.push({ seq, x: player.x, y: player.y });
    if (this._predBuffer.length > this._predBufferMax) this._predBuffer.shift();

    this.send({ type: "move", seq, x: player.x, y: player.y, level: player.level, floor: this.game.world.currentFloor });
  }

  sendAttack(enemyId) {
    this.send({ type: "attack", enemyId });
  }

  sendHeal() {
    this.send({ type: "heal" });
  }

  sendSkill(skillId, enemyId) {
    this.send({ type: "use_skill", skillId, enemyId: enemyId || null });
  }

  sendChat(text) {
    this.send({ type: "chat", text });
  }

  sendUseItem(index) {
    this.send({ type: "use_item", index });
  }

  sendSellItem(index, all) {
    const msg = { type: "sell_item", index };
    if (all) msg.all = true;
    this.send(msg);
  }

  sendDropItem(index) {
    this.send({ type: "drop_item", index });
  }

  sendGather(nodeId) {
    this.send({ type: "gather", nodeId });
  }

  sendBuyItem(itemId, npcId) {
    this.send({ type: "buy_item", itemId, npcId });
  }

  sendEquipItem(index) {
    this.send({ type: "equip_item", index });
  }

  sendUnequipItem(slot) {
    this.send({ type: "unequip_item", slot });
  }

  sendCompleteQuest(questId) {
    this.send({ type: "complete_quest", questId });
  }

  sendQuestStateUpdate(quests) {
    this.send({ type: "quest_state_update", quests });
  }

  sendAttuneHearthstone(statueId) {
    this.send({ type: "attune_hearthstone", statueId });
  }

  sendUseHearthstone() {
    this.send({ type: "use_hearthstone" });
  }

  sendCancelHearthstone() {
    this.send({ type: "cancel_hearthstone" });
  }

  sendBankDeposit(invIndex) {
    this.send({ type: "bank_deposit", invIndex });
  }

  sendBankWithdraw(bankIndex) {
    this.send({ type: "bank_withdraw", bankIndex });
  }

  sendHotbarUpdate(hotbar) {
    this.send({ type: "hotbar_update", hotbar });
  }

  sendSwapItems(from, to, fromContainer, toContainer) {
    this.send({ type: "swap_items", from, to, fromContainer, toContainer });
  }

  sendSplitStack(container, index, qty) {
    this.send({ type: "split_stack", container, index, qty });
  }

  /* ── message dispatcher ────────────────────────────── */

  onMessage(msg) {
    switch (msg.type) {
      case "welcome":
        this.onWelcome(msg);
        break;
      case "state":
        this.onWorldState(msg);
        break;
      case "attack_result":
        this.onAttackResult(msg);
        break;
      case "enemy_killed":
        this.onEnemyKilled(msg);
        break;
      case "player_damaged":
        this.onPlayerDamaged(msg);
        break;
      case "you_died":
        this.onPlayerDied();
        break;
      case "you_respawned":
        this.onPlayerRespawned(msg);
        break;
      case "loot_pickup":
        this.onLootPickup(msg);
        break;
      case "heal_result":
        this.onHealResult(msg);
        break;
      case "chat":
        this.onChat(msg);
        break;
      case "player_joined":
        this.onPlayerJoined(msg);
        break;
      case "player_left":
        this.onPlayerLeft(msg);
        break;
      case "drop_spawned":
        this.onDropSpawned(msg);
        break;
      case "drop_removed":
        this.onDropRemoved(msg);
        break;
      case "map_changed":
        this.onMapChanged(msg);
        break;
      case "use_item_result":
        this.onUseItemResult(msg);
        break;
      case "sell_item_result":
        this.onSellItemResult(msg);
        break;
      case "buy_item_result":
        this.onBuyItemResult(msg);
        break;
      case "equip_item_result":
        this.onEquipItemResult(msg);
        break;
      case "unequip_item_result":
        this.onUnequipItemResult(msg);
        break;
      case "quiver_update":
        this.onQuiverUpdate(msg);
        break;
      case "quest_complete_result":
        this.onQuestCompleteResult(msg);
        break;
      case "attune_result":
        this.onAttuneResult(msg);
        break;
      case "hearthstone_result":
        this.onHearthstoneResult(msg);
        break;
      case "hearthstone_cast_start":
        this.onHearthstoneCastStart(msg);
        break;
      case "hearthstone_cast_cancelled":
        this.onHearthstoneCastCancelled(msg);
        break;
      case "hearthstone_teleport":
        this.onHearthstoneTeleport(msg);
        break;
      case "bank_result":
        this.onBankResult(msg);
        break;
      case "hotbar_result":
        this.onHotbarResult(msg);
        break;
      case "swap_result":
        this.onSwapResult(msg);
        break;
      case "split_stack_result":
        this.onSplitStackResult(msg);
        break;
      case "drop_item_result":
        this.onDropItemResult(msg);
        break;
      case "skill_result":
        this.onSkillResult(msg);
        break;
      case "combat_visual":
        this.onCombatVisual(msg);
        break;
      case "projectile_spawn":
        this.onProjectileSpawn(msg);
        break;
      case "projectile_hit":
        this.onProjectileHit(msg);
        break;
      case "gather_result":
        this.onGatherResult(msg);
        break;
      case "auth_error":
        this._intentionalClose = true;
        this.game.ui.addMessage(`[System] ${msg.error}`);
        break;
      case "kicked":
        this._intentionalClose = true;
        this.game.ui.addMessage(`[System] ${msg.reason}`);
        // Auto-logout after being kicked
        setTimeout(() => { if (this.game.logout) this.game.logout(); }, 2000);
        break;
      default:
        break;
    }
  }

  /* ── handlers ───────────────────────────────────────── */

  /** Shared reset for welcome / map_changed — clears snapshot buffers and
   *  seeds the interpolation system from a server message. */
  _resetEntities(msg) {
    const now = performance.now();
    const tick = msg.tick || this._serverTick;

    // Clear all snapshot buffers
    this._enemySnaps.clear();
    this._playerSnaps.clear();
    this._latestEnemyMap.clear();
    this._latestPlayerMap.clear();
    this._smoothPosEnemy.clear();
    this._smoothPosPlayer.clear();

    // Clear prediction buffer + correction (position is being reset)
    this._predBuffer.length = 0;
    this._correctionX = 0;
    this._correctionY = 0;

    // Reset tick-time mapping
    this._tickTimeMap.length = 0;
    this._tickTimeMap.push({ tick, time: now });
    this._serverTick = tick;

    // Seed snapshot buffers with initial positions so entities appear
    // immediately (no waiting for interpDelay to fill).
    const enemies = msg.enemies || [];
    for (const e of enemies) {
      // Two identical snapshots at tick-1 and tick = instant display
      this._pushSnap(this._enemySnaps, e, tick - 1);
      this._pushSnap(this._enemySnaps, e, tick);
      this._latestEnemyMap.set(e.id, e);
    }

    const players = (msg.players || []).filter((p) => p.id !== this.myId);
    for (const p of players) {
      this._pushSnap(this._playerSnaps, p, tick - 1);
      this._pushSnap(this._playerSnaps, p, tick);
      this._latestPlayerMap.set(p.id, p);
    }

    this.enemyOverrides.clear();
    this.game.entities.drops = (msg.drops || []).map((d) => ({
      ...d,
      expiresAt: now + 25000
    }));
  }

  onWelcome(msg) {
    this.myId = msg.playerId;
    if (msg.tickRate) {
      this._serverTickRate = msg.tickRate;
      this._tickMs = Math.round(1000 / msg.tickRate);
      // Restart send interval at the correct rate
      clearInterval(this.positionSendInterval);
      this.positionSendInterval = setInterval(() => this.sendPosition(), this._tickMs);
    }
    this._serverTick = msg.tick || 0;
    this._resetEntities(msg);

    // Load authoritative inventory, equipment, and stats from server
    const player = this.game.entities.player;
    if (msg.inventory) {
      for (let i = 0; i < 20; i++) {
        player.inventorySlots[i] = msg.inventory[i] || null;
      }
    }
    if (msg.equipment) {
      const raw = msg.equipment;
      player.equipment.mainHand = raw.mainHand || raw.weapon || null;
      player.equipment.offHand = raw.offHand || null;
      player.equipment.armor = raw.armor || null;
      player.equipment.helmet = raw.helmet || null;
      player.equipment.pants = raw.pants || null;
      player.equipment.boots = raw.boots || null;
      player.equipment.ring1 = raw.ring1 || null;
      player.equipment.ring2 = raw.ring2 || null;
      player.equipment.amulet = raw.amulet || raw.trinket || null;
    }
    if (msg.level !== undefined) player.level = msg.level;
    if (msg.xp !== undefined) player.xp = msg.xp;
    if (msg.xpToLevel !== undefined) player.xpToLevel = msg.xpToLevel;
    if (msg.gold !== undefined) player.gold = msg.gold;
    if (msg.hp !== undefined) player.hp = msg.hp;
    if (msg.maxHp !== undefined) player.maxHp = msg.maxHp;
    if (msg.mana !== undefined) player.mana = msg.mana;
    if (msg.maxMana !== undefined) player.maxMana = msg.maxMana;
    this.game.entities.recalculateDerivedStats();
    this.game.ui._inventoryDirty = true;
    this.game.ui._equipmentDirty = true;

    // Load persisted quest state from server
    if (msg.quests && this.game.quests) {
      this.game.quests.quests = msg.quests;
    }

    // Load hearthstone attunement data
    if (msg.hearthstone !== undefined) {
      this.game.entities.player.hearthstone = msg.hearthstone;
    }

    // Load bank
    if (msg.bank) {
      const bank = this.game.entities.player.bank;
      for (let i = 0; i < 48; i++) {
        bank[i] = msg.bank[i] || null;
      }
    }

    // Load hotbar
    if (msg.hotbar) {
      const hotbar = this.game.entities.player.hotbar;
      for (let i = 0; i < 10; i++) {
        hotbar[i] = msg.hotbar[i] || null;
      }
      if (this.game.ui) this.game.ui._hotbarDirty = true;
    }

    // Load gathering skills
    if (msg.gatheringSkills) {
      this.game.entities.player.gatheringSkills = msg.gatheringSkills;
    }

    // Load resource nodes
    if (msg.resourceNodes) {
      this.game.entities.resourceNodes = msg.resourceNodes;
    }

    this.game.ui.addMessage("Connected to server.");
  }

  onWorldState(msg) {
    const now = performance.now();
    const tick = msg.tick || (this._serverTick + 1);
    this._serverTick = tick;

    // Record tick → client-time mapping for interpolation
    this._tickTimeMap.push({ tick, time: now });
    if (this._tickTimeMap.length > this._tickTimeMapLen) {
      this._tickTimeMap.shift();
    }

    // Push enemy snapshots into per-entity ring buffers
    const enemies = msg.enemies || [];
    const seenEnemies = new Set();
    for (const e of enemies) {
      seenEnemies.add(e.id);
      // If enemy just respawned (was dead, now alive), flush stale
      // snapshots so interpolation doesn't slide from death location.
      const prev = this._latestEnemyMap.get(e.id);
      if (prev && prev.dead && !e.dead) {
        this._enemySnaps.delete(e.id);
        this._smoothPosEnemy.delete(e.id);
      }
      this._pushSnap(this._enemySnaps, e, tick);
      this._latestEnemyMap.set(e.id, e);
    }
    // Prune enemies no longer present
    for (const id of this._enemySnaps.keys()) {
      if (!seenEnemies.has(id)) {
        this._enemySnaps.delete(id);
        this._latestEnemyMap.delete(id);
      }
    }

    // Push player snapshots
    const players = (msg.players || []).filter((p) => p.id !== this.myId);
    const seenPlayers = new Set();
    for (const p of players) {
      seenPlayers.add(p.id);
      this._pushSnap(this._playerSnaps, p, tick);
      this._latestPlayerMap.set(p.id, p);
    }
    for (const id of this._playerSnaps.keys()) {
      if (!seenPlayers.has(id)) {
        this._playerSnaps.delete(id);
        this._latestPlayerMap.delete(id);
      }
    }

    // Clear immediate overrides – the new state is authoritative
    this.enemyOverrides.clear();

    // Update resource nodes (static positions; just sync active state)
    if (msg.resourceNodes) {
      this.game.entities.resourceNodes = msg.resourceNodes;
    }

    // Apply authoritative player stats immediately (not smoothed)
    if (msg.you) {
      const player = this.game.entities.player;
      player.hp = msg.you.hp;
      player.maxHp = msg.you.maxHp;
      player.mana = msg.you.mana;
      player.maxMana = msg.you.maxMana;
      if (msg.you.gold !== undefined) player.gold = msg.you.gold;
      if (msg.you.level !== undefined) player.level = msg.you.level;
      if (msg.you.xp !== undefined) player.xp = msg.you.xp;
      if (msg.you.damage !== undefined) player.damage = msg.you.damage;
      if (msg.you.buffs) player.activeBuffs = msg.you.buffs;

      // Update shop gold display + button states without full re-render
      if (this.game.ui?.shopOpen) this.game.ui.refreshShopGold();

      // ── Server reconciliation (client-side prediction) ──
      // Compare server's authoritative position at the acked sequence
      // against what we predicted at that sequence.  Apply smooth
      // correction for small errors; hard snap for large desync.
      if (msg.you.x !== undefined && msg.you.y !== undefined) {
        const ackSeq = msg.you.ackSeq || 0;

        // Purge all predictions the server has acknowledged
        let acked = null;
        while (this._predBuffer.length > 0 && this._predBuffer[0].seq <= ackSeq) {
          acked = this._predBuffer.shift();
        }

        if (acked) {
          // Error = server authoritative position minus our prediction
          const errX = msg.you.x - acked.x;
          const errY = msg.you.y - acked.y;
          const errMag = Math.sqrt(errX * errX + errY * errY);

          if (errMag > 80) {
            // Large desync — hard snap (teleport, server reject chain, etc)
            player.x = msg.you.x;
            player.y = msg.you.y;
            this._correctionX = 0;
            this._correctionY = 0;
            this._predBuffer.length = 0;
          } else if (errMag > 0.5) {
            // Server disagreed — accumulate smooth correction
            this._correctionX += errX;
            this._correctionY += errY;
          }
        } else if (this._predBuffer.length === 0) {
          // No prediction buffer (first connect, map change, etc)
          // Fall back to simple drift check
          const dx = player.x - msg.you.x;
          const dy = player.y - msg.you.y;
          const drift = Math.sqrt(dx * dx + dy * dy);
          if (drift > 80) {
            player.x = msg.you.x;
            player.y = msg.you.y;
          }
        }
      }

      if (msg.you.dead && !player.dead) {
        player.dead = true;
        player.deathUntil = now + 4200;
      }
    }

    // Update drops in-place (non-positional, small array)
    const srcDrops = msg.drops || [];
    const dstDrops = this.game.entities.drops;
    dstDrops.length = srcDrops.length;
    for (let i = 0; i < srcDrops.length; i++) {
      const sd = srcDrops[i];
      let dd = dstDrops[i];
      if (!dd || dd.id !== sd.id) {
        dstDrops[i] = { id: sd.id, x: sd.x, y: sd.y, expiresAt: now + 25000 };
      } else {
        dd.x = sd.x;
        dd.y = sd.y;
      }
    }
  }

  onAttackResult(msg) {
    if (msg.ok === false) {
      this.game.ui.addMessage(msg.reason || "Attack failed.");
      return;
    }
    const weapon = this.game.entities.player.equipment?.mainHand;
    const weaponDef = weapon ? this.game.data.items[weapon.id] : null;
    const playerBase = this.game.entities.player;
    const hitParticle = weaponDef?.hitParticle || playerBase._baseHitParticle;
    const hitSfx = weaponDef?.hitSfx || playerBase._baseHitSfx;
    const enemy = this.game.entities.enemies.find(e => e.id === msg.enemyId);

    // Ranged weapon — arrow already in flight (spawned by projectile_spawn)
    if (weaponDef?.range) {
      this.enemyOverrides.set(msg.enemyId, { hp: msg.enemyHp, maxHp: msg.enemyMaxHp });
      this.game.ui.addMessage(`You strike for ${msg.damage} damage.`);
      return;
    }

    // Melee — instant effects
    this.enemyOverrides.set(msg.enemyId, {
      hp: msg.enemyHp,
      maxHp: msg.enemyMaxHp
    });
    this.game.ui.addMessage(`You strike for ${msg.damage} damage.`);
    this.game.audio.play(hitSfx);
    if (enemy) this.game.particles.emit(hitParticle, enemy.x, enemy.y);
  }

  onEnemyKilled(msg) {
    this.enemyOverrides.set(msg.enemyId, { hp: 0, dead: true });

    this.game.entities.grantXp(msg.xpReward);
    this.game.quests.onEnemyKilled(msg.enemyType);
    this.game.combat.clearTarget();
    this.game.ui.addMessage(`Enemy slain! +${msg.xpReward} XP`);
    this.game.audio.play("enemy_death");
    const dead = this.game.entities.enemies.find(e => e.id === msg.enemyId);
    if (dead) this.game.particles.emit("death", dead.x, dead.y);
  }

  onPlayerDamaged(msg) {
    const player = this.game.entities.player;
    player.hp = msg.hp;
    this.game.ui.addMessage(`${msg.attackerName} hits you for ${msg.damage}.`);

    // Look up the attacking enemy's effects from enemies.json
    const enemyDef = msg.attackerType ? this.game.data.enemies[msg.attackerType] : null;
    const hitParticle = enemyDef?.hitParticle || "player_hit";
    const hitSfx = enemyDef?.hitSfx || "player_hit";

    this.game.audio.play(hitSfx);
    this.game.particles.emit(hitParticle, player.x, player.y);
  }

  onPlayerDied() {
    const player = this.game.entities.player;
    player.dead = true;
    player.deathUntil = performance.now() + 4200;
    // Gold penalty is now server-authoritative; don't modify locally
    this.game.ui.addMessage("You died.");
    this.game.audio.play("player_death");
    this.game.particles.emit("death", player.x, player.y);
  }

  onPlayerRespawned(msg) {
    const player = this.game.entities.player;
    player.dead = false;
    player.hp = msg.hp;
    player.maxHp = msg.maxHp;
    player.mana = msg.mana;
    player.maxMana = msg.maxMana;
    player.x = msg.x;
    player.y = msg.y;
    this.game.combat.clearTarget();
    this.game.ui.addMessage("You awaken at the town shrine.");
  }

  onLootPickup(msg) {
    const player = this.game.entities.player;
    if (msg.gold > 0) {
      player.gold += msg.gold;
      this.game.ui.addMessage(`Loot: +${msg.gold} gold`);
      this.game.audio.play("pickup");
    }
    if (msg.item && msg.index >= 0) {
      // Use server-authoritative slot state (includes stack qty)
      player.inventorySlots[msg.index] = msg.slotItem ? { ...msg.slotItem } : { ...msg.item };
      this.game.ui.addMessage(`Loot: ${msg.item.name}`);
      this.game.ui._inventoryDirty = true;
      this.game.ui._hotbarDirty = true;
    } else if (msg.item) {
      this.game.ui.addMessage("Inventory full: dropped item was lost.");
    }
  }

  onHealResult(msg) {
    if (!msg.ok) {
      if (msg.reason === "cooldown") {
        this.game.ui.addMessage("Minor Heal is on cooldown.");
      } else if (msg.reason === "mana") {
        this.game.ui.addMessage("Not enough mana.");
      }
      this.game.audio.play("error");
      return;
    }

    const player = this.game.entities.player;
    player.hp = msg.hp;
    player.maxHp = msg.maxHp;
    player.mana = msg.mana;
    player.maxMana = msg.maxMana;
    this.game.ui.addMessage(`Minor Heal restores ${msg.healAmount} HP.`);
    const p = this.game.entities.player;
    this.game.particles.emit("heal", p.x, p.y);
  }

  /** Projectile color lookup by damage type */
  static _PROJ_COLORS = {
    fire:     { color: "#f59a2e", trail: "#c44b0a", size: 5 },
    frost:    { color: "#8ad4f5", trail: "#4a8ab0", size: 5 },
    arcane:   { color: "#b88aef", trail: "#6a4aad", size: 4 },
    nature:   { color: "#6ae870", trail: "#2a8a30", size: 4 },
    physical: { color: "#c8c0a8", trail: "#7a7460", size: 3 }
  };

  onSkillResult(msg) {
    const player = this.game.entities.player;
    const skillDef = this.game.data.skills[msg.skillId];

    if (!msg.ok) {
      if (msg.reason === "cooldown") {
        this.game.ui.addMessage(`${skillDef?.name || msg.skillId} is on cooldown.`);
      } else if (msg.reason === "mana") {
        this.game.ui.addMessage("Not enough mana.");
      }
      return;
    }

    // Update mana from server
    if (msg.mana != null) player.mana = msg.mana;
    if (msg.maxMana != null) player.maxMana = msg.maxMana;

    // Track buffs/debuffs applied to self
    if (msg.buff) {
      if (!player.activeBuffs) player.activeBuffs = [];
      // Remove duplicate, add with remaining time matching world state format
      player.activeBuffs = player.activeBuffs.filter(b => b.id !== msg.buff.id);
      player.activeBuffs.push({
        ...msg.buff,
        remaining: msg.buff.duration
      });
    }

    if (msg.damage != null && msg.enemyId != null) {
      const enemy = this.game.entities.getEnemyById(msg.enemyId);

      // Ranged / projectile skill — damage comes later via projectile_hit
      if (skillDef?.projectileSpeed && skillDef.projectileSpeed > 0) {
        return;
      }

      // Melee / instant skill - apply immediately
      if (enemy) {
        enemy.hp = msg.enemyHp;
        enemy.maxHp = msg.enemyMaxHp;
        if (skillDef?.hitParticle) {
          this.game.particles.emit(skillDef.hitParticle, enemy.x, enemy.y);
        }
        if (skillDef?.sfx) this.game.audio.play(skillDef.sfx);
      }
      this.enemyOverrides.set(msg.enemyId, { hp: msg.enemyHp, maxHp: msg.enemyMaxHp });
      this.game.ui.addMessage(`${skillDef?.name || msg.skillId} hits for ${msg.damage}.`);
    } else if (msg.healAmount != null) {
      // Heal skill
      player.hp = msg.hp;
      player.maxHp = msg.maxHp;
      if (skillDef?.particle) this.game.particles.emit(skillDef.particle, player.x, player.y);
      if (skillDef?.sfx) this.game.audio.play(skillDef.sfx);
      this.game.ui.addMessage(`${skillDef?.name || msg.skillId} restores ${msg.healAmount} HP.`);
    } else {
      // Buff/support skill (or ranged skill launch confirmation)
      if (skillDef?.projectileSpeed > 0) return; // projectile in flight
      if (skillDef?.particle) this.game.particles.emit(skillDef.particle, player.x, player.y);
      this.game.ui.addMessage(`${skillDef?.name || msg.skillId} activated.`);
    }
  }

  /**
   * Handle a combat visual broadcast from the server.
   * This fires for other players' attacks/heals/buffs so everyone sees the effects.
   */
  onCombatVisual(msg) {
    // ── Self-targeted effect (heal / buff on another player) ──
    if (msg.selfTarget) {
      // Find the remote player who cast
      const rp = this.game.entities.remotePlayers.find(p => p.id === msg.attackerId);
      const x = rp ? rp.x : msg.ax;
      const y = rp ? rp.y : msg.ay;
      if (msg.particle) this.game.particles.emit(msg.particle, x, y);
      if (msg.sfx) this.game.audio.play(msg.sfx);
      return;
    }

    // ── Enemy attacking a player (not us — that's handled by player_damaged) ──
    if (msg.targetPlayerId) {
      const rp = this.game.entities.remotePlayers.find(p => p.id === msg.targetPlayerId);
      const x = rp ? rp.x : msg.tx;
      const y = rp ? rp.y : msg.ty;
      if (msg.hitParticle) this.game.particles.emit(msg.hitParticle, x, y);
      if (msg.hitSfx) this.game.audio.play(msg.hitSfx);
      return;
    }

    // ── Player attacking an enemy ──

    // Ranged projectile hit — arrow already exists from projectile_spawn
    if (msg.projectileHit) {
      if (msg.enemyHp != null) {
        this.enemyOverrides.set(msg.enemyId, { hp: msg.enemyHp, maxHp: msg.enemyMaxHp });
      }
      return;
    }

    const enemy = this.game.entities.getEnemyById(msg.enemyId);
    const ex = enemy ? enemy.x : msg.ex;
    const ey = enemy ? enemy.y : msg.ey;

    // Find attacker position from remote players (use msg fallback)
    const attacker = this.game.entities.remotePlayers.find(p => p.id === msg.attackerId);
    const ax = attacker ? attacker.x : msg.ax;
    const ay = attacker ? attacker.y : msg.ay;

    // Skill-based attack
    if (msg.skillId) {
      const skillDef = this.game.data.skills[msg.skillId];

      // Instant skill — particles at impact
      if (msg.hitParticle) this.game.particles.emit(msg.hitParticle, ex, ey);
      if (msg.hitSfx) this.game.audio.play(msg.hitSfx);
      return;
    }

    // Weapon-based attack (auto-attack) — only melee reaches here
    if (msg.hitParticle) this.game.particles.emit(msg.hitParticle, ex, ey);
    if (msg.hitSfx) this.game.audio.play(msg.hitSfx);
  }

  onChat(msg) {
    const channel = msg.channel || "world";
    if (channel === "whisper") {
      if (msg.from === this.game.charData.name) {
        this.game.ui.addChatMessage("whisper", `To [${msg.to}]: ${msg.text}`);
      } else {
        this.game.ui.addChatMessage("whisper", `[${msg.from}] whispers: ${msg.text}`);
      }
    } else if (channel === "system") {
      this.game.ui.addChatMessage("system", msg.text);
    } else {
      this.game.ui.addChatMessage("world", `[${msg.from}]: ${msg.text}`);
    }
  }

  onPlayerJoined(msg) {
    this.game.ui.addChatMessage("system", `${msg.player.name} has entered the world.`);
  }

  onPlayerLeft(msg) {
    // find name in remotePlayers before removing
    const rp = this.game.entities.remotePlayers.find((p) => p.id === msg.playerId);
    const name = rp ? rp.name : "A player";
    this.game.entities.remotePlayers = this.game.entities.remotePlayers.filter(
      (p) => p.id !== msg.playerId
    );
    this.game.ui.addChatMessage("system", `${name} has left the world.`);
  }

  onMapChanged(msg) {
    this._resetEntities(msg);
    this.game.particles.clear();

    this.game.combat.clearTarget();
    this.game.ui.closeAllPanels();

    // Load new map terrain/NPCs/statues if the map actually changed (e.g. admin teleport)
    if (msg.mapId && msg.mapId !== this.game.world.mapId) {
      this.game.world.loadMap(msg.mapId).then(() => {
        this.game.entities.npcs = this.game.entities.createNpcs();
        this.game.entities.statues = this.game.entities.createStatues();
        this.game.minimap.invalidate();
        this.game._syncMapParticles();
      });
    } else {
      this.game._syncMapParticles();
    }
  }

  onDropSpawned(msg) {
    // drops get fully synced via state messages; this is just a notification
  }

  onDropRemoved(msg) {
    this.game.entities.drops = this.game.entities.drops.filter((d) => d.id !== msg.dropId);
  }

  onUseItemResult(msg) {
    if (!msg.ok) {
      this.game.ui.addMessage(msg.reason || "Cannot use that item.");
      return;
    }
    const player = this.game.entities.player;
    // Server sends remainingItem (null if consumed, or item with reduced qty)
    player.inventorySlots[msg.index] = msg.remainingItem || null;
    player.hp = msg.hp;
    player.maxHp = msg.maxHp;
    player.mana = msg.mana;
    player.maxMana = msg.maxMana;
    this.game.ui._inventoryDirty = true;
    this.game.ui._hotbarDirty = true;

    if (msg.effect === "healHp") {
      this.game.ui.addMessage(`Potion restores ${msg.amount} HP.`);
    } else if (msg.effect === "healMana") {
      this.game.ui.addMessage(`Potion restores ${msg.amount} mana.`);
    } else if (msg.effect === "refillQuiver") {
      this.game.ui.addMessage(`Added ${msg.amount} arrows to quiver.`);
      this.game.ui._equipmentDirty = true;
    }

    // Look up consumed item's effects from items.json
    const itemDef = msg.itemId ? this.game.data.items[msg.itemId] : null;
    const useParticle = itemDef?.useParticle;
    const useSfx = itemDef?.useSfx;
    if (useSfx) this.game.audio.play(useSfx);
    if (useParticle) this.game.particles.emit(useParticle, player.x, player.y);
  }

  onSellItemResult(msg) {
    if (!msg.ok) return;
    const player = this.game.entities.player;
    player.inventorySlots[msg.index] = msg.remainingItem || null;
    player.gold = msg.gold;
    this.game.ui._inventoryDirty = true;
    this.game.ui._hotbarDirty = true;
    this.game.ui.addMessage(`Sold ${msg.sellQty > 1 ? msg.sellQty + "x " : ""}${msg.soldName} for ${msg.sellPrice} gold.`);
    this.game.audio.play("pickup");
  }

  onBuyItemResult(msg) {
    if (!msg.ok) {
      if (msg.reason === "gold") {
        this.game.ui.addMessage("Not enough gold.");
      } else if (msg.reason === "inventory_full") {
        this.game.ui.addMessage("Inventory is full.");
      } else if (msg.reason === "too_far") {
        this.game.ui.addMessage("You're too far from the vendor.");
      }
      return;
    }
    const player = this.game.entities.player;
    player.inventorySlots[msg.index] = { ...msg.item }; // includes qty from server
    player.gold = msg.gold;
    this.game.ui._inventoryDirty = true;
    this.game.ui._hotbarDirty = true;
    this.game.ui.addMessage(`Bought ${msg.item.name} for ${msg.buyPrice} gold.`);
    this.game.audio.play("pickup");
    // Refresh shop if open
    if (this.game.ui.shopOpen) {
      this.game.ui.renderShop();
    }
  }

  onEquipItemResult(msg) {
    if (!msg.ok) {
      // Server rejected — revert by syncing full state if provided
      if (msg.equipment) {
        const player = this.game.entities.player;
        for (const slot of Object.keys(player.equipment)) {
          player.equipment[slot] = msg.equipment[slot] || null;
        }
        if (msg.inventory) {
          for (let i = 0; i < player.inventorySlots.length; i++) {
            player.inventorySlots[i] = msg.inventory[i] || null;
          }
        }
        this.game.ui._inventoryDirty = true;
        this.game.ui._equipmentDirty = true;
      }
      this.game.ui.addMessage(msg.reason || "Cannot equip that right now.");
      return;
    }
    const player = this.game.entities.player;
    // Server sends full equipment/inventory to handle auto-unequips (e.g. 2H offhand)
    if (msg.equipment) {
      for (const slot of Object.keys(player.equipment)) {
        player.equipment[slot] = msg.equipment[slot] || null;
      }
    } else {
      player.equipment[msg.slot] = msg.newItem || null;
    }
    if (msg.inventory) {
      for (let i = 0; i < player.inventorySlots.length; i++) {
        player.inventorySlots[i] = msg.inventory[i] || null;
      }
    } else {
      player.inventorySlots[msg.index] = msg.oldItem || null;
    }
    player.hp = msg.hp;
    player.maxHp = msg.maxHp;
    player.mana = msg.mana;
    player.maxMana = msg.maxMana;
    player.damage = msg.damage;
    this.game.ui._inventoryDirty = true;
    this.game.ui._equipmentDirty = true;
    this.game.ui._hotbarDirty = true;
  }

  onUnequipItemResult(msg) {
    if (!msg.ok) {
      this.game.ui.addMessage(msg.reason || "Cannot unequip that right now.");
      return;
    }
    const player = this.game.entities.player;
    player.equipment[msg.slot] = null;
    player.inventorySlots[msg.index] = msg.item;
    player.hp = msg.hp;
    player.maxHp = msg.maxHp;
    player.mana = msg.mana;
    player.maxMana = msg.maxMana;
    player.damage = msg.damage;
    this.game.ui._inventoryDirty = true;
    this.game.ui._equipmentDirty = true;
    this.game.ui._hotbarDirty = true;
    this.game.ui.addMessage(`${msg.item.name} unequipped.`);
  }

  onQuiverUpdate(msg) {
    const quiver = this.game.entities.player.equipment?.offHand;
    if (quiver && quiver.type === "quiver") {
      quiver.arrows = msg.arrows;
      quiver.maxArrows = msg.maxArrows;
    }
    this.game.ui._equipmentDirty = true;
  }

  onQuestCompleteResult(msg) {
    if (!msg.ok) return;
    const player = this.game.entities.player;

    // Apply server-authoritative rewards
    player.gold = msg.playerGold;
    player.xp = msg.playerXp;
    player.level = msg.playerLevel;
    player.hp = msg.hp;
    player.maxHp = msg.maxHp;
    player.mana = msg.mana;
    player.maxMana = msg.maxMana;

    // Place reward items in inventory
    for (const ri of (msg.items || [])) {
      player.inventorySlots[ri.index] = { ...ri.item };
    }

    this.game.ui._inventoryDirty = true;
    this.game.ui._equipmentDirty = true;
    this.game.ui._hotbarDirty = true;
    this.game.entities.recalculateDerivedStats();
  }

  /* ── Hearthstone handlers ──────────────────────────── */

  onAttuneResult(msg) {
    if (msg.ok) {
      this.game.entities.player.hearthstone = msg.hearthstone;
      this.game.ui.addChatMessage("system", `Hearthstone attuned to ${msg.hearthstone.statueName}.`);
    } else {
      const reasons = { too_far: "Too far from the waystone.", no_hearthstone: "You don't have a hearthstone." };
      this.game.ui.addMessage(reasons[msg.reason] || "Cannot attune.");
    }
  }

  onHearthstoneResult(msg) {
    if (!msg.ok) {
      const reasons = {
        not_attuned: "Your hearthstone is not attuned. Visit a waystone statue.",
        no_hearthstone: "You don't have a hearthstone.",
        cooldown: `Hearthstone on cooldown (${msg.remaining}s remaining).`,
        already_casting: "Already casting."
      };
      this.game.ui.addMessage(reasons[msg.reason] || "Cannot use hearthstone.");
    }
  }

  onHearthstoneCastStart(msg) {
    this.game.ui.showCastBar(msg.castTime, `Hearthstone: ${msg.destination}`);
    this.game.audio.play("casting");
    // Emit casting particles repeatedly while channeling
    const player = this.game.entities.player;
    this.game.particles.emit("casting", player.x, player.y);
    this._castingInterval = setInterval(() => {
      const p = this.game.entities.player;
      if (p) this.game.particles.emit("casting", p.x, p.y);
    }, 250);
  }

  onHearthstoneCastCancelled(msg) {
    this.game.ui.hideCastBar();
    clearInterval(this._castingInterval);
    this._castingInterval = null;
    if (msg.reason === "damaged") {
      this.game.ui.addMessage("Hearthstone interrupted!");
    } else if (msg.reason === "moved") {
      this.game.ui.addMessage("Hearthstone interrupted by movement!");
    } else if (msg.reason === "manual") {
      this.game.ui.addMessage("Hearthstone cancelled.");
    }
  }

  onHearthstoneTeleport(msg) {
    this.game.ui.hideCastBar();
    this.game.ui.closeAllPanels();
    clearInterval(this._castingInterval);
    this._castingInterval = null;
    const player = this.game.entities.player;
    player.hearthstone = msg.hearthstone;

    if (msg.mapId !== this.game.world.mapId) {
      // Cross-map teleport — must await map load before creating NPCs
      this.game.world.loadMap(msg.mapId).then(() => {
        this.game.entities.npcs = this.game.entities.createNpcs();
        this.game.entities.statues = this.game.entities.createStatues();
        this.game.particles.clear();
        this.game._syncMapParticles();
      });
      this._resetEntities(msg);
    }

    player.x = msg.x;
    player.y = msg.y;
    this.game.ui.addChatMessage("system", "You have been teleported home.");
  }

  /* ── Bank / Hotbar / Swap handlers ─────────────────── */

  onBankResult(msg) {
    if (!msg.ok) {
      const reasons = {
        too_far: "You need to be near a banker.",
        bank_full: "Bank is full.",
        inventory_full: "Inventory is full.",
        permanent: "That item cannot be banked."
      };
      this.game.ui.addMessage(reasons[msg.reason] || "Bank action failed.");
      return;
    }
    const player = this.game.entities.player;
    // Full authoritative state from server
    if (msg.inventory) {
      for (let i = 0; i < 20; i++) player.inventorySlots[i] = msg.inventory[i] || null;
    }
    if (msg.bank) {
      for (let i = 0; i < 48; i++) player.bank[i] = msg.bank[i] || null;
    }
    this.game.ui._inventoryDirty = true;
    this.game.ui._bankDirty = true;
    this.game.ui._hotbarDirty = true;
    const verb = msg.action === "deposit" ? "deposited" : "withdrew";
    this.game.ui.addMessage(`Item ${verb}.`);
    this.game.audio.play("pickup");
  }

  onHotbarResult(msg) {
    if (!msg.ok) return;
    const player = this.game.entities.player;
    for (let i = 0; i < 10; i++) player.hotbar[i] = msg.hotbar[i] || null;
    this.game.ui._hotbarDirty = true;
  }

  onSwapResult(msg) {
    if (!msg.ok) {
      this.game.ui.addMessage("Cannot move that item.");
      return;
    }
    const player = this.game.entities.player;
    if (msg.inventory) {
      for (let i = 0; i < 20; i++) player.inventorySlots[i] = msg.inventory[i] || null;
    }
    if (msg.bank) {
      for (let i = 0; i < 48; i++) player.bank[i] = msg.bank[i] || null;
    }
    this.game.ui._inventoryDirty = true;
    this.game.ui._bankDirty = true;
    this.game.ui._hotbarDirty = true;
  }

  onSplitStackResult(msg) {
    if (!msg.ok) {
      const reasons = { full: "No empty slot to split into.", too_far: "Too far from the banker." };
      this.game.ui.addMessage(reasons[msg.reason] || "Cannot split that stack.");
      return;
    }
    const player = this.game.entities.player;
    if (msg.inventory) {
      for (let i = 0; i < 20; i++) player.inventorySlots[i] = msg.inventory[i] || null;
    }
    if (msg.bank) {
      for (let i = 0; i < 48; i++) player.bank[i] = msg.bank[i] || null;
    }
    this.game.ui._inventoryDirty = true;
    this.game.ui._bankDirty = true;
    this.game.ui._hotbarDirty = true;
  }

  onDropItemResult(msg) {
    if (!msg.ok) {
      this.game.ui.addMessage(msg.reason || "Cannot drop that item.");
      return;
    }
    const player = this.game.entities.player;
    if (msg.inventory) {
      for (let i = 0; i < player.inventorySlots.length; i++) {
        player.inventorySlots[i] = msg.inventory[i] || null;
      }
    } else {
      player.inventorySlots[msg.index] = null;
    }
    this.game.ui._inventoryDirty = true;
    this.game.ui._hotbarDirty = true;
    this.game.ui.addMessage("Item dropped.");
  }

  onGatherResult(msg) {
    if (!msg.success) {
      this.game.ui.addMessage(msg.reason || "Cannot gather that.");
      this.game.stopGathering();
      return;
    }
    const player = this.game.entities.player;
    // Update inventory from server
    if (msg.inventory) {
      for (let i = 0; i < player.inventorySlots.length; i++) {
        player.inventorySlots[i] = msg.inventory[i] || null;
      }
    }
    // Update gathering skills
    if (msg.gatheringSkills) {
      player.gatheringSkills = msg.gatheringSkills;
    }
    this.game.ui._inventoryDirty = true;
    this.game.ui._hotbarDirty = true;
    // Play gathering SFX based on skill type
    const gatherSfx = { mining: "gather_mining", logging: "gather_chopping", fishing: "gather_fishing" };
    this.game.audio.play(gatherSfx[msg.skillId] || "pickup");
    this.game.ui.addMessage(`You gathered ${msg.itemName}. (+${msg.xpGained} ${msg.skillId} XP)`);
    if (msg.leveledUp) {
      this.game.ui.addMessage(`${msg.skillId.charAt(0).toUpperCase() + msg.skillId.slice(1)} leveled up to ${msg.newLevel}!`, "gold");
    }
  }

  /* ═══════════════════════════════════════════════════════
     SOURCE-STYLE ENTITY INTERPOLATION
     ═══════════════════════════════════════════════════════

     Called once per render frame from Game.update(dt).

     The client renders remote entities at a fixed time in the past
     (interpDelay = 2 server ticks = 100 ms at 20 Hz).

     For each entity, we find the two snapshots that bracket the
     target render tick and linearly interpolate x/y between them.

     This guarantees:
       • Perfectly smooth motion (linear between known positions)
       • Zero overshoot / rubberband (never extrapolate)
       • No pulsing (decoupled from packet arrival timing)
       • Framerate-independent (works at any fps)

     Scalar values (HP, dead-status, name, etc.) always come from
     the latest snapshot.  Attack/death overrides patch on top for
     instant visual feedback.
  */

  /**
   * Smoothly apply accumulated server-reconciliation correction.
   * Called once per frame from interpolate().  Blends a fraction of
   * the remaining error into the local player position each frame
   * so corrections feel like a subtle glide, not a hard snap.
   */
  _applyCorrection() {
    const absX = Math.abs(this._correctionX);
    const absY = Math.abs(this._correctionY);
    if (absX < 0.1 && absY < 0.1) {
      this._correctionX = 0;
      this._correctionY = 0;
      return;
    }
    const player = this.game.entities.player;
    const applyX = this._correctionX * this._correctionRate;
    const applyY = this._correctionY * this._correctionRate;
    player.x += applyX;
    player.y += applyY;
    this._correctionX -= applyX;
    this._correctionY -= applyY;
  }

  /**
   * Push a snapshot into the per-entity ring buffer.
   * @param {Map} snapMap – _enemySnaps or _playerSnaps
   * @param {Object} data – entity data from server (must have .id, .x, .y)
   * @param {number} tick – server tick number
   */
  _pushSnap(snapMap, data, tick) {
    let buf = snapMap.get(data.id);
    if (!buf) {
      buf = [];
      snapMap.set(data.id, buf);
    }
    // Avoid duplicate ticks
    if (buf.length > 0 && buf[buf.length - 1].tick >= tick) return;
    buf.push({ tick, x: data.x, y: data.y });
    // Evict oldest if buffer is full
    if (buf.length > this._bufLen) buf.shift();
  }

  /**
   * Convert a client timestamp (performance.now) to a fractional
   * server tick number using the tick↔time mapping table.
   *
   * Uses linear regression over all stored entries for a stable
   * slope estimate that resists packet-arrival jitter.
   */
  _timeToTick(clientTime) {
    const map = this._tickTimeMap;
    const len = map.length;
    if (len === 0) return this._serverTick;
    if (len === 1) {
      const m = map[0];
      return m.tick + (clientTime - m.time) / this._tickMs;
    }
    // Linear regression: tick = slope * time + intercept
    let sumT = 0, sumK = 0, sumTK = 0, sumTT = 0;
    for (let i = 0; i < len; i++) {
      const t = map[i].time;
      const k = map[i].tick;
      sumT += t;
      sumK += k;
      sumTK += t * k;
      sumTT += t * t;
    }
    const denom = len * sumTT - sumT * sumT;
    if (Math.abs(denom) < 1e-9) {
      // Degenerate — fallback to last entry
      const b = map[len - 1];
      return b.tick + (clientTime - b.time) / this._tickMs;
    }
    const slope = (len * sumTK - sumT * sumK) / denom;  // ticks per ms
    const intercept = (sumK - slope * sumT) / len;
    return slope * clientTime + intercept;
  }

  /**
   * Interpolate remote entity positions from the snapshot buffer
   * and write results into entities.enemies and entities.remotePlayers.
   *
   * @param {number} _dt – unused (kept for API compat with Game.update)
   */
  interpolate(_dt) {
    const now = performance.now();

    // ── Apply smooth server-reconciliation correction ──
    this._applyCorrection();

    // Target render tick = current estimated tick - interpDelay
    const currentTick = this._timeToTick(now);
    const renderTick = currentTick - this._interpTicks;

    // ── Enemies ──
    this._interpolateEntities(
      this._enemySnaps, this._latestEnemyMap,
      this._enemyResult, renderTick, this._smoothPosEnemy
    );
    // Patch immediate overrides (attack_result / enemy_killed)
    if (this.enemyOverrides.size > 0) {
      for (let i = 0; i < this._enemyResult.length; i++) {
        const e = this._enemyResult[i];
        const ov = this.enemyOverrides.get(e.id);
        if (ov) {
          if (ov.hp !== undefined)   e.hp = ov.hp;
          if (ov.maxHp !== undefined) e.maxHp = ov.maxHp;
          if (ov.dead !== undefined)  e.dead = ov.dead;
        }
      }
    }
    this.game.entities.enemies = this._enemyResult;

    // ── Remote players (extra interp tick for additional safety margin) ──
    const playerRenderTick = currentTick - (this._interpTicks + 1);
    this._interpolateEntities(
      this._playerSnaps, this._latestPlayerMap,
      this._playerResult, playerRenderTick, this._smoothPosPlayer
    );
    this.game.entities.remotePlayers = this._playerResult;
  }

  /**
   * Handle a server-spawned projectile (arrow or skill projectile).
   * All clients (attacker + observers) receive this and spawn the visual.
   * Damage is computed later on the server when the projectile hits.
   */
  onProjectileSpawn(msg) {
    const enemy = this.game.entities.getEnemyById(msg.targetEnemyId);
    if (!enemy) return;

    if (msg.weaponId) {
      // Weapon attack — spawn arrow
      const weaponDef = this.game.data.items[msg.weaponId];
      this.game.projectiles.spawn({
        sx: msg.sx, sy: msg.sy,
        tx: enemy.x, ty: enemy.y,
        targetId: msg.targetEnemyId,
        speed: msg.speed,
        sprite: "assets/sprites/entities/arrow.png",
        spriteW: 16, spriteH: 32,
        color: "#d4a856",
        trail: "#8b7340",
        size: 3,
        onHit: () => {
          const e = this.game.entities.getEnemyById(msg.targetEnemyId);
          if (e) {
            this.game.particles.emit(weaponDef?.hitParticle || "hit_spark", e.x, e.y);
            this.game.audio.play(weaponDef?.hitSfx || "sword_hit");
          }
        }
      });
    } else if (msg.skillId) {
      // Skill projectile
      const pColors = NetworkSystem._PROJ_COLORS[msg.damageType] || NetworkSystem._PROJ_COLORS.physical;
      const skillDef = this.game.data.skills[msg.skillId];
      this.game.projectiles.spawn({
        sx: msg.sx, sy: msg.sy,
        tx: enemy.x, ty: enemy.y,
        targetId: msg.targetEnemyId,
        speed: msg.speed,
        color: pColors.color,
        trail: pColors.trail,
        size: pColors.size,
        onHit: () => {
          const e = this.game.entities.getEnemyById(msg.targetEnemyId);
          if (e) {
            if (skillDef?.hitParticle) this.game.particles.emit(skillDef.hitParticle, e.x, e.y);
            if (skillDef?.sfx) this.game.audio.play(skillDef.sfx);
          }
        }
      });
    }
  }

  /**
   * Handle a server-side skill projectile hit.
   * Damage was computed by the server when its projectile reached the enemy.
   */
  onProjectileHit(msg) {
    this.enemyOverrides.set(msg.enemyId, { hp: msg.enemyHp, maxHp: msg.enemyMaxHp });
    const skillDef = this.game.data.skills[msg.skillId];
    this.game.ui.addMessage(`${skillDef?.name || msg.skillId} hits for ${msg.damage}.`);

    if (msg.debuff) {
      const enemy = this.game.entities.getEnemyById(msg.enemyId);
      if (enemy) {
        if (!enemy.debuffs) enemy.debuffs = [];
        enemy.debuffs = enemy.debuffs.filter(d => d.id !== msg.debuff.id);
        enemy.debuffs.push({ ...msg.debuff, remaining: msg.debuff.duration });
      }
    }
  }

  /**
   * For each entity in the snapshot map, find snapshots bracketing
   * renderTick and interpolate x/y.  Uses Catmull-Rom spline when
   * 4 neighbouring snapshots are available (smooths out uneven
   * position deltas from send/broadcast phase misalignment).
   * Falls back to linear interpolation near buffer edges.
   *
   * @param {Map}    snapMap   – per-entity snapshot ring buffers
   * @param {Map}    latestMap – latest server data (for scalar fields)
   * @param {Array}  result    – output array (mutated in-place)
   * @param {number} renderTick – fractional tick to render at
   * @param {Map}    smoothMap  – per-entity last-rendered position for output smoothing
   */
  _interpolateEntities(snapMap, latestMap, result, renderTick, smoothMap) {
    result.length = 0;

    for (const [id, buf] of snapMap) {
      const latest = latestMap.get(id);
      if (!latest) continue;

      // Build output entity with all scalar fields from latest snapshot
      const ent = { ...latest };

      if (buf.length < 2) {
        // Not enough snapshots yet — use latest position directly
        result.push(ent);
        continue;
      }

      // Find index of 'to' snapshot: buf[idx-1].tick <= renderTick < buf[idx].tick
      let idx = -1;
      for (let i = buf.length - 1; i >= 1; i--) {
        if (buf[i - 1].tick <= renderTick) {
          idx = i;
          break;
        }
      }

      if (idx >= 0) {
        const p1 = buf[idx - 1];
        const p2 = buf[idx];
        const range = p2.tick - p1.tick;
        const t = range > 0 ? (renderTick - p1.tick) / range : 1;
        const ct = t < 0 ? 0 : t > 1 ? 1 : t;

        // Catmull-Rom spline when we have p0 and p3 neighbours
        if (idx >= 2 && idx + 1 < buf.length) {
          const p0 = buf[idx - 2];
          const p3 = buf[idx + 1];
          const t2 = ct * ct;
          const t3 = t2 * ct;
          ent.x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * ct
            + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
            + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
          ent.y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * ct
            + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
            + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
          // Clamp to p1↔p2 bounding box — prevents spline overshoot
          const minX = p1.x < p2.x ? p1.x : p2.x;
          const maxX = p1.x > p2.x ? p1.x : p2.x;
          const minY = p1.y < p2.y ? p1.y : p2.y;
          const maxY = p1.y > p2.y ? p1.y : p2.y;
          if (ent.x < minX) ent.x = minX;
          else if (ent.x > maxX) ent.x = maxX;
          if (ent.y < minY) ent.y = minY;
          else if (ent.y > maxY) ent.y = maxY;
        } else {
          // Linear fallback at buffer edges
          ent.x = p1.x + (p2.x - p1.x) * ct;
          ent.y = p1.y + (p2.y - p1.y) * ct;
        }
        this._diagLerpHits++;
      } else if (buf.length >= 2) {
        // Dead reckoning: renderTick is past all snapshots.
        // Extrapolate from the last two snapshots' velocity,
        // with exponential decay so it tapers to zero (prevents
        // overshoot when the remote player stops moving).
        const s0 = buf[buf.length - 2];
        const s1 = buf[buf.length - 1];
        const gap = s1.tick - s0.tick;
        if (gap > 0) {
          const vx = (s1.x - s0.x) / gap;
          const vy = (s1.y - s0.y) / gap;
          const speed = Math.sqrt(vx * vx + vy * vy);
          // If effectively stopped (< 0.1 px/tick), hold position
          if (speed < 0.1) {
            ent.x = s1.x;
            ent.y = s1.y;
          } else {
            const overshoot = renderTick - s1.tick;
            const capped = overshoot > 3 ? 3 : overshoot;
            // Exponential decay: velocity halves every tick (aggressive taper)
            const decay = Math.pow(0.5, capped);
            const effectiveTicks = (1 - decay) / 0.6931; // integral of e^(-ln2*t)
            ent.x = s1.x + vx * effectiveTicks;
            ent.y = s1.y + vy * effectiveTicks;
          }
        }
        // else: gap is zero — keep latest position
      } else {
        // Only 1 snapshot — nothing to extrapolate from
      }

      result.push(ent);
    }

    // ── Output smoothing pass ──
    // Blend each entity toward its target position to eliminate
    // any remaining pops from tick jitter or dead-reckoning transitions.
    // Uses a high blend factor (0.45) so it tracks closely but never
    // teleports in a single frame.
    for (let i = 0; i < result.length; i++) {
      const ent = result[i];
      const prev = smoothMap.get(ent.id);
      if (prev) {
        const dx = ent.x - prev.x;
        const dy = ent.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Hard snap if > 150px (teleport/map change), otherwise blend
        if (dist < 150) {
          const blend = 0.45;
          ent.x = prev.x + dx * blend;
          ent.y = prev.y + dy * blend;
        }
        prev.x = ent.x;
        prev.y = ent.y;
      } else {
        smoothMap.set(ent.id, { x: ent.x, y: ent.y });
      }
    }

    // Prune smoothMap entries for entities no longer present
    if (smoothMap.size > result.length + 4) {
      const ids = new Set(result.map(e => e.id));
      for (const id of smoothMap.keys()) {
        if (!ids.has(id)) smoothMap.delete(id);
      }
    }
  }
}
