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
          const actions = [];
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
          this.game.ui.showNpcDialog(npc.name, dialog.text, actions);
          return;
        }
      }
    }

    // Non-quest NPC dialog (or vendor/banker with no quests)
    const actions = [];
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
    this.game.ui.showNpcDialog(npc.name, npc.dialog || "...", actions);
  }

  _showQuestDialog(npc, questId, questState) {
    const def = this.questDefs[questId];
    if (!def) return;

    const state = questState?.state || "not_started";
    const dialogDef = def.dialog?.[state];
    if (!dialogDef) return;

    // Build dialog text with progress substitutions
    let text = dialogDef.text || "";
    if (questState) {
      text = this._substituteProgress(text, def, questState);
    }

    // Build action buttons
    const actions = (dialogDef.options || []).map(opt => ({
      label: opt.label,
      callback: () => this._handleDialogAction(opt.action, questId, def, questState, npc)
    }));

    this.game.ui.showNpcDialog(npc.name, text, actions);
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