/**
 * NetworkSystem – client-side WebSocket manager with entity smoothing.
 *
 * Server sends world-state at ~20 Hz.  Rather than snapping entities to
 * the latest position (which would cause 20 Hz stutter), we use per-entity
 * exponential smoothing: each entity has a render position that smoothly
 * converges toward the latest server-authoritative position every frame.
 *
 * This approach has zero timing complexity (no clock sync, no snapshot
 * buffer, no interpolation delay) and physically cannot rubberband because
 * positions only ever move toward the target, never overshoot.
 *
 * Local player movement is still client-authoritative (no smoothing
 * needed), and scalar values like HP / mana are applied instantly for
 * responsive feedback.
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

    /* ── entity smoothing state ──────────────────────── */

    /** Latest server-authoritative entity arrays */
    this.latestEnemies = [];
    this.latestPlayers = [];

    /**
     * Convergence rate for exponential smoothing (units: 1/sec).
     * Higher = snappier / less lag.  At rate 12 and 60 fps, ~100 ms
     * of effective visual lag, settling to <1 px in ~250 ms.
     */
    this.smoothRate = 8;

    /**
     * Immediate overrides applied on top of smoothed data.
     */
    this.enemyOverrides = new Map(); // enemyId → partial object

    /**
     * Persistent entity caches – reused each frame to avoid per-frame
     * object / array allocation and reduce GC pressure.
     */
    this._enemyCache = new Map();
    this._playerCache = new Map();
    this._enemyResult = [];
    this._playerResult = [];

    /** Generation counter — incremented on each server state update */
    this._stateGen = 0;
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

      // send position updates at ~15 Hz
      this.positionSendInterval = setInterval(() => this.sendPosition(), 66);
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
    this.lastSentX = player.x;
    this.lastSentY = player.y;
    this.send({ type: "move", x: player.x, y: player.y, level: player.level, floor: this.game.world.currentFloor });
  }

  sendAttack(enemyId) {
    this.send({ type: "attack", enemyId });
  }

  sendHeal() {
    this.send({ type: "heal" });
  }

  sendChat(text) {
    this.send({ type: "chat", text });
  }

  sendUseItem(index) {
    this.send({ type: "use_item", index });
  }

  sendSellItem(index) {
    this.send({ type: "sell_item", index });
  }

  sendBuyItem(itemId, npcId) {
    this.send({ type: "buy_item", itemId, npcId });
  }

  sendEquipItem(index) {
    this.send({ type: "equip_item", index });
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

  onWelcome(msg) {
    this.myId = msg.playerId;

    const now = performance.now();

    this.latestEnemies = msg.enemies || [];
    this.latestPlayers = (msg.players || []).filter((p) => p.id !== this.myId);

    // Reset caches so entities snap to initial positions
    this._enemyCache.clear();
    this._playerCache.clear();

    this.game.entities.drops = (msg.drops || []).map((d) => ({
      ...d,
      expiresAt: now + 25000
    }));

    // Load authoritative inventory, equipment, and stats from server
    const player = this.game.entities.player;
    if (msg.inventory) {
      for (let i = 0; i < 20; i++) {
        player.inventorySlots[i] = msg.inventory[i] || null;
      }
    }
    if (msg.equipment) {
      player.equipment.weapon = msg.equipment.weapon || null;
      player.equipment.armor = msg.equipment.armor || null;
      player.equipment.trinket = msg.equipment.trinket || null;
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

    this.game.ui.addMessage("Connected to server.");
  }

  onWorldState(msg) {
    const now = performance.now();

    // Bump generation so _smoothEntities can detect new data
    this._stateGen++;

    // Store latest authoritative positions for smoothing
    this.latestEnemies = msg.enemies || [];
    this.latestPlayers = (msg.players || []).filter((p) => p.id !== this.myId);

    // Clear immediate overrides – the new state is authoritative
    this.enemyOverrides.clear();

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

      // Update shop gold display + button states without full re-render
      if (this.game.ui?.shopOpen) this.game.ui.refreshShopGold();

      // Server-authoritative position correction (prevent desync)
      if (msg.you.x !== undefined && msg.you.y !== undefined) {
        const dx = player.x - msg.you.x;
        const dy = player.y - msg.you.y;
        const drift = Math.sqrt(dx * dx + dy * dy);
        if (drift > 60) {
          // Snap if too far off
          player.x = msg.you.x;
          player.y = msg.you.y;
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
        dstDrops[i] = { id: sd.id, x: sd.x, y: sd.y, expiresAt: now + 5000 };
      } else {
        dd.x = sd.x;
        dd.y = sd.y;
      }
    }
  }

  onAttackResult(msg) {
    // Store override so the HP bar updates instantly even though the
    // interpolated snapshot hasn't caught up yet.
    this.enemyOverrides.set(msg.enemyId, {
      hp: msg.enemyHp,
      maxHp: msg.enemyMaxHp
    });
    this.game.ui.addMessage(`You strike for ${msg.damage} damage.`);
    this.game.audio.play("sword_hit");
  }

  onEnemyKilled(msg) {
    this.enemyOverrides.set(msg.enemyId, { hp: 0, dead: true });

    this.game.entities.grantXp(msg.xpReward);
    this.game.quests.onEnemyKilled(msg.enemyType);
    this.game.combat.clearTarget();
    this.game.ui.addMessage(`Enemy slain! +${msg.xpReward} XP`);
    this.game.audio.play("enemy_death");
  }

  onPlayerDamaged(msg) {
    const player = this.game.entities.player;
    player.hp = msg.hp;
    this.game.ui.addMessage(`${msg.attackerName} hits you for ${msg.damage}.`);
  }

  onPlayerDied() {
    const player = this.game.entities.player;
    player.dead = true;
    player.deathUntil = performance.now() + 4200;
    // Gold penalty is now server-authoritative; don't modify locally
    this.game.ui.addMessage("You died.");
    this.game.audio.play("player_death");
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
    const now = performance.now();

    // Reset entity caches for the new map
    this._enemyCache.clear();
    this._playerCache.clear();

    this.latestEnemies = msg.enemies || [];
    this.latestPlayers = (msg.players || []).filter((p) => p.id !== this.myId);
    this.enemyOverrides.clear();

    this.game.entities.drops = (msg.drops || []).map((d) => ({
      ...d,
      expiresAt: now + 25000
    }));

    this.game.combat.clearTarget();
  }

  onDropSpawned(msg) {
    // drops get fully synced via state messages; this is just a notification
  }

  onDropRemoved(msg) {
    this.game.entities.drops = this.game.entities.drops.filter((d) => d.id !== msg.dropId);
  }

  onUseItemResult(msg) {
    if (!msg.ok) {
      this.game.ui.addMessage("Cannot use that item.");
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
    }
    this.game.audio.play("pickup");
  }

  onSellItemResult(msg) {
    if (!msg.ok) return;
    const player = this.game.entities.player;
    player.inventorySlots[msg.index] = msg.remainingItem || null;
    player.gold = msg.gold;
    this.game.ui._inventoryDirty = true;
    this.game.ui._hotbarDirty = true;
    this.game.ui.addMessage(`Sold ${msg.soldName} for ${msg.sellPrice} gold.`);
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
      // Server rejected — revert client-side equip
      this.game.ui.addMessage("Cannot equip that right now.");
      return;
    }
    const player = this.game.entities.player;
    // Server is authoritative — apply the swap
    player.equipment[msg.slot] = msg.newItem || null;
    player.inventorySlots[msg.index] = msg.oldItem || null;
    player.hp = msg.hp;
    player.maxHp = msg.maxHp;
    player.mana = msg.mana;
    player.maxMana = msg.maxMana;
    player.damage = msg.damage;
    this.game.ui._inventoryDirty = true;
    this.game.ui._equipmentDirty = true;
    this.game.ui._hotbarDirty = true;
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
  }

  onHearthstoneCastCancelled(msg) {
    this.game.ui.hideCastBar();
    if (msg.reason === "damaged") {
      this.game.ui.addMessage("Hearthstone interrupted!");
    } else if (msg.reason === "manual") {
      this.game.ui.addMessage("Hearthstone cancelled.");
    }
  }

  onHearthstoneTeleport(msg) {
    this.game.ui.hideCastBar();
    const player = this.game.entities.player;
    player.hearthstone = msg.hearthstone;

    if (msg.mapId !== this.game.world.mapId) {
      // Cross-map teleport — must await map load before creating NPCs
      this.game.world.loadMap(msg.mapId).then(() => {
        this.game.entities.npcs = this.game.entities.createNpcs();
        this.game.entities.statues = this.game.entities.createStatues();
      });
      this.latestEnemies = msg.enemies || [];
      this.latestPlayers = (msg.players || []).filter(p => p.id !== this.myId);
      this.latestDrops = msg.drops || [];
      this._enemyCache.clear();
      this._playerCache.clear();
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

  /* ═══════════════════════════════════════════════════════
     ENTITY SMOOTHING
     ═══════════════════════════════════════════════════════

     Called once per render frame from Game.update(dt).

     Instead of buffering snapshots and synchronising clocks, each
     remote entity simply has a render position that exponentially
     converges toward the latest server-authoritative position.

     This approach:
       • Has zero timing complexity (no clock sync, no snapshot delay)
       • Cannot rubberband (position only moves toward target)
       • Is framerate-independent via dt-aware smoothing factor
       • Gives ~80 ms effective visual lag at rate=15

     Scalar values (HP, dead-status, etc.) are always taken directly
     from the latest server state.  Overrides from attack_result /
     enemy_killed patch on top for instant feedback.
  */

  /**
   * Smooth remote entity positions toward their latest server positions
   * and write results into `entities.enemies` and `entities.remotePlayers`.
   *
   * @param {number} dt – frame delta time in seconds (from Game.update)
   */
  interpolate(dt) {
    // Frame-rate-independent smoothing factor.
    const factor = 1 - Math.exp(-this.smoothRate * (dt || 0.016));

    // ── Enemies ──
    this._smoothEntities(this._enemyCache, this._enemyResult, this.latestEnemies, factor, dt);

    // Patch overrides (attack_result / enemy_killed)
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

    // ── Remote players ──
    this._smoothEntities(this._playerCache, this._playerResult, this.latestPlayers, factor, dt);
    this.game.entities.remotePlayers = this._playerResult;
  }

  /**
   * Smooth each entity's render position toward a dead-reckoned
   * predicted position.  Between server updates, the target advances
   * at constant velocity (computed from consecutive server positions),
   * eliminating the speed-pulsing artefact of pure exponential smoothing.
   *
   * @param {Map}    cache   – persistent id → object cache
   * @param {Array}  result  – output array (mutated in-place)
   * @param {Array}  latest  – latest server entity data
   * @param {number} factor  – frame-rate-independent smoothing factor
   * @param {number} dt      – frame delta time in seconds
   */
  _smoothEntities(cache, result, latest, factor, dt) {
    result.length = latest.length;

    const alive = this._aliveSet || (this._aliveSet = new Set());
    alive.clear();

    for (let i = 0; i < latest.length; i++) {
      const src = latest[i];
      alive.add(src.id);

      let ent = cache.get(src.id);
      if (!ent) {
        // First time seeing this entity — snap to position
        ent = {};
        Object.assign(ent, src);
        ent._rx = src.x;
        ent._ry = src.y;
        ent._targetX = src.x;
        ent._targetY = src.y;
        ent._vx = 0;
        ent._vy = 0;
        ent._lastServerX = src.x;
        ent._lastServerY = src.y;
        ent._gen = this._stateGen;
        cache.set(src.id, ent);
      } else {
        const rx = ent._rx;
        const ry = ent._ry;

        // Check if a new server update arrived since last frame
        const newUpdate = this._stateGen !== ent._gen;
        if (newUpdate) {
          ent._gen = this._stateGen;

          if (src.x !== ent._lastServerX || src.y !== ent._lastServerY) {
            // Entity moved — compute velocity and update target
            const invTickDt = 20; // 1 / 0.05
            ent._vx = (src.x - ent._lastServerX) * invTickDt;
            ent._vy = (src.y - ent._lastServerY) * invTickDt;
            ent._targetX = src.x;
            ent._targetY = src.y;
            ent._lastServerX = src.x;
            ent._lastServerY = src.y;
          } else {
            // Entity is stationary — zero velocity, snap target
            ent._vx = 0;
            ent._vy = 0;
            ent._targetX = src.x;
            ent._targetY = src.y;
          }
        } else {
          // Between server updates: advance target at constant velocity
          ent._targetX += ent._vx * dt;
          ent._targetY += ent._vy * dt;
        }

        // Copy all scalar fields from server (hp, dead, name, etc.)
        Object.assign(ent, src);

        // Smoothly converge render position toward predicted target
        ent._rx = rx + (ent._targetX - rx) * factor;
        ent._ry = ry + (ent._targetY - ry) * factor;
      }

      // Entities are drawn at the smoothed render position
      ent.x = ent._rx;
      ent.y = ent._ry;

      result[i] = ent;
    }

    // Prune entities that are no longer present
    if (cache.size > alive.size) {
      cache.forEach((_val, id) => {
        if (!alive.has(id)) cache.delete(id);
      });
    }
  }
}
