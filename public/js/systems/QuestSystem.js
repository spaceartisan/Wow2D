export class QuestSystem {
  constructor(game) {
    this.game = game;
    this.showTracker = true;    // whether the quest tracker panel is visible
    this.questDefs = {};        // quest definitions loaded from JSON
    this.quests = {};           // active quest states keyed by quest id
  }

  /**
   * Initialize quest definitions from loaded data.
   * Called after game.data is populated.
   */
  init() {
    this.questDefs = this.game.data?.quests || {};
    // Start all quests in a "not-discovered" state — they only appear
    // once the player talks to the giver NPC.
  }

  /**
   * Check if a quest's prerequisites are met.
   */
  canStartQuest(questId) {
    const def = this.questDefs[questId];
    if (!def) return false;

    // Already started or completed?
    if (this.quests[questId]) return false;

    // Check prerequisites
    for (const preReqId of (def.prerequisiteQuests || [])) {
      const preReq = this.quests[preReqId];
      if (!preReq || preReq.state !== "completed") return false;
    }

    // Check level requirement
    const playerLevel = this.game.entities?.player?.level || 1;
    if (def.level && playerLevel < def.level) return false;

    return true;
  }

  /**
   * Get the best quest marker for an NPC ("!", "?" or null).
   * "?" = has quest ready to turn in
   * "!" = has new quest available
   */
  getNpcQuestMarker(npc) {
    const questIds = npc.questIds || [];
    let hasAvailable = false;

    for (const qid of questIds) {
      const state = this.quests[qid];

      // Ready to turn in (highest priority)
      if (state?.state === "ready_to_turn_in") return "?";

      // Active quest — show progress, no special marker
      if (state?.state === "active") continue;

      // Completed — skip
      if (state?.state === "completed") continue;

      // Not started — check if available
      if (this.canStartQuest(qid)) hasAvailable = true;
    }

    return hasAvailable ? "!" : null;
  }

  /**
   * Called when the player interacts with an NPC (presses E).
   * Handles quest dialog flow for multi-quest NPCs + non-quest NPCs.
   */
  interactWithNPC(npc) {
    this.game.ui._interactNpc = npc;
    const questIds = npc.questIds || [];

    // Priority 1: quests ready to turn in
    for (const qid of questIds) {
      const state = this.quests[qid];
      if (state?.state === "ready_to_turn_in") {
        this._showQuestDialog(npc, qid, state);
        return;
      }
    }

    // Priority 2: active quests (show progress)
    for (const qid of questIds) {
      const state = this.quests[qid];
      if (state?.state === "active") {
        this._showQuestDialog(npc, qid, state);
        return;
      }
    }

    // Priority 3: new quests available
    for (const qid of questIds) {
      if (this.canStartQuest(qid)) {
        this._showQuestDialog(npc, qid, null);
        return;
      }
    }

    // Priority 4: completed quest — show post-completion dialog
    for (const qid of questIds) {
      const state = this.quests[qid];
      if (state?.state === "completed") {
        const def = this.questDefs[qid];
        const dialog = def?.dialog?.completed;
        if (dialog) {
          this._showDialogNode(npc, dialog, def.dialog, { questId: qid, questDef: def, questState: state });
          return;
        }
      }
    }

    // Non-quest NPC: use dialogTree if present, otherwise defaultDialog
    this._showNpcDefaultDialog(npc);
  }

  /* ── Branching dialog helpers ────────────────────────────── */

  /**
   * Show a dialog node (from NPC dialogTree or quest dialog map).
   * @param {Object} npc       - The NPC object
   * @param {Object} node      - { text, options[] }
   * @param {Object} nodeMap   - The full map of nodeId → node (for branching via `next`)
   * @param {Object} [ctx]     - Optional context: { questId, questDef, questState }
   */
  _showDialogNode(npc, node, nodeMap, ctx) {
    let text = node.text || "";
    if (ctx?.questState) {
      text = this._substituteProgress(text, ctx.questDef, ctx.questState);
    }

    const actions = [];

    for (const opt of (node.options || [])) {
      // Check conditions
      if (opt.condition && !this._checkCondition(opt.condition)) continue;

      actions.push({
        label: opt.label,
        callback: () => {
          // Handle quest actions first
          if (opt.action) {
            this._handleDialogAction(opt.action, ctx?.questId, ctx?.questDef, ctx?.questState, npc);
          }
          // Handle NPC service actions
          if (opt.action === "open_shop") {
            this.game.ui.closeNpcDialog();
            this.game.ui.openShop(npc.id, npc.shop);
            return;
          }
          if (opt.action === "open_bank") {
            this.game.ui.closeNpcDialog();
            this.game.ui.openBank();
            return;
          }
          if (opt.action === "open_crafting") {
            this.game.ui.closeNpcDialog();
            this.game.ui.openCraftingStation(npc.craftingSkill);
            return;
          }
          // Branch to next node
          if (opt.next && nodeMap?.[opt.next]) {
            this._showDialogNode(npc, nodeMap[opt.next], nodeMap, ctx);
            return;
          }
          // "close" or no next — close dialog
        },
        closesDialog: !opt.next && opt.action !== "open_shop" && opt.action !== "open_bank" && opt.action !== "open_crafting"
      });
    }

    // Append NPC service buttons if this is a root/leaf node with no explicit service actions
    const hasServiceAction = (node.options || []).some(o =>
      o.action === "open_shop" || o.action === "open_bank" || o.action === "open_crafting"
    );
    if (!hasServiceAction) {
      this._appendServiceActions(npc, actions);
    }

    this.game.ui.showNpcDialog(npc.name, text, actions);
  }

  /**
   * Check whether a dialog option condition is met.
   * condition: { questComplete: "id", questActive: "id", minLevel: n }
   */
  _checkCondition(cond) {
    if (cond.questComplete) {
      if (this.quests[cond.questComplete]?.state !== "completed") return false;
    }
    if (cond.questActive) {
      const s = this.quests[cond.questActive]?.state;
      if (s !== "active" && s !== "ready_to_turn_in") return false;
    }
    if (cond.questNotStarted) {
      const s = this.quests[cond.questNotStarted]?.state;
      if (s && s !== "not_started") return false;
    }
    if (cond.minLevel) {
      if ((this.game.entities?.player?.level || 1) < cond.minLevel) return false;
    }
    return true;
  }

  /**
   * Show the NPC's default dialog (dialogTree or plain defaultDialog).
   */
  _showNpcDefaultDialog(npc) {
    const tree = npc.dialogTree;
    if (tree && tree.root) {
      this._showDialogNode(npc, tree.root, tree, null);
      return;
    }

    // Legacy fallback: plain defaultDialog with auto service buttons
    const actions = [];
    this._appendServiceActions(npc, actions);
    this.game.ui.showNpcDialog(npc.name, npc.dialog || npc.defaultDialog || "...", actions);
  }

  /**
   * Append shop / bank / crafting buttons to an actions array.
   */
  _appendServiceActions(npc, actions) {
    if (npc.shop && npc.shop.length > 0) {
      actions.push({
        label: "Browse Wares",
        callback: () => {
          this.game.ui.closeNpcDialog();
          this.game.ui.openShop(npc.id, npc.shop);
        },
        closesDialog: false
      });
    }
    if (npc.type === "banker") {
      actions.push({
        label: "Open Bank",
        callback: () => {
          this.game.ui.closeNpcDialog();
          this.game.ui.openBank();
        },
        closesDialog: false
      });
    }
    if (npc.type === "crafting_station" && npc.craftingSkill) {
      const skillDef = this.game.data.gatheringSkills?.[npc.craftingSkill];
      const stationLabel = skillDef ? skillDef.name : npc.craftingSkill;
      actions.push({
        label: `Open ${stationLabel}`,
        callback: () => {
          this.game.ui.closeNpcDialog();
          this.game.ui.openCraftingStation(npc.craftingSkill);
        },
        closesDialog: false
      });
    }
  }

  _showQuestDialog(npc, questId, questState) {
    const def = this.questDefs[questId];
    if (!def) return;

    const state = questState?.state || "not_started";
    const dialogDef = def.dialog?.[state];
    if (!dialogDef) return;

    // Use the branching dialog system — quest dialog nodes live in def.dialog
    this._showDialogNode(npc, dialogDef, def.dialog, { questId, questDef: def, questState });
  }

  _substituteProgress(text, def, questState) {
    // Replace {progress} with current objective progress
    const objectives = def.objectives || [];
    const progressParts = [];

    for (let i = 0; i < objectives.length; i++) {
      const obj = objectives[i];
      const current = questState.progress?.[i] || 0;
      progressParts.push(`${current}/${obj.count}`);
    }

    return text.replace(/\{progress\}/g, progressParts.join(", "));
  }

  _handleDialogAction(action, questId, def, questState, npc) {
    switch (action) {
      case "accept":
        this._acceptQuest(questId, def);
        break;
      case "complete":
        this._completeQuest(questId, def, questState);
        break;
      case "close":
      default:
        break;
    }
  }

  _acceptQuest(questId, def) {
    const objectives = def.objectives || [];
    this.quests[questId] = {
      id: questId,
      name: def.name,
      description: def.description,
      giver: def.giver,
      state: "active",
      tracked: true,
      progress: objectives.map(() => 0)
    };

    this.game.ui.addChatMessage("system", `Quest accepted: ${def.name}`);
    for (const obj of objectives) {
      this.game.ui.addChatMessage("system", `Objective: ${obj.label} (0/${obj.count})`);
    }

    // Sync quest state to server for persistence
    if (this.game.network) {
      this.game.network.sendQuestStateUpdate(this.quests);
    }
  }

  _completeQuest(questId, def, questState) {
    questState.state = "completed";

    // Send to server for authoritative reward granting
    if (this.game.network) {
      this.game.network.sendCompleteQuest(questId);
    }

    const rewards = def.rewards || {};
    const items = this.game.data?.items || {};

    const rewardParts = [];
    if (rewards.xp) rewardParts.push(`+${rewards.xp} XP`);
    if (rewards.gold) rewardParts.push(`+${rewards.gold} gold`);

    for (const itemId of (rewards.items || [])) {
      const template = items[itemId];
      if (template) {
        rewardParts.push(template.name);
      }
    }

    this.game.ui.addChatMessage("system", `Quest complete: ${rewardParts.join(", ")}`);
    this.game.audio.play("quest_complete");
  }

  /**
   * Called when an enemy is killed (by type, e.g. "wolf").
   * Updates progress on all active quests with matching kill objectives.
   */
  onEnemyKilled(enemyType) {
    for (const [questId, questState] of Object.entries(this.quests)) {
      if (questState.state !== "active") continue;

      const def = this.questDefs[questId];
      if (!def) continue;

      const objectives = def.objectives || [];
      let allComplete = true;

      // Ensure progress array exists (may be missing if loaded from DB)
      if (!Array.isArray(questState.progress)) {
        questState.progress = objectives.map(() => 0);
      }

      for (let i = 0; i < objectives.length; i++) {
        const obj = objectives[i];
        if (obj.type === "kill" && obj.target === enemyType) {
          questState.progress[i] = Math.min((questState.progress[i] || 0) + 1, obj.count);
          this.game.ui.addMessage(`Quest update: ${obj.label} ${questState.progress[i]}/${obj.count}`);
        }
        if ((questState.progress[i] || 0) < obj.count) {
          allComplete = false;
        }
      }

      if (allComplete) {
        questState.state = "ready_to_turn_in";
        const giverNpc = this.game.data?.npcs?.[def.giver];
        const giverName = giverNpc?.name || def.giver;
        this.game.ui.addMessage(`Return to ${giverName} for your reward.`);
      }
    }

    // Sync quest progress to server for persistence
    if (this.game.network) {
      this.game.network.sendQuestStateUpdate(this.quests);
    }
  }

  /**
   * Build tracker text from all tracked quests.
   */
  getTrackerText() {
    const entries = [];

    for (const [questId, questState] of Object.entries(this.quests)) {
      if (!questState.tracked) continue;
      if (questState.state === "completed") continue;   // hide completed from tracker

      const def = this.questDefs[questId];
      if (!def) continue;

      if (questState.state === "active") {
        const objectives = def.objectives || [];
        const parts = objectives.map((obj, i) => {
          const current = questState.progress?.[i] || 0;
          return `${current}/${obj.count} ${obj.label}`;
        });
        entries.push(`${def.name}: ${parts.join(", ")}`);
      } else if (questState.state === "ready_to_turn_in") {
        const giverNpc = this.game.data?.npcs?.[def.giver];
        const giverName = giverNpc?.name || def.giver;
        entries.push(`${def.name}: Return to ${giverName}`);
      }
    }

    return entries.length > 0 ? entries.join("\n") : "No tracked quests.";
  }
}