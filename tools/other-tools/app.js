
(() => {
  const ITEM_TYPES = ['weapon', 'armor', 'shield', 'helmet', 'pants', 'boots', 'ring', 'amulet', 'trinket', 'quiver', 'tool', 'material', 'consumable', 'junk', 'hearthstone'];
  const DEFAULT_NEW_TILE = { color: [128, 128, 128], blocked: false };
  const DEFAULT_NEW_ITEM = {
    id: 'newItem',
    name: 'New Item',
    type: 'junk',
    icon: 'newItem',
    value: 0,
    description: '',
  };
  const DEFAULT_NEW_ENEMY = {
    name: 'New Enemy',
    maxHp: 50,
    damage: 5,
    speed: 80,
    xp: 10,
    goldMin: 1,
    goldMax: 3,
    respawnSeconds: 10,
    color: '#808080',
    radius: 14,
    aggroRange: 160,
    attackRange: 32,
    attackCooldown: 1.25,
    loot: [],
  };
  const NPC_TYPES = ['quest_giver', 'vendor', 'banker', 'crafting_station'];
  const DEFAULT_NEW_NPC = {
    id: 'newNpc',
    name: 'New NPC',
    color: '#C8B060',
    type: 'quest_giver',
    defaultDialog: '',
    questIds: [],
    shop: [],
  };

  const DEFAULT_NEW_QUEST = {
    id: 'newQuest',
    name: 'New Quest',
    giver: '',
    description: '',
    level: 1,
    prerequisiteQuests: [],
    objectives: [{ type: 'kill', target: '', count: 1, label: '' }],
    rewards: { xp: 0, gold: 0, items: [] },
    dialog: {
      not_started: { text: '', options: [] },
      active: { text: '', options: [] },
      ready_to_turn_in: { text: '', options: [] },
      completed: { text: '', options: [] },
    },
  };

  const state = {
    activeTab: 'tilePalette',
    tilePalette: {},
    selectedTileKey: null,
    tileSearch: '',
    tileDirty: false,
    tileSpriteExists: null,
    pendingScanIds: [],
    scanMeta: null,

    items: {},
    selectedItemKey: null,
    itemSearch: '',
    itemDirty: false,
    itemIconExists: null,

    enemies: {},
    selectedEnemyKey: null,
    enemySearch: '',
    enemyDirty: false,
    enemySpriteExists: null,

    npcs: {},
    quests: {},
    selectedNpcKey: null,
    npcSearch: '',
    npcDirty: false,
    npcSpriteExists: null,

    selectedQuestKey: null,
    questSearch: '',
    questDirty: false,
    serverOnline: false,

    playerBase: null,
    playerBaseDirty: false,

    props: {},
    selectedPropKey: null,
    propSearch: '',
    propDirty: false,
    propSpriteExists: null,
    pendingPropScanIds: [],

    particles: {},
    selectedParticleKey: null,
    particleSearch: '',
    particleDirty: false,

    skills: {},
    selectedSkillKey: null,
    skillSearch: '',
    skillDirty: false,
    skillIconExists: null,

    statusEffects: {},
    selectedStatusEffectKey: null,
    statusEffectSearch: '',
    statusEffectDirty: false,
    statusEffectIconExists: null,

    gatheringSkills: {},
    selectedGatheringSkillKey: null,
    gatheringSkillSearch: '',
    gatheringSkillDirty: false,

    resourceNodes: {},
    selectedResourceNodeKey: null,
    resourceNodeSearch: '',
    resourceNodeDirty: false,
    resourceNodeSpriteExists: null,

    recipes: {},
    selectedRecipeKey: null,
    recipeSearch: '',
    recipeDirty: false,
  };

  const els = {};
  const ids = [
    'connectionBadge','dirtyBadge','loadButton','saveButton',
    'reloadButton','validateButton','scanTilesButton','addTileButton','duplicateTileButton','deleteTileButton','searchInput','tileList','entryCount','blockedCount','selectedTileLabel','emptyState','tileForm','tileIdInput','tileBlockedInput','tileColorPicker','tileRInput','tileGInput','tileBInput','colorPreview','spritePreviewImage','spritePreviewFallback','spriteStatusBadge','spritePathLabel','entryJsonPreview','diagnosticsList','validationSummary','tileListItemTemplate','scanModal','scanModalSubtitle','scanModalCloseButton','scanCancelButton','scanConfirmButton','scanNewCount','scanExistingCount','scanSpriteDirLabel','scanTileIdList',
    'itemSearchInput','itemList','itemEntryCount','itemTypeCount','selectedItemLabel','itemEmptyState','itemForm','itemIdInput','itemNameInput','itemTypeInput','itemIconInput','itemValueInput','itemStackSizeInput','itemDescriptionInput','itemStatsAttackInput','itemStatsHpInput','itemStatsManaInput','itemStatsDefenseInput','itemRarityInput','itemDismantleableInput','itemDismantleEditor','itemDismantleEmptyState','itemDismantleAddButton','itemEffectsEditor','itemEffectsEmptyState','itemEffectAddButton','itemAttackBonusInput','itemHandedInput','itemWeaponTypeInput','itemRequiresQuiverInput','itemWeaponRangeInput','itemHpBonusInput','itemManaBonusInput','itemMaxArrowsInput','itemToolTypeInput','itemToolTierInput','itemGatheringLevelReqInput','itemPermanentInput','itemConcentrationInput','itemCastTimeInput','itemCooldownInput','itemHitParticleInput','itemHitSfxInput','itemSwingSfxInput','itemUseParticleInput','itemUseSfxInput','itemIconPreviewImage','itemIconPreviewFallback','itemIconStatusBadge','itemIconPathLabel','itemJsonPreview','itemDiagnosticsList','itemValidationSummary','itemListItemTemplate','addItemButton','duplicateItemButton','deleteItemButton','validateItemsButton','reloadItemsButton',
    'enemySearchInput','enemyList','enemyEntryCount','enemyLootRefCount','selectedEnemyLabel','enemyEmptyState','enemyForm','enemyIdInput','enemyNameInput','enemyPreviewImage','enemyPreviewFallback','enemySpriteStatusBadge','enemySpritePathLabel','enemyColorPreview','enemyMaxHpInput','enemyDamageInput','enemySpeedInput','enemyXpInput','enemyGoldMinInput','enemyGoldMaxInput','enemyRespawnSecondsInput','enemyColorInput','enemyRadiusInput','enemyAggroRangeInput','enemyAttackRangeInput','enemyAttackCooldownInput','enemyLootEditor','enemyLootEmptyState','enemyLootAddButton','enemyJsonPreview','enemyDiagnosticsList','enemyValidationSummary','enemyListItemTemplate','addEnemyButton','duplicateEnemyButton','deleteEnemyButton','validateEnemiesButton','reloadEnemiesButton',
    'npcSearchInput','npcList','npcEntryCount','npcVendorCount','selectedNpcLabel','npcEmptyState','npcForm','npcIdInput','npcNameInput','npcTypeInput','npcColorInput','npcPreviewImage','npcPreviewFallback','npcSpriteStatusBadge','npcSpritePathLabel','npcColorPreview','npcDefaultDialogInput','npcCraftingSkillInput','npcQuestEditor','npcQuestEmptyState','npcQuestAddButton','npcShopEditor','npcShopEmptyState','npcShopAddButton','npcJsonPreview','npcDiagnosticsList','npcValidationSummary','addNpcButton','duplicateNpcButton','deleteNpcButton','validateNpcsButton','reloadNpcsButton',
    'questSearchInput','questList','questEntryCount','questObjectiveCount','selectedQuestLabel','questEmptyState','questForm','questIdInput','questNameInput','questGiverInput','questLevelInput','questDescriptionInput','questPrereqEditor','questPrereqEmptyState','questPrereqAddButton','questObjectivesEditor','questObjectivesEmptyState','questObjectiveAddButton','questRewardXpInput','questRewardGoldInput','questRewardItemsEditor','questRewardItemsEmptyState','questRewardItemAddButton','questDialogNotStartedTextInput','questDialogNotStartedOptionsEditor','questDialogNotStartedOptionsEmptyState','questDialogNotStartedAddButton','questDialogActiveTextInput','questDialogActiveOptionsEditor','questDialogActiveOptionsEmptyState','questDialogActiveAddButton','questDialogReadyTextInput','questDialogReadyOptionsEditor','questDialogReadyOptionsEmptyState','questDialogReadyAddButton','questDialogCompletedTextInput','questDialogCompletedOptionsEditor','questDialogCompletedOptionsEmptyState','questDialogCompletedAddButton','questJsonPreview','questDiagnosticsList','questValidationSummary','addQuestButton','duplicateQuestButton','deleteQuestButton','validateQuestsButton','reloadQuestsButton',
    'playerBaseForm','pbMaxHpInput','pbMaxManaInput','pbDamageInput','pbHpPerLevelInput','pbManaPerLevelInput','pbDamagePerLevelInput','pbMoveSpeedInput','pbAttackRangeInput','pbAttackCooldownInput','pbClassesEditor','playerBaseJsonPreview','playerBaseDiagnosticsList','playerBaseValidationSummary','validatePlayerBaseButton','reloadPlayerBaseButton',
    'propSearchInput','propList','propEntryCount','propBlockedCount','selectedPropLabel','propEmptyState','propForm','propIdInput','propBlockedInput','propColorPicker','propRInput','propGInput','propBInput','propColorPreview','propSpritePreviewImage','propSpritePreviewFallback','propSpriteStatusBadge','propSpritePathLabel','propJsonPreview','propDiagnosticsList','propValidationSummary','addPropButton','duplicatePropButton','deletePropButton','validatePropsButton','reloadPropsButton','scanPropsButton',
    'particleSearchInput','particleList','particleEntryCount','particleAdditiveCount','selectedParticleLabel','particleEmptyState','particleForm','particleIdInput','particleBlendModeInput','particleEmitIntervalInput','particleContinuousInput','particleFadeOutInput','particleCountMinInput','particleCountMaxInput','particleLifetimeMinInput','particleLifetimeMaxInput','particleSpeedMinInput','particleSpeedMaxInput','particleAngleMinInput','particleAngleMaxInput','particleGravityInput','particleFrictionInput','particleSizeMinInput','particleSizeMaxInput','particleSizeEndInput','particleColorEditor','particleColorEmptyState','particleColorSwatchRow','particleColorAddButton','particleJsonPreview','particleDiagnosticsList','particleValidationSummary','addParticleButton','duplicateParticleButton','deleteParticleButton','validateParticlesButton','reloadParticlesButton','particlePreviewCanvas','particleEmitButton','particleClearButton',
    'skillSearchInput','skillList','skillEntryCount','skillTypeCount','selectedSkillLabel','skillEmptyState','skillForm','skillIdInput','skillNameInput','skillTypeInput','skillTargetingInput','skillIconInput','skillLevelReqInput','skillManaCostInput','skillCooldownInput','skillRangeInput','skillDescriptionInput','skillClassesExtraInput','skillParticleInput','skillHitParticleInput','skillSfxInput','skillCastSfxInput','skillProjectileSpeedInput','skillDamageInput','skillDamagePerLevelInput','skillDamageTypeInput','skillAoeRadiusInput','skillHitsInput','skillHitIntervalInput','skillChanneledInput','skillHealAmountInput','skillHealPerLevelInput','skillHealTicksInput','skillHealIntervalInput','skillHealChanneledInput','skillJsonPreview','skillDiagnosticsList','skillValidationSummary','addSkillButton','duplicateSkillButton','deleteSkillButton','validateSkillsButton','reloadSkillsButton','skillIconPreviewImage','skillIconPreviewFallback','skillIconStatusBadge','skillIconPathLabel',
    'enemyHitParticleInput','enemyHitSfxInput',
    'itemHitParticleInput','itemHitSfxInput','itemSwingSfxInput','itemUseParticleInput','itemUseSfxInput',
    'pbHitParticleInput','pbHitSfxInput','pbSwingSfxInput',
    'statusEffectSearchInput','statusEffectList','statusEffectEntryCount','statusEffectBuffCount','selectedStatusEffectLabel','statusEffectEmptyState','statusEffectForm','statusEffectIdInput','statusEffectNameInput','statusEffectDescriptionInput','statusEffectTypeInput','statusEffectIconInput','statusEffectJsonPreview','statusEffectDiagnosticsList','statusEffectValidationSummary','addStatusEffectButton','duplicateStatusEffectButton','deleteStatusEffectButton','validateStatusEffectsButton','reloadStatusEffectsButton','statusEffectIconPreviewImage','statusEffectIconPreviewFallback','statusEffectIconStatusBadge','statusEffectIconPathLabel',
    'skillRequiresWeaponInput','skillRequiresShieldInput','skillRequiresWeaponTypeInput',
    'gatheringSkillSearchInput','gatheringSkillList','gatheringSkillEntryCount','gatheringSkillToolCount','selectedGatheringSkillLabel','gatheringSkillEmptyState','gatheringSkillForm','gatheringSkillIdInput','gatheringSkillNameInput','gatheringSkillIconInput','gatheringSkillToolTypeInput','gatheringSkillCategoryInput','gatheringSkillDescriptionInput','gatheringSkillJsonPreview','gatheringSkillDiagnosticsList','gatheringSkillValidationSummary','addGatheringSkillButton','duplicateGatheringSkillButton','deleteGatheringSkillButton','validateGatheringSkillsButton','reloadGatheringSkillsButton',
    'resourceNodeSearchInput','resourceNodeList','resourceNodeEntryCount','resourceNodeSkillCount','selectedResourceNodeLabel','resourceNodeEmptyState','resourceNodeForm','resourceNodeIdInput','resourceNodeNameInput','resourceNodeSpriteImage','resourceNodeSpriteFallback','resourceNodeSpriteStatusBadge','resourceNodeSpritePathLabel','resourceNodeColorPreview','resourceNodeSkillInput','resourceNodeToolTypeInput','resourceNodeToolTierInput','resourceNodeRequiredLevelInput','resourceNodeXpInput','resourceNodeMaxHarvestsInput','resourceNodeRespawnTicksInput','resourceNodeGatherItemInput','resourceNodeColorPicker','resourceNodeRInput','resourceNodeGInput','resourceNodeBInput','resourceNodeJsonPreview','resourceNodeDiagnosticsList','resourceNodeValidationSummary','addResourceNodeButton','duplicateResourceNodeButton','deleteResourceNodeButton','validateResourceNodesButton','reloadResourceNodesButton',
    'recipeSearchInput','recipeList','recipeEntryCount','recipeSkillCount','selectedRecipeLabel','recipeEmptyState','recipeForm','recipeIdInput','recipeNameInput','recipeSkillInput','recipeRequiredLevelInput','recipeXpInput','recipeCraftTimeInput','recipeInputEditor','recipeInputEmptyState','recipeInputAddButton','recipeOutputIdInput','recipeOutputQtyInput','recipeJsonPreview','recipeDiagnosticsList','recipeValidationSummary','addRecipeButton','duplicateRecipeButton','deleteRecipeButton','validateRecipesButton','reloadRecipesButton'
  ];

  function bindEls() { ids.forEach(id => els[id] = document.getElementById(id)); }
  function currentDirty() { return state.activeTab === 'items' ? state.itemDirty : (state.activeTab === 'enemies' ? state.enemyDirty : (state.activeTab === 'npcs' ? state.npcDirty : (state.activeTab === 'quests' ? state.questDirty : (state.activeTab === 'playerBase' ? state.playerBaseDirty : (state.activeTab === 'props' ? state.propDirty : (state.activeTab === 'particles' ? state.particleDirty : (state.activeTab === 'skills' ? state.skillDirty : (state.activeTab === 'statusEffects' ? state.statusEffectDirty : (state.activeTab === 'gatheringSkills' ? state.gatheringSkillDirty : (state.activeTab === 'resourceNodes' ? state.resourceNodeDirty : (state.activeTab === 'recipes' ? state.recipeDirty : state.tileDirty))))))))))); }
  function setServerStatus(online) {
    state.serverOnline = online;
    els.connectionBadge.textContent = online ? 'Server online' : 'Server offline';
    els.connectionBadge.className = `badge ${online ? 'online' : 'offline'}`;
  }
  function updateDirtyBadge() {
    const isDirty = currentDirty();
    els.dirtyBadge.textContent = isDirty ? 'Unsaved changes' : 'Saved';
    els.dirtyBadge.className = `badge ${isDirty ? 'unsaved' : 'saved'}`;
  }
  function setTileDirty(v){ state.tileDirty = v; updateDirtyBadge(); }
  function setItemDirty(v){ state.itemDirty = v; updateDirtyBadge(); }
  function setEnemyDirty(v){ state.enemyDirty = v; updateDirtyBadge(); }
  function setNpcDirty(v){ state.npcDirty = v; updateDirtyBadge(); }
  function setQuestDirty(v){ state.questDirty = v; updateDirtyBadge(); }
  function setPlayerBaseDirty(v){ state.playerBaseDirty = v; updateDirtyBadge(); }
  function setPropDirty(v){ state.propDirty = v; updateDirtyBadge(); }
  function setParticleDirty(v){ state.particleDirty = v; updateDirtyBadge(); }
  function setSkillDirty(v){ state.skillDirty = v; updateDirtyBadge(); }
  function setStatusEffectDirty(v){ state.statusEffectDirty = v; updateDirtyBadge(); }
  function setGatheringSkillDirty(v){ state.gatheringSkillDirty = v; updateDirtyBadge(); }
  function setResourceNodeDirty(v){ state.resourceNodeDirty = v; updateDirtyBadge(); }
  function setRecipeDirty(v){ state.recipeDirty = v; updateDirtyBadge(); }
  function clampByte(value) { const num = Number(value); return Number.isNaN(num) ? 0 : Math.max(0, Math.min(255, Math.round(num))); }
  function rgbToHex(rgb) { const [r,g,b]=rgb.map(clampByte); return `#${[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')}`; }
  function hexToRgb(hex) { const n=String(hex).replace('#','').trim(); if(!/^[0-9a-fA-F]{6}$/.test(n)) return [0,0,0]; return [0,2,4].map(i=>parseInt(n.slice(i,i+2),16)); }
  function toIntOrEmpty(v){ if(v === '' || v === null || v === undefined) return ''; const n=Number(v); return Number.isFinite(n) ? Math.round(n) : ''; }
  function toNumOrEmpty(v){ if(v === '' || v === null || v === undefined) return ''; const n=Number(v); return Number.isFinite(n) ? n : ''; }

  async function apiFetch(url, options = {}) {
    try {
      const response = await fetch(url, options);
      setServerStatus(true);
      if (!response.ok) {
        let text = await response.text();
        try {
          const parsed = JSON.parse(text);
          text = parsed.error || text;
        } catch {}
        throw new Error(text || `Request failed (${response.status})`);
      }
      const contentType = response.headers.get('content-type') || '';
      return contentType.includes('application/json') ? response.json() : response.text();
    } catch (error) {
      setServerStatus(false);
      throw error;
    }
  }

  // ── SFX preview ────────────────────────────────────────────────────────────
  const _sfxCache = new Map();  // key → AudioBuffer (decoded, ready to play)
  let _sfxCtx = null;

  function _getSfxCtx() {
    if (!_sfxCtx) _sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _sfxCtx;
  }

  async function playSfx(key, btn) {
    if (!key || !key.trim()) return;
    const cacheKey = key.trim();

    // Visual feedback — show loading state immediately
    if (btn) { btn.textContent = '…'; btn.classList.remove('playing', 'error'); }

    try {
      let buffer = _sfxCache.get(cacheKey);
      if (!buffer) {
        const res = await fetch(`/api/sfx/${encodeURIComponent(cacheKey)}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        buffer = await _getSfxCtx().decodeAudioData(arrayBuf);
        _sfxCache.set(cacheKey, buffer);
      }

      const ctx = _getSfxCtx();
      // Resume context if it was suspended (browser autoplay policy)
      if (ctx.state === 'suspended') await ctx.resume();

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);

      if (btn) {
        btn.textContent = '▶';
        btn.classList.add('playing');
        src.onended = () => { btn.classList.remove('playing'); };
      }
    } catch (err) {
      if (btn) {
        btn.textContent = '✕';
        btn.classList.add('error');
        setTimeout(() => { btn.textContent = '▶'; btn.classList.remove('error'); }, 1800);
      }
      console.warn(`SFX preview failed for "${cacheKey}":`, err.message);
    }
  }
  // ── End SFX preview ────────────────────────────────────────────────────────

  function switchTab(tab) {
    const leaving = state.activeTab;
    state.activeTab = tab;
    document.querySelectorAll('.tabbar .tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('.tool-view').forEach(view => view.classList.toggle('active', view.dataset.view === tab));
    updateDirtyBadge();
    if (tab === 'particles') {
      _preview._resize();
      _preview.start();
    } else if (leaving === 'particles') {
      _preview.stop();
    }
  }

  // Tile helpers
  function getTileSpriteUrl(id) { return `/api/tile-sprite/${encodeURIComponent(id)}?v=${Date.now()}`; }
  function getTileSpriteDisplayPath(id) { return `public/assets/sprites/tiles/${id}.png`; }
  function getVisibleTileKeys() { return Object.keys(state.tilePalette).filter(k => k.toLowerCase().includes(state.tileSearch.toLowerCase())).sort((a,b)=>a.localeCompare(b)); }
  function getSelectedTileEntry() { return state.selectedTileKey ? state.tilePalette[state.selectedTileKey] || null : null; }
  function ensureUniqueTileKey(baseKey){ let c=baseKey, i=2; while(state.tilePalette[c]) c=`${baseKey}_${i++}`; return c; }

  function renderTileList() {
    const visibleKeys = getVisibleTileKeys();
    const allKeys = Object.keys(state.tilePalette);
    els.entryCount.textContent = String(allKeys.length);
    els.blockedCount.textContent = String(allKeys.filter(k => !!state.tilePalette[k]?.blocked).length);
    els.tileList.innerHTML = '';
    if (!visibleKeys.length) {
      const empty=document.createElement('div'); empty.className='subtle'; empty.textContent='No matching tiles.'; els.tileList.appendChild(empty); return;
    }
    for (const key of visibleKeys) {
      const entry = state.tilePalette[key] || {};
      const fragment = els.tileListItemTemplate.content.cloneNode(true);
      const button = fragment.querySelector('.tile-list-item');
      const swatch = fragment.querySelector('.swatch');
      const name = fragment.querySelector('.tile-name');
      const meta = fragment.querySelector('.tile-meta');
      const color = Array.isArray(entry.color) ? entry.color : [0,0,0];
      swatch.style.background = rgbToHex(color);
      name.textContent = key;
      meta.textContent = `${entry.blocked ? 'Blocked' : 'Walkable'} • fallback rgb(${color.join(', ')})`;
      button.classList.toggle('active', key === state.selectedTileKey);
      button.addEventListener('click', () => { state.selectedTileKey = key; renderTilePanel(); renderTileList(); });
      els.tileList.appendChild(fragment);
    }
  }
  function setTileSpriteStatus(exists) {
    state.tileSpriteExists = exists;
    if (exists === true) {
      els.spriteStatusBadge.textContent = 'Sprite found';
      els.spriteStatusBadge.className = 'badge online';
      els.spritePreviewImage.classList.remove('hidden');
      els.spritePreviewFallback.classList.add('hidden');
    } else if (exists === false) {
      els.spriteStatusBadge.textContent = 'Using fallback color';
      els.spriteStatusBadge.className = 'badge unsaved';
      els.spritePreviewImage.classList.add('hidden');
      els.spritePreviewFallback.classList.remove('hidden');
    } else {
      els.spriteStatusBadge.textContent = 'Checking sprite';
      els.spriteStatusBadge.className = 'badge muted';
      els.spritePreviewImage.classList.add('hidden');
      els.spritePreviewFallback.classList.remove('hidden');
    }
  }
  function renderTilePanel() {
    const entry = getSelectedTileEntry();
    if (!entry) {
      els.selectedTileLabel.textContent = 'Nothing selected';
      els.emptyState.classList.remove('hidden');
      els.tileForm.classList.add('hidden');
      els.entryJsonPreview.textContent = '';
      return;
    }
    const color = Array.isArray(entry.color) ? entry.color.map(clampByte) : [0,0,0];
    const hex = rgbToHex(color);
    els.selectedTileLabel.textContent = state.selectedTileKey;
    els.emptyState.classList.add('hidden');
    els.tileForm.classList.remove('hidden');
    els.tileIdInput.value = state.selectedTileKey;
    els.tileBlockedInput.checked = !!entry.blocked;
    els.tileColorPicker.value = hex;
    els.tileRInput.value = String(color[0]); els.tileGInput.value = String(color[1]); els.tileBInput.value = String(color[2]);
    els.colorPreview.style.background = hex;
    els.spritePathLabel.textContent = getTileSpriteDisplayPath(state.selectedTileKey);
    els.entryJsonPreview.textContent = JSON.stringify({ [state.selectedTileKey]: { color, blocked: !!entry.blocked } }, null, 2);
    setTileSpriteStatus(null);
    els.spritePreviewImage.src = getTileSpriteUrl(state.selectedTileKey);
  }
  function renderTileDiagnostics(items=[], summary='No validation run yet') {
    els.validationSummary.textContent = summary; els.diagnosticsList.innerHTML = '';
    if (!items.length) { els.diagnosticsList.className='diagnostics-list empty-diagnostics'; els.diagnosticsList.innerHTML='<p>No messages yet.</p>'; return; }
    els.diagnosticsList.className='diagnostics-list';
    for (const item of items) { const div=document.createElement('div'); div.className=`diagnostic-item ${item.level||'info'}`; div.innerHTML=`<strong>${item.title}</strong><div>${item.message}</div>`; els.diagnosticsList.appendChild(div); }
  }
  function renderTiles(){ renderTileList(); renderTilePanel(); }
  function updateSelectedTileColor(rgb){ const entry=getSelectedTileEntry(); if(!entry) return; entry.color=rgb.map(clampByte); setTileDirty(true); renderTiles(); }
  function renameSelectedTileKey(newKeyRaw) {
    const entry=getSelectedTileEntry(); if(!entry) return; const newKey=String(newKeyRaw||'').trim(); if(!newKey || newKey===state.selectedTileKey) return;
    if(state.tilePalette[newKey]) { renderTileDiagnostics([{level:'error',title:'Rename failed',message:`A tile with id "${newKey}" already exists.`}],'Rename blocked'); renderTilePanel(); return; }
    const oldKey=state.selectedTileKey; const newPalette={};
    Object.keys(state.tilePalette).forEach(k => { newPalette[k===oldKey ? newKey : k] = k===oldKey ? entry : state.tilePalette[k]; });
    state.tilePalette=newPalette; state.selectedTileKey=newKey; setTileDirty(true); renderTiles();
  }
  async function loadPalette() {
    const result = await apiFetch('/api/tile-palette');
    state.tilePalette = result.tilePalette || {};
    const keys = Object.keys(state.tilePalette);
    state.selectedTileKey = keys.includes(state.selectedTileKey) ? state.selectedTileKey : (keys[0] || null);
    setTileDirty(false); renderTiles(); renderTileDiagnostics([{level:'info',title:'Palette loaded',message:result.path}], `Loaded ${keys.length} entries from disk`);
  }
  async function savePalette() {
    const result = await apiFetch('/api/tile-palette', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({tilePalette: state.tilePalette}) });
    setTileDirty(false); renderTileDiagnostics([{level:'info',title:'Saved successfully',message:result.path}], `Saved ${Object.keys(state.tilePalette).length} entries to disk`);
  }
  function validatePalette() {
    const messages=[]; const entries=Object.entries(state.tilePalette);
    if(!entries.length) messages.push({level:'warning', title:'Palette is empty', message:'There are no tile entries defined.'});
    for(const [key, value] of entries){
      if(!key.trim()) messages.push({level:'error', title:'Blank tile id', message:'A tile entry has an empty id.'});
      if(!value || typeof value !== 'object'){ messages.push({level:'error', title:`Invalid entry: ${key}`, message:'Entry must be an object.'}); continue; }
      if(!Array.isArray(value.color) || value.color.length !== 3) messages.push({level:'error', title:`Invalid color: ${key}`, message:'Color must be an RGB array with exactly 3 values.'});
      else value.color.forEach((channel,index)=>{ if(!Number.isInteger(Number(channel)) || Number(channel)<0 || Number(channel)>255) messages.push({level:'error', title:`Channel out of range: ${key}`, message:`Color index ${index} must be an integer between 0 and 255.`}); });
      if(typeof value.blocked !== 'boolean') messages.push({level:'warning', title:`Blocked flag type: ${key}`, message:'Blocked should be a boolean.'});
    }
    if(state.tileSpriteExists === false && state.selectedTileKey) messages.push({level:'warning', title:'Selected tile sprite missing', message:`${getTileSpriteDisplayPath(state.selectedTileKey)} was not found, so the fallback color will be used.`});
    if(!messages.length) messages.push({level:'info', title:'Validation passed', message:'No schema problems detected in tilePalette.json.'});
    const errorCount = messages.filter(m=>m.level==='error').length; const warningCount = messages.filter(m=>m.level==='warning').length;
    renderTileDiagnostics(messages, errorCount||warningCount ? `${errorCount} error(s), ${warningCount} warning(s)` : 'Validation passed');
  }
  function addTile(){ const key=ensureUniqueTileKey('newTile'); state.tilePalette[key]={...DEFAULT_NEW_TILE, color:[...DEFAULT_NEW_TILE.color]}; state.selectedTileKey=key; setTileDirty(true); renderTiles(); }
  function duplicateTile(){ const entry=getSelectedTileEntry(); if(!entry) return; const key=ensureUniqueTileKey(`${state.selectedTileKey}_copy`); state.tilePalette[key]=JSON.parse(JSON.stringify(entry)); state.selectedTileKey=key; setTileDirty(true); renderTiles(); }
  function deleteTile(){ const entry=getSelectedTileEntry(); if(!entry) return; if(!window.confirm(`Delete tile "${state.selectedTileKey}"?`)) return; delete state.tilePalette[state.selectedTileKey]; state.selectedTileKey=Object.keys(state.tilePalette)[0]||null; setTileDirty(true); renderTiles(); }
  function openScanModal(result) {
    state.pendingScanIds = result.newIds || []; state.scanMeta = result; els.scanNewCount.textContent=String(state.pendingScanIds.length); els.scanExistingCount.textContent=String((result.existingSpriteIds||[]).length); els.scanSpriteDirLabel.textContent=result.spriteDir || 'public/assets/sprites/tiles'; els.scanTileIdList.innerHTML='';
    if(!state.pendingScanIds.length){ els.scanModalSubtitle.textContent='No new tile IDs were found. All PNGs already have palette entries.'; els.scanTileIdList.innerHTML='<p class="subtle">Nothing new will be added.</p>'; els.scanConfirmButton.disabled=true; }
    else { els.scanModalSubtitle.textContent='Review additions before applying them to the in-memory palette. This does not save to disk until you click Save.'; state.pendingScanIds.forEach(id=>{ const pill=document.createElement('span'); pill.className='pill'; pill.textContent=id; els.scanTileIdList.appendChild(pill); }); els.scanConfirmButton.disabled=false; }
    els.scanModal.classList.remove('hidden'); els.scanModal.setAttribute('aria-hidden','false');
  }
  function closeScanModal(){ els.scanModal.classList.add('hidden'); els.scanModal.setAttribute('aria-hidden','true'); state.pendingScanIds=[]; state.scanMeta=null; }
  async function scanTilesFolder(){ const result=await apiFetch('/api/tile-sprites/scan'); openScanModal(result); }
  function confirmScanAdditions(){ if(!state.pendingScanIds.length){ closeScanModal(); return; } state.pendingScanIds.forEach(id=>{ if(!state.tilePalette[id]) state.tilePalette[id]={...DEFAULT_NEW_TILE, color:[...DEFAULT_NEW_TILE.color]}; }); if(!state.selectedTileKey && state.pendingScanIds.length) state.selectedTileKey=state.pendingScanIds[0]; const addedCount=state.pendingScanIds.length; setTileDirty(true); renderTiles(); renderTileDiagnostics([{level:'info', title:'Tile scan applied', message:`Added ${addedCount} new tile entr${addedCount===1?'y':'ies'} from ${state.scanMeta?.spriteDir||'the sprite folder'}. Click Save to write the palette to disk.`}], `Added ${addedCount} staged tile entr${addedCount===1?'y':'ies'}`); closeScanModal(); }

  // Items
  function getItemIconUrl(icon) { return `/api/item-icon/${encodeURIComponent(icon)}?v=${Date.now()}`; }
  function getItemIconDisplayPath(icon) { return `public/assets/sprites/icons/${icon}.png`; }
  function renderItemDismantleEditor(resultArr) {
    els.itemDismantleEditor.innerHTML = '';
    if (!resultArr.length) { els.itemDismantleEmptyState.classList.remove('hidden'); return; }
    els.itemDismantleEmptyState.classList.add('hidden');
    resultArr.forEach(({ id='', qty=1 }) => {
      const row = document.createElement('div');
      row.className = 'linked-list-row dismantle-row';
      row.innerHTML = `<input class="dis-id mono" type="text" value="${id}" placeholder="itemId" style="flex:1" /><input class="dis-qty" type="number" min="1" value="${qty}" style="width:60px" /><button type="button" class="button danger small dis-remove" style="flex-shrink:0">✕</button>`;
      row.querySelector('.dis-id').addEventListener('input', syncSelectedItemFromForm);
      row.querySelector('.dis-qty').addEventListener('input', syncSelectedItemFromForm);
      row.querySelector('.dis-remove').addEventListener('click', () => { row.remove(); if (!els.itemDismantleEditor.children.length) els.itemDismantleEmptyState.classList.remove('hidden'); syncSelectedItemFromForm(); });
      els.itemDismantleEditor.appendChild(row);
    });
  }

  function renderItemEffectsEditor(effectsArr) {
    els.itemEffectsEditor.innerHTML = '';
    if (!effectsArr.length) { els.itemEffectsEmptyState.classList.remove('hidden'); return; }
    els.itemEffectsEmptyState.classList.add('hidden');
    effectsArr.forEach(eff => {
      const row = document.createElement('div');
      row.className = 'linked-list-row item-effect-row';
      const EFFECT_TYPES = ['healHp','healMana','refillQuiver','buff','debuff'];
      const opts = EFFECT_TYPES.map(t => `<option value="${t}"${eff.type===t?' selected':''}>${t}</option>`).join('');
      row.innerHTML = `<select class="eff-type" style="flex:1">${opts}</select><input class="eff-power" type="number" step="1" value="${eff.power??''}" placeholder="power" style="width:80px" /><button type="button" class="button danger small eff-remove" style="flex-shrink:0">✕</button>`;
      row.querySelector('.eff-type').addEventListener('change', syncSelectedItemFromForm);
      row.querySelector('.eff-power').addEventListener('input', syncSelectedItemFromForm);
      row.querySelector('.eff-remove').addEventListener('click', () => { row.remove(); if (!els.itemEffectsEditor.children.length) els.itemEffectsEmptyState.classList.remove('hidden'); syncSelectedItemFromForm(); });
      els.itemEffectsEditor.appendChild(row);
    });
  }

  function addItemDismantleRow() {
    els.itemDismantleEmptyState.classList.add('hidden');
    const row = document.createElement('div');
    row.className = 'linked-list-row dismantle-row';
    row.innerHTML = `<input class="dis-id mono" type="text" placeholder="itemId" style="flex:1" /><input class="dis-qty" type="number" min="1" value="1" style="width:60px" /><button type="button" class="button danger small dis-remove" style="flex-shrink:0">✕</button>`;
    row.querySelector('.dis-id').addEventListener('input', syncSelectedItemFromForm);
    row.querySelector('.dis-qty').addEventListener('input', syncSelectedItemFromForm);
    row.querySelector('.dis-remove').addEventListener('click', () => { row.remove(); if (!els.itemDismantleEditor.children.length) els.itemDismantleEmptyState.classList.remove('hidden'); syncSelectedItemFromForm(); });
    els.itemDismantleEditor.appendChild(row);
    row.querySelector('.dis-id').focus();
  }

  function addItemEffectRow() {
    els.itemEffectsEmptyState.classList.add('hidden');
    const row = document.createElement('div');
    row.className = 'linked-list-row item-effect-row';
    const EFFECT_TYPES = ['healHp','healMana','refillQuiver','buff','debuff'];
    const opts = EFFECT_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
    row.innerHTML = `<select class="eff-type" style="flex:1">${opts}</select><input class="eff-power" type="number" step="1" placeholder="power" style="width:80px" /><button type="button" class="button danger small eff-remove" style="flex-shrink:0">✕</button>`;
    row.querySelector('.eff-type').addEventListener('change', syncSelectedItemFromForm);
    row.querySelector('.eff-power').addEventListener('input', syncSelectedItemFromForm);
    row.querySelector('.eff-remove').addEventListener('click', () => { row.remove(); if (!els.itemEffectsEditor.children.length) els.itemEffectsEmptyState.classList.remove('hidden'); syncSelectedItemFromForm(); });
    els.itemEffectsEditor.appendChild(row);
  }

  function getItemRarityColor(rarity) {
    return {common:'#9daabf',uncommon:'#3fb06a',rare:'#5a9cf5',epic:'#c87acc',legendary:'#c8983a'}[rarity]||'#9daabf';
  }

  function getVisibleItemKeys() {
    const q = state.itemSearch.toLowerCase();
    return Object.keys(state.items).filter(k => {
      const item = state.items[k] || {};
      return !q || k.toLowerCase().includes(q) || String(item.name||'').toLowerCase().includes(q) || String(item.type||'').toLowerCase().includes(q);
    }).sort((a,b)=>a.localeCompare(b));
  }
  function getSelectedItemEntry() { return state.selectedItemKey ? state.items[state.selectedItemKey] || null : null; }
  function ensureUniqueItemKey(baseKey){ let c=baseKey, i=2; while(state.items[c]) c=`${baseKey}_${i++}`; return c; }
  function setItemIconStatus(exists) {
    state.itemIconExists = exists;
    if (exists === true) {
      els.itemIconStatusBadge.textContent = 'Icon found';
      els.itemIconStatusBadge.className = 'badge online';
      els.itemIconPreviewImage.classList.remove('hidden');
      els.itemIconPreviewFallback.classList.add('hidden');
    } else if (exists === false) {
      els.itemIconStatusBadge.textContent = 'Missing icon';
      els.itemIconStatusBadge.className = 'badge unsaved';
      els.itemIconPreviewImage.classList.add('hidden');
      els.itemIconPreviewFallback.classList.remove('hidden');
    } else {
      els.itemIconStatusBadge.textContent = 'Checking icon';
      els.itemIconStatusBadge.className = 'badge muted';
      els.itemIconPreviewImage.classList.add('hidden');
      els.itemIconPreviewFallback.classList.remove('hidden');
    }
  }
  function renderItemList() {
    const visibleKeys = getVisibleItemKeys();
    const allKeys = Object.keys(state.items);
    els.itemEntryCount.textContent = String(allKeys.length);
    els.itemTypeCount.textContent = String(new Set(allKeys.map(k => state.items[k]?.type).filter(Boolean)).size);
    els.itemList.innerHTML = '';
    if (!visibleKeys.length) { const empty=document.createElement('div'); empty.className='subtle'; empty.textContent='No matching items.'; els.itemList.appendChild(empty); return; }
    for (const key of visibleKeys) {
      const item = state.items[key] || {};
      const fragment = els.itemListItemTemplate.content.cloneNode(true);
      const button = fragment.querySelector('.tile-list-item');
      const swatch = fragment.querySelector('.swatch');
      const name = fragment.querySelector('.tile-name');
      const meta = fragment.querySelector('.tile-meta');
      name.textContent = item.name || key;
      meta.textContent = `${key} • ${item.type || 'unknown'} • value ${Number(item.value || 0)}`;
      swatch.style.backgroundImage = `url(${getItemIconUrl(item.icon || key)})`;
      swatch.style.backgroundSize = 'cover';
      swatch.style.backgroundPosition = 'center';
      button.classList.toggle('active', key === state.selectedItemKey);
      button.addEventListener('click', () => { state.selectedItemKey = key; renderItemPanel(); renderItemList(); });
      els.itemList.appendChild(fragment);
    }
  }
  function updateTypeFieldVisibility(type) {
    const visible = new Set();
    const EQUIPPABLE = ['weapon','armor','shield','helmet','pants','boots','ring','amulet','trinket','quiver'];
    if (EQUIPPABLE.includes(type)) { visible.add('statsRarityDismantle'); }
    if (type === 'weapon') { visible.add('attackBonus'); visible.add('hitParticle'); visible.add('weaponMeta'); }
    if (['armor','shield','helmet','pants','boots'].includes(type)) visible.add('hpBonus');
    if (['trinket','ring','amulet'].includes(type)) visible.add('manaBonus');
    if (type === 'consumable') { visible.add('effects'); visible.add('useParticle'); }
    if (type === 'hearthstone') { visible.add('permanent'); visible.add('castTime'); visible.add('cooldown'); visible.add('concentration'); }
    if (type === 'quiver') visible.add('maxArrows');
    if (type === 'tool') visible.add('toolMeta');
    document.querySelectorAll('[data-type-field]').forEach(el => el.classList.toggle('hidden-field', !visible.has(el.dataset.typeField)));
  }
  function buildCurrentItemObject(baseKey) {
    const obj = {
      id: (els.itemIdInput.value || '').trim(),
      name: els.itemNameInput.value || '',
      type: els.itemTypeInput.value || 'junk',
      icon: (els.itemIconInput.value || '').trim(),
      value: Number(els.itemValueInput.value || 0),
      description: els.itemDescriptionInput.value || '',
    };
    if (els.itemStackSizeInput.value !== '') obj.stackSize = Number(els.itemStackSizeInput.value);
    if (obj.type === 'weapon') {
      if (els.itemAttackBonusInput.value !== '') obj.attackBonus = Number(els.itemAttackBonusInput.value);
      const handed = els.itemHandedInput.value;
      if (handed) obj.handed = Number(handed);
      const weaponType = els.itemWeaponTypeInput.value.trim();
      if (weaponType) obj.weaponType = weaponType;
      if (els.itemRequiresQuiverInput.checked) obj.requiresQuiver = true;
      const wRange = els.itemWeaponRangeInput.value;
      if (wRange !== '') obj.range = Number(wRange);
      if (els.itemHitParticleInput.value.trim()) obj.hitParticle = els.itemHitParticleInput.value.trim();
      if (els.itemHitSfxInput.value.trim()) obj.hitSfx = els.itemHitSfxInput.value.trim();
      if (els.itemSwingSfxInput.value.trim()) obj.swingSfx = els.itemSwingSfxInput.value.trim();
    }
    // Stats (equippable items)
    const EQUIPPABLE = ['weapon','armor','shield','helmet','pants','boots','ring','amulet','trinket','quiver'];
    if (EQUIPPABLE.includes(obj.type)) {
      const statsAttack = els.itemStatsAttackInput.value;
      const statsHp = els.itemStatsHpInput.value;
      const statsMana = els.itemStatsManaInput.value;
      const statsDefense = els.itemStatsDefenseInput.value;
      const stats = {};
      if (statsAttack !== '') stats.attack = Number(statsAttack);
      if (statsHp !== '') stats.maxHp = Number(statsHp);
      if (statsMana !== '') stats.maxMana = Number(statsMana);
      if (statsDefense !== '') stats.defense = Number(statsDefense);
      if (Object.keys(stats).length) obj.stats = stats;
      obj.rarity = els.itemRarityInput.value || 'common';
      if (els.itemDismantleableInput.checked) {
        obj.dismantleable = true;
        const rows = els.itemDismantleEditor.querySelectorAll('.dismantle-row');
        const result = [];
        rows.forEach(row => {
          const id = (row.querySelector('.dis-id')?.value||'').trim();
          const qty = Number(row.querySelector('.dis-qty')?.value||1);
          if (id) result.push({ id, qty });
        });
        if (result.length) obj.dismantleResult = result;
      }
    }
    if (obj.type === 'weapon') {
      if (els.itemAttackBonusInput.value !== '') obj.attackBonus = Number(els.itemAttackBonusInput.value);
      const handed = els.itemHandedInput.value;
      if (handed) obj.handed = Number(handed);
      const weaponType = els.itemWeaponTypeInput.value.trim();
      if (weaponType) obj.weaponType = weaponType;
      if (els.itemRequiresQuiverInput.checked) obj.requiresQuiver = true;
      const wRange = els.itemWeaponRangeInput.value;
      if (wRange !== '') obj.range = Number(wRange);
      if (els.itemHitParticleInput.value.trim()) obj.hitParticle = els.itemHitParticleInput.value.trim();
      if (els.itemHitSfxInput.value.trim()) obj.hitSfx = els.itemHitSfxInput.value.trim();
      if (els.itemSwingSfxInput.value.trim()) obj.swingSfx = els.itemSwingSfxInput.value.trim();
    }
    if (['armor','shield','helmet','pants','boots'].includes(obj.type) && els.itemHpBonusInput.value !== '') obj.hpBonus = Number(els.itemHpBonusInput.value);
    if (['trinket','ring','amulet'].includes(obj.type) && els.itemManaBonusInput.value !== '') obj.manaBonus = Number(els.itemManaBonusInput.value);
    if (obj.type === 'quiver' && els.itemMaxArrowsInput.value !== '') obj.maxArrows = Number(els.itemMaxArrowsInput.value);
    if (obj.type === 'tool') {
      const toolType = els.itemToolTypeInput.value.trim();
      if (toolType) obj.toolType = toolType;
      const toolTier = els.itemToolTierInput.value;
      if (toolTier) obj.toolTier = Number(toolTier);
      const glr = els.itemGatheringLevelReqInput.value;
      if (glr !== '') obj.gatheringLevelReq = Number(glr);
    }
    if (obj.type === 'consumable') {
      // New effects array format
      const effectRows = els.itemEffectsEditor.querySelectorAll('.item-effect-row');
      const effects = [];
      effectRows.forEach(row => {
        const type = row.querySelector('.eff-type')?.value || '';
        const power = row.querySelector('.eff-power')?.value;
        if (type) { const e = { type }; if (power !== '' && power !== undefined) e.power = Number(power); effects.push(e); }
      });
      if (effects.length) obj.effects = effects;
      if (els.itemUseParticleInput.value.trim()) obj.useParticle = els.itemUseParticleInput.value.trim();
      if (els.itemUseSfxInput.value.trim()) obj.useSfx = els.itemUseSfxInput.value.trim();
    }
    if (obj.type === 'hearthstone') {
      obj.permanent = !!els.itemPermanentInput.checked;
      if (els.itemCastTimeInput.value !== '') obj.castTime = Number(els.itemCastTimeInput.value);
      if (els.itemCooldownInput.value !== '') obj.cooldown = Number(els.itemCooldownInput.value);
      if (els.itemConcentrationInput.checked) obj.concentration = true;
    }
    return obj;
  }
  function renderItemPanel() {
    const item = getSelectedItemEntry();
    if (!item) {
      els.selectedItemLabel.textContent = 'Nothing selected';
      els.itemEmptyState.classList.remove('hidden');
      els.itemForm.classList.add('hidden');
      els.itemJsonPreview.textContent = '';
      return;
    }
    els.selectedItemLabel.textContent = state.selectedItemKey;
    els.itemEmptyState.classList.add('hidden');
    els.itemForm.classList.remove('hidden');
    els.itemIdInput.value = item.id || state.selectedItemKey;
    els.itemNameInput.value = item.name || '';
    els.itemTypeInput.value = ITEM_TYPES.includes(item.type) ? item.type : 'junk';
    els.itemIconInput.value = item.icon || state.selectedItemKey;
    els.itemValueInput.value = toIntOrEmpty(item.value);
    els.itemStackSizeInput.value = toIntOrEmpty(item.stackSize);
    els.itemDescriptionInput.value = item.description || '';
    els.itemAttackBonusInput.value = toIntOrEmpty(item.attackBonus);
    els.itemHandedInput.value = item.handed != null ? String(item.handed) : '';
    els.itemWeaponTypeInput.value = item.weaponType || '';
    els.itemRequiresQuiverInput.checked = !!item.requiresQuiver;
    els.itemWeaponRangeInput.value = item.range != null ? item.range : '';
    els.itemHpBonusInput.value = toIntOrEmpty(item.hpBonus);
    els.itemManaBonusInput.value = toIntOrEmpty(item.manaBonus);
    els.itemMaxArrowsInput.value = toIntOrEmpty(item.maxArrows);
    els.itemToolTypeInput.value = item.toolType || '';
    els.itemToolTierInput.value = item.toolTier != null ? String(item.toolTier) : '';
    els.itemGatheringLevelReqInput.value = item.gatheringLevelReq != null ? item.gatheringLevelReq : '';
    // Stats / rarity / dismantle (equippable)
    const EQUIPPABLE_R = ['weapon','armor','shield','helmet','pants','boots','ring','amulet','trinket','quiver'];
    if (EQUIPPABLE_R.includes(item.type)) {
      const stats = item.stats || {};
      els.itemStatsAttackInput.value = stats.attack != null ? stats.attack : '';
      els.itemStatsHpInput.value = stats.maxHp != null ? stats.maxHp : '';
      els.itemStatsManaInput.value = stats.maxMana != null ? stats.maxMana : '';
      els.itemStatsDefenseInput.value = stats.defense != null ? stats.defense : '';
      els.itemRarityInput.value = item.rarity || 'common';
      els.itemDismantleableInput.checked = !!item.dismantleable;
      renderItemDismantleEditor(item.dismantleResult || []);
    } else {
      els.itemStatsAttackInput.value = '';
      els.itemStatsHpInput.value = '';
      els.itemStatsManaInput.value = '';
      els.itemStatsDefenseInput.value = '';
      els.itemRarityInput.value = 'common';
      els.itemDismantleableInput.checked = false;
      renderItemDismantleEditor([]);
    }
    // Effects (consumable)
    renderItemEffectsEditor(item.type === 'consumable' ? (item.effects || []) : []);
    els.itemPermanentInput.checked = !!item.permanent;
    els.itemCastTimeInput.value = toNumOrEmpty(item.castTime);
    els.itemCooldownInput.value = toNumOrEmpty(item.cooldown);
    els.itemConcentrationInput.checked = !!item.concentration;
    els.itemHitParticleInput.value = item.hitParticle || '';
    els.itemHitSfxInput.value = item.hitSfx || '';
    els.itemSwingSfxInput.value = item.swingSfx || '';
    els.itemUseParticleInput.value = item.useParticle || '';
    els.itemUseSfxInput.value = item.useSfx || '';
    updateTypeFieldVisibility(els.itemTypeInput.value);
    const iconKey = els.itemIconInput.value || state.selectedItemKey;
    els.itemIconPathLabel.textContent = getItemIconDisplayPath(iconKey);
    els.itemJsonPreview.textContent = JSON.stringify({ [state.selectedItemKey]: item }, null, 2);
    setItemIconStatus(null);
    els.itemIconPreviewImage.src = getItemIconUrl(iconKey);
  }
  function renderItemDiagnostics(items=[], summary='No validation run yet') {
    els.itemValidationSummary.textContent = summary;
    els.itemDiagnosticsList.innerHTML = '';
    if (!items.length) { els.itemDiagnosticsList.className='diagnostics-list empty-diagnostics'; els.itemDiagnosticsList.innerHTML='<p>No messages yet.</p>'; return; }
    els.itemDiagnosticsList.className='diagnostics-list';
    for (const item of items) { const div=document.createElement('div'); div.className=`diagnostic-item ${item.level||'info'}`; div.innerHTML=`<strong>${item.title}</strong><div>${item.message}</div>`; els.itemDiagnosticsList.appendChild(div); }
  }
  function renderItems() { renderItemList(); renderItemPanel(); }
  function renameSelectedItemKey(newKeyRaw) {
    const item = getSelectedItemEntry(); if(!item) return; const newKey = String(newKeyRaw||'').trim(); if(!newKey || newKey===state.selectedItemKey) return;
    if (state.items[newKey]) { renderItemDiagnostics([{level:'error', title:'Rename failed', message:`An item with id "${newKey}" already exists.`}], 'Rename blocked'); renderItemPanel(); return; }
    const oldKey = state.selectedItemKey; const newItems = {};
    Object.keys(state.items).forEach(k => {
      if (k === oldKey) {
        const cloned = JSON.parse(JSON.stringify(item));
        cloned.id = newKey;
        if ((cloned.icon || oldKey) === oldKey) cloned.icon = newKey;
        newItems[newKey] = cloned;
      } else newItems[k] = state.items[k];
    });
    state.items = newItems; state.selectedItemKey = newKey; setItemDirty(true); renderItems();
  }
  function syncSelectedItemFromForm() {
    const current = getSelectedItemEntry(); if (!current) return;
    const newKey = (els.itemIdInput.value || '').trim() || state.selectedItemKey;
    if (newKey !== state.selectedItemKey) { renameSelectedItemKey(newKey); return; }
    state.items[state.selectedItemKey] = buildCurrentItemObject(state.selectedItemKey);
    setItemDirty(true);
    renderItemList();
    renderItemPanel();
  }
  async function loadItems() {
    const result = await apiFetch('/api/items');
    state.items = result.items || {};
    const keys = Object.keys(state.items);
    state.selectedItemKey = keys.includes(state.selectedItemKey) ? state.selectedItemKey : (keys[0] || null);
    setItemDirty(false); renderItems(); renderItemDiagnostics([{level:'info', title:'Items loaded', message:result.path}], `Loaded ${keys.length} entries from disk`);
  }
  async function saveItems() {
    const result = await apiFetch('/api/items', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({items: state.items}) });
    setItemDirty(false); renderItemDiagnostics([{level:'info', title:'Saved successfully', message:result.path}], `Saved ${Object.keys(state.items).length} entries to disk`);
  }

  // Enemy helpers
  function getEntitySpriteUrl(id) { return `/api/entity-sprite/${encodeURIComponent(id)}?v=${Date.now()}`; }
  function getEntitySpriteDisplayPath(id) { return `public/assets/sprites/entities/${id}.png`; }
  function getVisibleEnemyKeys() { return Object.keys(state.enemies).filter(k => { const q = state.enemySearch.toLowerCase(); return k.toLowerCase().includes(q) || String(state.enemies[k]?.name || '').toLowerCase().includes(q); }).sort((a,b)=>a.localeCompare(b)); }
  function getSelectedEnemyEntry() { return state.selectedEnemyKey ? state.enemies[state.selectedEnemyKey] || null : null; }
  function ensureUniqueEnemyKey(baseKey){ let c=baseKey, i=2; while(state.enemies[c]) c=`${baseKey}_${i++}`; return c; }
  function normalizeLootEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries.map(entry => ({ itemId: String(entry?.itemId || ''), chance: Number(entry?.chance ?? 0) }));
  }
  function getEnemyLootRows() {
    return Array.from(els.enemyLootEditor?.querySelectorAll('.loot-row') || []);
  }
  function buildEnemyLootFromEditor() {
    return getEnemyLootRows().map(row => ({
      itemId: row.querySelector('.loot-item-select')?.value || '',
      chance: Number(row.querySelector('.loot-chance-input')?.value || 0),
    })).filter(entry => entry.itemId);
  }
  function renderEnemyLootEditor() {
    if (!els.enemyLootEditor) return;
    const enemy = getSelectedEnemyEntry();
    els.enemyLootEditor.innerHTML = '';
    const lootEntries = normalizeLootEntries(enemy?.loot || []);
    const itemKeys = Object.keys(state.items).sort((a,b)=>a.localeCompare(b));
    lootEntries.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'loot-row';
      row.innerHTML = `
        <select class="loot-item-select"></select>
        <input class="loot-chance-input" type="number" min="0" max="1" step="0.01" />
        <button class="button danger small loot-delete-button" type="button">Delete</button>
      `;
      const select = row.querySelector('.loot-item-select');
      const blank = document.createElement('option');
      blank.value = ''; blank.textContent = '(select item)'; select.appendChild(blank);
      itemKeys.forEach(key => {
        const opt = document.createElement('option');
        const item = state.items[key] || {};
        opt.value = key;
        opt.textContent = item.name ? `${item.name} (${key})` : key;
        select.appendChild(opt);
      });
      select.value = entry.itemId && itemKeys.includes(entry.itemId) ? entry.itemId : '';
      if (entry.itemId && !itemKeys.includes(entry.itemId)) {
        const missing = document.createElement('option');
        missing.value = entry.itemId; missing.textContent = `${entry.itemId} (missing item)`;
        select.appendChild(missing); select.value = entry.itemId;
      }
      row.querySelector('.loot-chance-input').value = Number.isFinite(entry.chance) ? entry.chance : 0;
      select.addEventListener('change', syncSelectedEnemyFromForm);
      row.querySelector('.loot-chance-input').addEventListener('input', syncSelectedEnemyFromForm);
      row.querySelector('.loot-delete-button').addEventListener('click', () => {
        const current = getSelectedEnemyEntry();
        if (!current) return;
        current.loot = normalizeLootEntries(current.loot || []).filter((_, i) => i !== index);
        setEnemyDirty(true);
        renderEnemyPanel();
        renderEnemyList();
      });
      els.enemyLootEditor.appendChild(row);
    });
    els.enemyLootEmptyState.classList.toggle('hidden', lootEntries.length > 0);
  }
  function addEnemyLootEntry() {
    const enemy = getSelectedEnemyEntry(); if (!enemy) return;
    const firstItemId = Object.keys(state.items).sort((a,b)=>a.localeCompare(b))[0] || '';
    enemy.loot = normalizeLootEntries(enemy.loot || []);
    enemy.loot.push({ itemId: firstItemId, chance: 0.1 });
    setEnemyDirty(true);
    renderEnemyPanel();
    renderEnemyList();
  }
  function setEnemySpriteStatus(exists) {
    state.enemySpriteExists = exists;
    if (exists === true) {
      els.enemySpriteStatusBadge.textContent = 'Sprite found';
      els.enemySpriteStatusBadge.className = 'badge online';
      els.enemyPreviewImage.classList.remove('hidden');
      els.enemyPreviewFallback.classList.add('hidden');
    } else if (exists === false) {
      els.enemySpriteStatusBadge.textContent = 'Using fallback color';
      els.enemySpriteStatusBadge.className = 'badge unsaved';
      els.enemyPreviewImage.classList.add('hidden');
      els.enemyPreviewFallback.classList.remove('hidden');
    } else {
      els.enemySpriteStatusBadge.textContent = 'Checking sprite';
      els.enemySpriteStatusBadge.className = 'badge muted';
      els.enemyPreviewImage.classList.add('hidden');
      els.enemyPreviewFallback.classList.remove('hidden');
    }
  }
  function renderEnemyList() {
    const visibleKeys = getVisibleEnemyKeys();
    const allKeys = Object.keys(state.enemies);
    els.enemyEntryCount.textContent = String(allKeys.length);
    els.enemyLootRefCount.textContent = String(allKeys.reduce((acc, key) => acc + ((state.enemies[key]?.loot || []).length || 0), 0));
    els.enemyList.innerHTML = '';
    if (!visibleKeys.length) {
      const empty=document.createElement('div'); empty.className='subtle'; empty.textContent='No matching enemies.'; els.enemyList.appendChild(empty); return;
    }
    for (const key of visibleKeys) {
      const enemy = state.enemies[key] || {};
      const fragment = els.enemyListItemTemplate.content.cloneNode(true);
      const button = fragment.querySelector('.tile-list-item');
      const swatch = fragment.querySelector('.swatch');
      const name = fragment.querySelector('.tile-name');
      const meta = fragment.querySelector('.tile-meta');
      swatch.style.background = enemy.color || '#555555';
      name.textContent = enemy.name || key;
      meta.textContent = `${key} • HP ${enemy.maxHp ?? '?'} • Dmg ${enemy.damage ?? '?'} • Loot ${(enemy.loot || []).length}`;
      button.classList.toggle('active', key === state.selectedEnemyKey);
      button.addEventListener('click', () => { state.selectedEnemyKey = key; renderEnemyPanel(); renderEnemyList(); });
      els.enemyList.appendChild(fragment);
    }
  }
  function buildCurrentEnemyObject(key) {
    return {
      name: (els.enemyNameInput.value || '').trim() || key,
      maxHp: Number(els.enemyMaxHpInput.value || 0),
      damage: Number(els.enemyDamageInput.value || 0),
      speed: Number(els.enemySpeedInput.value || 0),
      xp: Number(els.enemyXpInput.value || 0),
      goldMin: Number(els.enemyGoldMinInput.value || 0),
      goldMax: Number(els.enemyGoldMaxInput.value || 0),
      respawnSeconds: Number(els.enemyRespawnSecondsInput.value || 0),
      color: els.enemyColorInput.value || '#808080',
      radius: Number(els.enemyRadiusInput.value || 0),
      aggroRange: Number(els.enemyAggroRangeInput.value || 0),
      attackRange: Number(els.enemyAttackRangeInput.value || 0),
      attackCooldown: Number(els.enemyAttackCooldownInput.value || 0),
      loot: buildEnemyLootFromEditor(),
    };
    const hitParticle = els.enemyHitParticleInput.value.trim();
    const hitSfx = els.enemyHitSfxInput.value.trim();
    if (hitParticle) obj.hitParticle = hitParticle;
    if (hitSfx) obj.hitSfx = hitSfx;
    return obj;
  }
  function renderEnemyPanel() {
    const enemy = getSelectedEnemyEntry();
    if (!enemy) {
      els.selectedEnemyLabel.textContent = 'Nothing selected';
      els.enemyEmptyState.classList.remove('hidden');
      els.enemyForm.classList.add('hidden');
      els.enemyJsonPreview.textContent = '';
      return;
    }
    els.selectedEnemyLabel.textContent = state.selectedEnemyKey;
    els.enemyEmptyState.classList.add('hidden');
    els.enemyForm.classList.remove('hidden');
    els.enemyIdInput.value = state.selectedEnemyKey;
    els.enemyNameInput.value = enemy.name || '';
    els.enemyMaxHpInput.value = toNumOrEmpty(enemy.maxHp);
    els.enemyDamageInput.value = toNumOrEmpty(enemy.damage);
    els.enemySpeedInput.value = toNumOrEmpty(enemy.speed);
    els.enemyXpInput.value = toNumOrEmpty(enemy.xp);
    els.enemyGoldMinInput.value = toNumOrEmpty(enemy.goldMin);
    els.enemyGoldMaxInput.value = toNumOrEmpty(enemy.goldMax);
    els.enemyRespawnSecondsInput.value = toNumOrEmpty(enemy.respawnSeconds);
    els.enemyColorInput.value = enemy.color || '#808080';
    els.enemyRadiusInput.value = toNumOrEmpty(enemy.radius);
    els.enemyAggroRangeInput.value = toNumOrEmpty(enemy.aggroRange);
    els.enemyAttackRangeInput.value = toNumOrEmpty(enemy.attackRange);
    els.enemyAttackCooldownInput.value = toNumOrEmpty(enemy.attackCooldown);
    els.enemyHitParticleInput.value = enemy.hitParticle || '';
    els.enemyHitSfxInput.value = enemy.hitSfx || '';
    els.enemyColorPreview.style.background = enemy.color || '#808080';
    renderEnemyLootEditor();
    els.enemySpritePathLabel.textContent = getEntitySpriteDisplayPath(state.selectedEnemyKey);
    els.enemyJsonPreview.textContent = JSON.stringify({ [state.selectedEnemyKey]: enemy }, null, 2);
    setEnemySpriteStatus(null);
    els.enemyPreviewImage.src = getEntitySpriteUrl(state.selectedEnemyKey);
  }
  function renderEnemyDiagnostics(items=[], summary='No validation run yet') {
    els.enemyValidationSummary.textContent = summary; els.enemyDiagnosticsList.innerHTML = '';
    if (!items.length) { els.enemyDiagnosticsList.className='diagnostics-list empty-diagnostics'; els.enemyDiagnosticsList.innerHTML='<p>No messages yet.</p>'; return; }
    els.enemyDiagnosticsList.className='diagnostics-list';
    for (const item of items) { const div=document.createElement('div'); div.className=`diagnostic-item ${item.level||'info'}`; div.innerHTML=`<strong>${item.title}</strong><div>${item.message}</div>`; els.enemyDiagnosticsList.appendChild(div); }
  }
  function renderEnemies(){ renderEnemyList(); renderEnemyPanel(); }
  function renameSelectedEnemyKey(newKeyRaw) {
    const enemy=getSelectedEnemyEntry(); if(!enemy) return; const newKey=String(newKeyRaw||'').trim(); if(!newKey || newKey===state.selectedEnemyKey) { renderEnemyPanel(); return; }
    const uniqueKey = state.enemies[newKey] ? ensureUniqueEnemyKey(newKey) : newKey;
    delete state.enemies[state.selectedEnemyKey]; state.enemies[uniqueKey] = enemy;
    state.selectedEnemyKey = uniqueKey; setEnemyDirty(true); renderEnemies();
  }
  function syncSelectedEnemyFromForm() {
    const current = getSelectedEnemyEntry(); if (!current) return;
    const newKey = (els.enemyIdInput.value || '').trim() || state.selectedEnemyKey;
    if (newKey !== state.selectedEnemyKey) { renameSelectedEnemyKey(newKey); return; }
    state.enemies[state.selectedEnemyKey] = buildCurrentEnemyObject(state.selectedEnemyKey);
    setEnemyDirty(true);
    renderEnemyList();
    els.enemyJsonPreview.textContent = JSON.stringify({ [state.selectedEnemyKey]: state.enemies[state.selectedEnemyKey] }, null, 2);
    els.enemyColorPreview.style.background = state.enemies[state.selectedEnemyKey].color || '#808080';
    els.enemySpritePathLabel.textContent = getEntitySpriteDisplayPath(state.selectedEnemyKey);
    setEnemySpriteStatus(null);
    els.enemyPreviewImage.src = getEntitySpriteUrl(state.selectedEnemyKey);
  }
  async function loadEnemies() {
    const result = await apiFetch('/api/enemies');
    state.enemies = result.enemies || {};
    const keys = Object.keys(state.enemies);
    state.selectedEnemyKey = keys.includes(state.selectedEnemyKey) ? state.selectedEnemyKey : (keys[0] || null);
    setEnemyDirty(false); renderEnemies(); renderEnemyDiagnostics([{level:'info', title:'Enemies loaded', message:result.path}], `Loaded ${keys.length} entries from disk`);
  }
  async function saveEnemies() {
    const result = await apiFetch('/api/enemies', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({enemies: state.enemies}) });
    setEnemyDirty(false); renderEnemyDiagnostics([{level:'info', title:'Saved successfully', message:result.path}], `Saved ${Object.keys(state.enemies).length} entries to disk`);
  }
  function validateEnemies() {
    const messages=[]; const entries=Object.entries(state.enemies);
    if(!entries.length) messages.push({level:'warning', title:'Enemies list is empty', message:'There are no enemy entries defined.'});
    for(const [key,enemy] of entries){
      if(!enemy || typeof enemy !== 'object' || Array.isArray(enemy)) { messages.push({level:'error', title:`Invalid entry: ${key}`, message:'Enemy entry must be an object.'}); continue; }
      ['name','color'].forEach(field => { if(typeof enemy[field] !== 'string' || !String(enemy[field]).trim()) messages.push({level:'error', title:`Missing ${field}: ${key}`, message:`${field} must be a non-empty string.`}); });
      ['maxHp','damage','speed','xp','goldMin','goldMax','respawnSeconds','radius','aggroRange','attackRange','attackCooldown'].forEach(field => { if(typeof enemy[field] !== 'number' || Number.isNaN(enemy[field])) messages.push({level:'error', title:`Invalid ${field}: ${key}`, message:`${field} must be numeric.`}); });
      if(typeof enemy.color === 'string' && !/^#[0-9a-fA-F]{6}$/.test(enemy.color)) messages.push({level:'warning', title:`Color format: ${key}`, message:'Fallback color should be a 6-digit hex string like #8B4513.'});
      if(typeof enemy.goldMin === 'number' && typeof enemy.goldMax === 'number' && enemy.goldMin > enemy.goldMax) messages.push({level:'warning', title:`Gold range: ${key}`, message:'goldMin is greater than goldMax.'});
      if(!Array.isArray(enemy.loot)) messages.push({level:'error', title:`Loot table: ${key}`, message:'loot must be an array.'});
      else enemy.loot.forEach((loot, idx) => {
        if(!loot || typeof loot !== 'object' || Array.isArray(loot)) { messages.push({level:'error', title:`Loot entry ${idx+1}: ${key}`, message:'Loot entries must be objects.'}); return; }
        if(typeof loot.itemId !== 'string' || !loot.itemId.trim()) messages.push({level:'error', title:`Loot itemId ${idx+1}: ${key}`, message:'loot.itemId must be a non-empty string.'});
        if(typeof loot.chance !== 'number' || Number.isNaN(loot.chance)) messages.push({level:'error', title:`Loot chance ${idx+1}: ${key}`, message:'loot.chance must be numeric.'});
        else if(loot.chance < 0 || loot.chance > 1) messages.push({level:'warning', title:`Loot chance range ${idx+1}: ${key}`, message:'loot.chance is usually between 0 and 1.'});
        if(loot.itemId && !state.items[loot.itemId]) messages.push({level:'warning', title:`Loot item missing: ${key}`, message:`loot itemId "${loot.itemId}" was not found in items.json.`});
      });
    }
    if (state.enemySpriteExists === false && state.selectedEnemyKey) messages.push({level:'warning', title:'Selected enemy sprite missing', message:`${getEntitySpriteDisplayPath(state.selectedEnemyKey)} was not found.`});
    if(!messages.length) messages.push({level:'info', title:'Validation passed', message:'No schema problems detected in enemies.json.'});
    const errorCount = messages.filter(m=>m.level==='error').length; const warningCount = messages.filter(m=>m.level==='warning').length;
    renderEnemyDiagnostics(messages, errorCount||warningCount ? `${errorCount} error(s), ${warningCount} warning(s)` : 'Validation passed');
  }
  function addEnemy() { const key = ensureUniqueEnemyKey('newEnemy'); state.enemies[key] = {...DEFAULT_NEW_ENEMY, name:key}; state.selectedEnemyKey = key; setEnemyDirty(true); renderEnemies(); }
  function duplicateEnemy() { const enemy=getSelectedEnemyEntry(); if(!enemy) return; const key=ensureUniqueEnemyKey(`${state.selectedEnemyKey}_copy`); const clone=JSON.parse(JSON.stringify(enemy)); state.enemies[key]=clone; state.selectedEnemyKey=key; setEnemyDirty(true); renderEnemies(); }
  function deleteEnemy() { const enemy=getSelectedEnemyEntry(); if(!enemy) return; if(!window.confirm(`Delete enemy "${state.selectedEnemyKey}"?`)) return; delete state.enemies[state.selectedEnemyKey]; state.selectedEnemyKey = Object.keys(state.enemies)[0] || null; setEnemyDirty(true); renderEnemies(); }

  function validateItems() {
    const messages=[]; const entries=Object.entries(state.items);
    if(!entries.length) messages.push({level:'warning', title:'Items list is empty', message:'There are no item entries defined.'});
    for(const [key,item] of entries){
      if(!item || typeof item !== 'object' || Array.isArray(item)) { messages.push({level:'error', title:`Invalid entry: ${key}`, message:'Item entry must be an object.'}); continue; }
      if((item.id || '') !== key) messages.push({level:'warning', title:`Key/id mismatch: ${key}`, message:`Object key is "${key}" but id is "${item.id || ''}".`});
      ['name','type','icon','description'].forEach(field => { if(typeof item[field] !== 'string' || !item[field].trim()) messages.push({level:'error', title:`Missing ${field}: ${key}`, message:`${field} must be a non-empty string.`}); });
      if(!ITEM_TYPES.includes(item.type)) messages.push({level:'error', title:`Invalid type: ${key}`, message:`Type must be one of ${ITEM_TYPES.join(', ')}.`});
      if(typeof item.value !== 'number' || Number.isNaN(item.value)) messages.push({level:'warning', title:`Value type: ${key}`, message:'value should be a number.'});
      if(item.stackSize !== undefined && (typeof item.stackSize !== 'number' || Number.isNaN(item.stackSize) || item.stackSize < 1)) messages.push({level:'warning', title:`Stack size: ${key}`, message:'stackSize should be a positive number when present.'});
      if(item.icon && item.icon !== key) messages.push({level:'info', title:`Icon differs from id: ${key}`, message:`icon is "${item.icon}". This is allowed, but the guide says it usually matches the id.`});
      if(item.type === 'weapon' && typeof item.attackBonus !== 'number') messages.push({level:'warning', title:`Missing weapon field: ${key}`, message:'weapon items should include attackBonus.'});
      if(item.type === 'armor' && typeof item.hpBonus !== 'number') messages.push({level:'warning', title:`Missing armor field: ${key}`, message:'armor items should include hpBonus.'});
      if(item.type === 'trinket' && typeof item.manaBonus !== 'number') messages.push({level:'warning', title:`Missing trinket field: ${key}`, message:'trinket items should include manaBonus.'});
      if(item.type === 'consumable') {
        if(!['healHp','healMana'].includes(item.effect)) messages.push({level:'warning', title:`Consumable effect: ${key}`, message:'consumable items should use effect "healHp" or "healMana".'});
        if(typeof item.power !== 'number') messages.push({level:'warning', title:`Consumable power: ${key}`, message:'consumable items should include power.'});
      }
      if(item.type === 'hearthstone') {
        if(typeof item.permanent !== 'boolean') messages.push({level:'warning', title:`Hearthstone permanent: ${key}`, message:'hearthstone items should include permanent boolean.'});
        if(typeof item.castTime !== 'number') messages.push({level:'warning', title:`Hearthstone castTime: ${key}`, message:'hearthstone items should include castTime.'});
        if(typeof item.cooldown !== 'number') messages.push({level:'warning', title:`Hearthstone cooldown: ${key}`, message:'hearthstone items should include cooldown.'});
      }
    }
    if (state.itemIconExists === false && state.selectedItemKey) messages.push({level:'warning', title:'Selected item icon missing', message:`${getItemIconDisplayPath(els.itemIconInput.value || state.selectedItemKey)} was not found.`});
    if(!messages.length) messages.push({level:'info', title:'Validation passed', message:'No schema problems detected in items.json.'});
    const errorCount = messages.filter(m=>m.level==='error').length; const warningCount = messages.filter(m=>m.level==='warning').length;
    renderItemDiagnostics(messages, errorCount||warningCount ? `${errorCount} error(s), ${warningCount} warning(s)` : 'Validation passed');
  }
  function addItem() { const key = ensureUniqueItemKey('newItem'); state.items[key] = {...DEFAULT_NEW_ITEM, id:key, icon:key}; state.selectedItemKey = key; setItemDirty(true); renderItems(); }
  function duplicateItem() { const item=getSelectedItemEntry(); if(!item) return; const key=ensureUniqueItemKey(`${state.selectedItemKey}_copy`); const clone=JSON.parse(JSON.stringify(item)); clone.id = key; if((clone.icon || state.selectedItemKey) === state.selectedItemKey) clone.icon = key; state.items[key]=clone; state.selectedItemKey=key; setItemDirty(true); renderItems(); }
  function deleteItem() { const item=getSelectedItemEntry(); if(!item) return; if(!window.confirm(`Delete item "${state.selectedItemKey}"?`)) return; delete state.items[state.selectedItemKey]; state.selectedItemKey = Object.keys(state.items)[0] || null; setItemDirty(true); renderItems(); }



  // NPC helpers
  function getVisibleNpcKeys() {
    const q = state.npcSearch.toLowerCase();
    return Object.keys(state.npcs).filter(k => {
      const npc = state.npcs[k] || {};
      return !q || k.toLowerCase().includes(q) || String(npc.name || '').toLowerCase().includes(q) || String(npc.type || '').toLowerCase().includes(q);
    }).sort((a,b)=>a.localeCompare(b));
  }
  function getSelectedNpcEntry() { return state.selectedNpcKey ? state.npcs[state.selectedNpcKey] || null : null; }
  function ensureUniqueNpcKey(baseKey){ let c=baseKey, i=2; while(state.npcs[c]) c=`${baseKey}_${i++}`; return c; }
  function setNpcSpriteStatus(exists) {
    state.npcSpriteExists = exists;
    if (exists === true) {
      els.npcSpriteStatusBadge.textContent = 'Sprite found';
      els.npcSpriteStatusBadge.className = 'badge online';
      els.npcPreviewImage.classList.remove('hidden');
      els.npcPreviewFallback.classList.add('hidden');
    } else if (exists === false) {
      els.npcSpriteStatusBadge.textContent = 'Using fallback color';
      els.npcSpriteStatusBadge.className = 'badge unsaved';
      els.npcPreviewImage.classList.add('hidden');
      els.npcPreviewFallback.classList.remove('hidden');
    } else {
      els.npcSpriteStatusBadge.textContent = 'Checking sprite';
      els.npcSpriteStatusBadge.className = 'badge muted';
      els.npcPreviewImage.classList.add('hidden');
      els.npcPreviewFallback.classList.remove('hidden');
    }
  }
  function renderNpcList() {
    const visibleKeys = getVisibleNpcKeys();
    const allKeys = Object.keys(state.npcs);
    els.npcEntryCount.textContent = String(allKeys.length);
    els.npcVendorCount.textContent = String(allKeys.filter(k => state.npcs[k]?.type === 'vendor').length);
    els.npcList.innerHTML = '';
    if (!visibleKeys.length) { const empty=document.createElement('div'); empty.className='subtle'; empty.textContent='No matching NPCs.'; els.npcList.appendChild(empty); return; }
    for (const key of visibleKeys) {
      const npc = state.npcs[key] || {};
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tile-list-item';
      if (key === state.selectedNpcKey) button.classList.add('active');
      button.innerHTML = `<span class="swatch" style="background:${npc.color || '#666'}"></span><span class="tile-text"><strong class="tile-name">${npc.name || key}</strong><span class="tile-meta">${key} • ${npc.type || 'unknown'}</span></span>`;
      button.addEventListener('click', () => { state.selectedNpcKey = key; renderNpcs(); });
      els.npcList.appendChild(button);
    }
  }
  function updateNpcTypeFieldVisibility(type) {
    document.querySelectorAll('[data-npc-field]').forEach(el => {
      const field = el.dataset.npcField;
      const show = (type === 'quest_giver' && field === 'questIds') || (type === 'vendor' && field === 'shop') || (type === 'crafting_station' && field === 'craftingSkill');
      el.classList.toggle('hidden-field', !show);
    });
  }
  function renderLinkedSelectRows(container, values, options, placeholder, onChange) {
    container.innerHTML = '';
    values.forEach((value, index) => {
      const row = document.createElement('div');
      row.className = 'linked-row';
      const select = document.createElement('select');
      select.className = 'linked-select';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = placeholder;
      select.appendChild(blank);
      options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === value) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener('change', () => onChange(index, select.value));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button danger small';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => onChange(index, null));
      row.appendChild(select);
      row.appendChild(remove);
      container.appendChild(row);
    });
  }
  function renderNpcQuestEditor() {
    const npc = getSelectedNpcEntry();
    const values = Array.isArray(npc?.questIds) ? npc.questIds : [];
    const options = Object.keys(state.quests).sort((a,b)=>a.localeCompare(b)).map(key => ({ value:key, label:`${state.quests[key]?.name || key} (${key})` }));
    renderLinkedSelectRows(els.npcQuestEditor, values, options, 'Select quest…', (index, nextValue) => {
      const current = getSelectedNpcEntry(); if (!current) return;
      let list = Array.isArray(current.questIds) ? [...current.questIds] : [];
      if (nextValue === null) list.splice(index, 1); else list[index] = nextValue;
      current.questIds = list.filter(Boolean);
      setNpcDirty(true); renderNpcPanel();
    });
    els.npcQuestEmptyState.classList.toggle('hidden', values.length > 0);
  }
  function renderNpcShopEditor() {
    const npc = getSelectedNpcEntry();
    const values = Array.isArray(npc?.shop) ? npc.shop : [];
    const options = Object.keys(state.items).sort((a,b)=>a.localeCompare(b)).map(key => ({ value:key, label:`${state.items[key]?.name || key} (${key})` }));
    renderLinkedSelectRows(els.npcShopEditor, values, options, 'Select item…', (index, nextValue) => {
      const current = getSelectedNpcEntry(); if (!current) return;
      let list = Array.isArray(current.shop) ? [...current.shop] : [];
      if (nextValue === null) list.splice(index, 1); else list[index] = nextValue;
      current.shop = list.filter(Boolean);
      setNpcDirty(true); renderNpcPanel();
    });
    els.npcShopEmptyState.classList.toggle('hidden', values.length > 0);
  }
  function buildCurrentNpcObject() {
    const current = getSelectedNpcEntry() || {};
    const obj = {
      id: (els.npcIdInput.value || '').trim(),
      name: els.npcNameInput.value || '',
      color: els.npcColorInput.value || '#808080',
      type: els.npcTypeInput.value || 'quest_giver',
      defaultDialog: els.npcDefaultDialogInput.value || '',
    };
    if (obj.type === 'quest_giver') obj.questIds = Array.isArray(current.questIds) ? [...current.questIds] : [];
    if (obj.type === 'vendor') obj.shop = Array.isArray(current.shop) ? [...current.shop] : [];
    if (obj.type === 'crafting_station') obj.craftingSkill = els.npcCraftingSkillInput.value || 'smelting';
    return obj;
  }
  function renderNpcPanel() {
    const npc = getSelectedNpcEntry();
    if (!npc) {
      els.selectedNpcLabel.textContent = 'Nothing selected';
      els.npcEmptyState.classList.remove('hidden');
      els.npcForm.classList.add('hidden');
      els.npcJsonPreview.textContent = '';
      return;
    }
    els.selectedNpcLabel.textContent = state.selectedNpcKey;
    els.npcEmptyState.classList.add('hidden');
    els.npcForm.classList.remove('hidden');
    els.npcIdInput.value = npc.id || state.selectedNpcKey;
    els.npcNameInput.value = npc.name || '';
    els.npcTypeInput.value = NPC_TYPES.includes(npc.type) ? npc.type : 'quest_giver';
    els.npcColorInput.value = npc.color || '#808080';
    els.npcDefaultDialogInput.value = npc.defaultDialog || '';
    els.npcColorPreview.style.background = npc.color || '#808080';
    els.npcSpritePathLabel.textContent = getEntitySpriteDisplayPath(state.selectedNpcKey);
    els.npcJsonPreview.textContent = JSON.stringify({ [state.selectedNpcKey]: npc }, null, 2);
    updateNpcTypeFieldVisibility(els.npcTypeInput.value);
    if (npc.craftingSkill) els.npcCraftingSkillInput.value = npc.craftingSkill;
    renderNpcQuestEditor();
    renderNpcShopEditor();
    setNpcSpriteStatus(null);
    els.npcPreviewImage.src = getEntitySpriteUrl(state.selectedNpcKey);
  }
  function renderNpcDiagnostics(items=[], summary='No validation run yet') {
    els.npcValidationSummary.textContent = summary;
    els.npcDiagnosticsList.innerHTML = '';
    if (!items.length) { els.npcDiagnosticsList.className='diagnostics-list empty-diagnostics'; els.npcDiagnosticsList.innerHTML='<p>No messages yet.</p>'; return; }
    els.npcDiagnosticsList.className='diagnostics-list';
    for (const item of items) { const div=document.createElement('div'); div.className=`diagnostic-item ${item.level||'info'}`; div.innerHTML=`<strong>${item.title}</strong><div>${item.message}</div>`; els.npcDiagnosticsList.appendChild(div); }
  }
  function renderNpcs() { renderNpcList(); renderNpcPanel(); }
  function renameSelectedNpcKey(newKeyRaw) {
    const npc = getSelectedNpcEntry(); if(!npc) return; const newKey = String(newKeyRaw||'').trim(); if(!newKey || newKey===state.selectedNpcKey) return;
    if (state.npcs[newKey]) { renderNpcDiagnostics([{level:'error', title:'Rename failed', message:`An NPC with id "${newKey}" already exists.`}], 'Rename blocked'); renderNpcPanel(); return; }
    const oldKey = state.selectedNpcKey; const newNpcs = {};
    Object.keys(state.npcs).forEach(k => {
      if (k === oldKey) { const cloned = JSON.parse(JSON.stringify(npc)); cloned.id = newKey; newNpcs[newKey] = cloned; }
      else newNpcs[k] = state.npcs[k];
    });
    state.npcs = newNpcs; state.selectedNpcKey = newKey; setNpcDirty(true); renderNpcs();
  }
  function syncSelectedNpcFromForm() {
    const current = getSelectedNpcEntry(); if (!current) return;
    const newKey = (els.npcIdInput.value || '').trim() || state.selectedNpcKey;
    if (newKey !== state.selectedNpcKey) { renameSelectedNpcKey(newKey); return; }
    state.npcs[state.selectedNpcKey] = buildCurrentNpcObject();
    setNpcDirty(true);
    renderNpcs();
  }
  async function loadNpcs() {
    const [npcResult, questResult] = await Promise.all([apiFetch('/api/npcs'), apiFetch('/api/quests')]);
    state.npcs = npcResult.npcs || {};
    state.quests = questResult.quests || {};
    const keys = Object.keys(state.npcs);
    state.selectedNpcKey = keys.includes(state.selectedNpcKey) ? state.selectedNpcKey : (keys[0] || null);
    setNpcDirty(false); renderNpcs(); renderNpcDiagnostics([{level:'info', title:'NPCs loaded', message:npcResult.path}], `Loaded ${keys.length} entries from disk`);
  }
  async function saveNpcs() {
    const result = await apiFetch('/api/npcs', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({npcs: state.npcs}) });
    setNpcDirty(false); renderNpcDiagnostics([{level:'info', title:'Saved successfully', message:result.path}], `Saved ${Object.keys(state.npcs).length} entries to disk`);
  }
  function validateNpcs() {
    const messages=[]; const entries=Object.entries(state.npcs); const questIds = new Set(Object.keys(state.quests)); const itemIds = new Set(Object.keys(state.items));
    if(!entries.length) messages.push({level:'warning', title:'NPC list is empty', message:'There are no NPC entries defined.'});
    for(const [key,npc] of entries){
      if(!npc || typeof npc !== 'object' || Array.isArray(npc)) { messages.push({level:'error', title:`Invalid entry: ${key}`, message:'NPC entry must be an object.'}); continue; }
      if((npc.id || '') !== key) messages.push({level:'warning', title:`Key/id mismatch: ${key}`, message:`Object key is "${key}" but id is "${npc.id || ''}".`});
      ['name','color','type','defaultDialog'].forEach(field => { if(typeof npc[field] !== 'string' || !npc[field].trim()) messages.push({level:'error', title:`Missing ${field}: ${key}`, message:`${field} must be a non-empty string.`}); });
      if(!NPC_TYPES.includes(npc.type)) messages.push({level:'error', title:`Invalid type: ${key}`, message:`type must be one of ${NPC_TYPES.join(', ')}.`});
      if(npc.type === 'quest_giver') {
        if(!Array.isArray(npc.questIds)) messages.push({level:'warning', title:`Quest ids missing: ${key}`, message:'quest_giver NPCs should include questIds array.'});
        else npc.questIds.forEach(id => { if(!questIds.has(id)) messages.push({level:'warning', title:`Missing quest reference: ${key}`, message:`Quest id "${id}" does not exist in quests.json.`}); });
      }
      if(npc.type === 'vendor') {
        if(!Array.isArray(npc.shop)) messages.push({level:'warning', title:`Shop missing: ${key}`, message:'vendor NPCs should include shop array.'});
        else npc.shop.forEach(id => { if(!itemIds.has(id)) messages.push({level:'warning', title:`Missing item reference: ${key}`, message:`Item id "${id}" does not exist in items.json.`}); });
      }
      if(npc.type === 'banker') {
        if('questIds' in npc && Array.isArray(npc.questIds) && npc.questIds.length) messages.push({level:'info', title:`Unused questIds: ${key}`, message:'banker NPCs do not use questIds.'});
        if('shop' in npc && Array.isArray(npc.shop) && npc.shop.length) messages.push({level:'info', title:`Unused shop: ${key}`, message:'banker NPCs do not use shop.'});
      }
      if(npc.type === 'crafting_station') {
        if(!npc.craftingSkill) messages.push({level:'error', title:`Missing craftingSkill: ${key}`, message:'crafting_station NPCs require a craftingSkill field.'});
      }
    }
    if (state.npcSpriteExists === false && state.selectedNpcKey) messages.push({level:'warning', title:'Selected NPC sprite missing', message:`${getEntitySpriteDisplayPath(state.selectedNpcKey)} was not found.`});
    if(!messages.length) messages.push({level:'info', title:'Validation passed', message:'No schema problems detected in npcs.json.'});
    const errorCount = messages.filter(m=>m.level==='error').length; const warningCount = messages.filter(m=>m.level==='warning').length;
    renderNpcDiagnostics(messages, errorCount||warningCount ? `${errorCount} error(s), ${warningCount} warning(s)` : 'Validation passed');
  }
  function addNpc() { const key=ensureUniqueNpcKey('newNpc'); state.npcs[key]={...DEFAULT_NEW_NPC, id:key}; state.selectedNpcKey=key; setNpcDirty(true); renderNpcs(); }
  function duplicateNpc() { const npc=getSelectedNpcEntry(); if(!npc) return; const key=ensureUniqueNpcKey(`${state.selectedNpcKey}_copy`); const clone=JSON.parse(JSON.stringify(npc)); clone.id=key; state.npcs[key]=clone; state.selectedNpcKey=key; setNpcDirty(true); renderNpcs(); }
  function deleteNpc() { const npc=getSelectedNpcEntry(); if(!npc) return; if(!window.confirm(`Delete NPC "${state.selectedNpcKey}"?`)) return; delete state.npcs[state.selectedNpcKey]; state.selectedNpcKey=Object.keys(state.npcs)[0]||null; setNpcDirty(true); renderNpcs(); }
  function addNpcQuestEntry() { const npc=getSelectedNpcEntry(); if(!npc || npc.type!=='quest_giver') return; npc.questIds = Array.isArray(npc.questIds) ? [...npc.questIds, ''] : ['']; setNpcDirty(true); renderNpcPanel(); }
  function addNpcShopEntry() { const npc=getSelectedNpcEntry(); if(!npc || npc.type!=='vendor') return; npc.shop = Array.isArray(npc.shop) ? [...npc.shop, ''] : ['']; setNpcDirty(true); renderNpcPanel(); }



  // Quests
  function getVisibleQuestKeys() {
    const q = state.questSearch.toLowerCase();
    return Object.keys(state.quests).filter(k => {
      const quest = state.quests[k] || {};
      return !q || k.toLowerCase().includes(q) || String(quest.name || '').toLowerCase().includes(q);
    }).sort((a,b)=>a.localeCompare(b));
  }
  function getSelectedQuestEntry() { return state.selectedQuestKey ? state.quests[state.selectedQuestKey] || null : null; }
  function ensureUniqueQuestKey(baseKey){ let c=baseKey, i=2; while(state.quests[c]) c=`${baseKey}_${i++}`; return c; }
  function safeDialogState(dialog, key) {
    const d = dialog && typeof dialog === 'object' ? dialog[key] : null;
    return d && typeof d === 'object' && !Array.isArray(d) ? d : { text:'', options:[] };
  }
  function getQuestDialogStateConfig() {
    return {
      not_started: { textInput: els.questDialogNotStartedTextInput, editor: els.questDialogNotStartedOptionsEditor, empty: els.questDialogNotStartedOptionsEmptyState },
      active: { textInput: els.questDialogActiveTextInput, editor: els.questDialogActiveOptionsEditor, empty: els.questDialogActiveOptionsEmptyState },
      ready_to_turn_in: { textInput: els.questDialogReadyTextInput, editor: els.questDialogReadyOptionsEditor, empty: els.questDialogReadyOptionsEmptyState },
      completed: { textInput: els.questDialogCompletedTextInput, editor: els.questDialogCompletedOptionsEditor, empty: els.questDialogCompletedOptionsEmptyState },
    };
  }
  function normalizeDialogOptions(options) {
    return Array.isArray(options) ? options.map(opt => ({ label: String(opt?.label || ''), action: String(opt?.action || 'close') })) : [];
  }
  function renderQuestDialogOptionsEditor(stateKey) {
    const quest = getSelectedQuestEntry();
    const config = getQuestDialogStateConfig()[stateKey];
    if (!config) return;
    const options = normalizeDialogOptions(quest?.dialog?.[stateKey]?.options || []);
    config.editor.innerHTML = '';
    options.forEach((opt, index) => {
      const row = document.createElement('div');
      row.className = 'dialog-option-row';
      row.innerHTML = `
        <label class="field"><span>Label</span><input class="dialog-option-label" type="text" /></label>
        <label class="field"><span>Action</span><select class="dialog-option-action"><option value="accept">accept</option><option value="complete">complete</option><option value="close">close</option></select></label>
        <button type="button" class="button danger small">Delete</button>
      `;
      row.querySelector('.dialog-option-label').value = opt.label || '';
      row.querySelector('.dialog-option-action').value = ['accept','complete','close'].includes(opt.action) ? opt.action : 'close';
      const sync = () => {
        const current = getSelectedQuestEntry(); if (!current) return;
        current.dialog = current.dialog && typeof current.dialog === 'object' ? current.dialog : {};
        const stateObj = safeDialogState(current.dialog, stateKey);
        const nextOptions = normalizeDialogOptions(stateObj.options);
        nextOptions[index] = {
          label: row.querySelector('.dialog-option-label').value || '',
          action: row.querySelector('.dialog-option-action').value || 'close',
        };
        current.dialog[stateKey] = { text: config.textInput.value || '', options: nextOptions };
        setQuestDirty(true); renderQuestPanel();
      };
      row.querySelector('.dialog-option-label').addEventListener('input', sync);
      row.querySelector('.dialog-option-action').addEventListener('change', sync);
      row.querySelector('.button').addEventListener('click', () => {
        const current = getSelectedQuestEntry(); if (!current) return;
        current.dialog = current.dialog && typeof current.dialog === 'object' ? current.dialog : {};
        const stateObj = safeDialogState(current.dialog, stateKey);
        const nextOptions = normalizeDialogOptions(stateObj.options).filter((_, i) => i !== index);
        current.dialog[stateKey] = { text: config.textInput.value || '', options: nextOptions };
        setQuestDirty(true); renderQuestPanel();
      });
      config.editor.appendChild(row);
    });
    config.empty.classList.toggle('hidden', options.length > 0);
  }
  function addQuestDialogOption(stateKey) {
    const current = getSelectedQuestEntry(); if (!current) return;
    current.dialog = current.dialog && typeof current.dialog === 'object' ? current.dialog : {};
    const stateObj = safeDialogState(current.dialog, stateKey);
    const nextOptions = normalizeDialogOptions(stateObj.options);
    nextOptions.push({ label: '', action: 'close' });
    current.dialog[stateKey] = { text: getQuestDialogStateConfig()[stateKey].textInput.value || '', options: nextOptions };
    setQuestDirty(true); renderQuestPanel();
  }
  function populateQuestGiverSelect(selected) {
    els.questGiverInput.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '(select NPC)';
    els.questGiverInput.appendChild(blank);
    Object.keys(state.npcs).sort((a,b)=>a.localeCompare(b)).forEach(key => {
      const npc = state.npcs[key] || {};
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = npc.name ? `${npc.name} (${key})` : key;
      if (key === selected) opt.selected = true;
      els.questGiverInput.appendChild(opt);
    });
    if (selected && !state.npcs[selected]) {
      const missing = document.createElement('option');
      missing.value = selected; missing.textContent = `${selected} (missing NPC)`; missing.selected = true;
      els.questGiverInput.appendChild(missing);
    }
  }
  function renderQuestList() {
    const visibleKeys = getVisibleQuestKeys();
    const allKeys = Object.keys(state.quests);
    els.questEntryCount.textContent = String(allKeys.length);
    els.questObjectiveCount.textContent = String(allKeys.reduce((acc, key) => acc + ((state.quests[key]?.objectives || []).length || 0), 0));
    els.questList.innerHTML = '';
    if (!visibleKeys.length) { const empty=document.createElement('div'); empty.className='subtle'; empty.textContent='No matching quests.'; els.questList.appendChild(empty); return; }
    for (const key of visibleKeys) {
      const quest = state.quests[key] || {};
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'tile-list-item';
      if (key === state.selectedQuestKey) button.classList.add('active');
      button.innerHTML = `<span class="swatch" style="background:#6f5fb3"></span><span class="tile-text"><strong class="tile-name">${quest.name || key}</strong><span class="tile-meta">${key} • lvl ${quest.level ?? '?'} • objectives ${(quest.objectives || []).length}</span></span>`;
      button.addEventListener('click', () => { state.selectedQuestKey = key; renderQuests(); });
      els.questList.appendChild(button);
    }
  }
  function renderQuestPrereqEditor() {
    const quest = getSelectedQuestEntry();
    const values = Array.isArray(quest?.prerequisiteQuests) ? quest.prerequisiteQuests : [];
    const options = Object.keys(state.quests).filter(key => key !== state.selectedQuestKey).sort((a,b)=>a.localeCompare(b)).map(key => ({ value:key, label:`${state.quests[key]?.name || key} (${key})` }));
    renderLinkedSelectRows(els.questPrereqEditor, values, options, 'Select prerequisite…', (index, nextValue) => {
      const current = getSelectedQuestEntry(); if (!current) return;
      let list = Array.isArray(current.prerequisiteQuests) ? [...current.prerequisiteQuests] : [];
      if (nextValue === null) list.splice(index, 1); else list[index] = nextValue;
      current.prerequisiteQuests = list.filter(Boolean);
      setQuestDirty(true); renderQuestPanel();
    });
    els.questPrereqEmptyState.classList.toggle('hidden', values.length > 0);
  }
  function renderQuestRewardItemsEditor() {
    const quest = getSelectedQuestEntry();
    const values = Array.isArray(quest?.rewards?.items) ? quest.rewards.items : [];
    const options = Object.keys(state.items).sort((a,b)=>a.localeCompare(b)).map(key => ({ value:key, label:`${state.items[key]?.name || key} (${key})` }));
    renderLinkedSelectRows(els.questRewardItemsEditor, values, options, 'Select reward item…', (index, nextValue) => {
      const current = getSelectedQuestEntry(); if (!current) return;
      current.rewards = current.rewards && typeof current.rewards === 'object' ? current.rewards : { xp:0, gold:0, items:[] };
      let list = Array.isArray(current.rewards.items) ? [...current.rewards.items] : [];
      if (nextValue === null) list.splice(index, 1); else list[index] = nextValue;
      current.rewards.items = list.filter(Boolean);
      setQuestDirty(true); renderQuestPanel();
    });
    els.questRewardItemsEmptyState.classList.toggle('hidden', values.length > 0);
  }
  function renderQuestObjectivesEditor() {
    const quest = getSelectedQuestEntry();
    const values = Array.isArray(quest?.objectives) ? quest.objectives : [];
    els.questObjectivesEditor.innerHTML = '';
    const enemyOptions = Object.keys(state.enemies).sort((a,b)=>a.localeCompare(b));
    values.forEach((objective, index) => {
      const row = document.createElement('div');
      row.className = 'quest-objective-row';
      row.innerHTML = `
        <label class="field"><span>Target Enemy</span><select class="quest-objective-target"></select></label>
        <label class="field"><span>Count</span><input class="quest-objective-count" type="number" step="1" min="1" /></label>
        <label class="field"><span>Label</span><input class="quest-objective-label" type="text" /></label>
        <button type="button" class="button danger small">Delete</button>
      `;
      const select = row.querySelector('.quest-objective-target');
      const blank = document.createElement('option'); blank.value=''; blank.textContent='(select enemy)'; select.appendChild(blank);
      enemyOptions.forEach(key => {
        const opt = document.createElement('option'); opt.value=key; opt.textContent=state.enemies[key]?.name ? `${state.enemies[key].name} (${key})` : key; if (key === objective.target) opt.selected = true; select.appendChild(opt);
      });
      if (objective.target && !state.enemies[objective.target]) { const missing=document.createElement('option'); missing.value=objective.target; missing.textContent=`${objective.target} (missing enemy)`; missing.selected=true; select.appendChild(missing); }
      row.querySelector('.quest-objective-count').value = objective.count ?? 1;
      row.querySelector('.quest-objective-label').value = objective.label || '';
      const sync = () => {
        const current = getSelectedQuestEntry(); if (!current) return;
        const list = Array.isArray(current.objectives) ? [...current.objectives] : [];
        list[index] = { type:'kill', target: select.value || '', count: Number(row.querySelector('.quest-objective-count').value || 1), label: row.querySelector('.quest-objective-label').value || '' };
        current.objectives = list;
        setQuestDirty(true); renderQuestPanel();
      };
      select.addEventListener('change', sync);
      row.querySelector('.quest-objective-count').addEventListener('input', sync);
      row.querySelector('.quest-objective-label').addEventListener('input', sync);
      row.querySelector('.button').addEventListener('click', () => {
        const current = getSelectedQuestEntry(); if (!current) return;
        current.objectives = (Array.isArray(current.objectives) ? current.objectives : []).filter((_, i) => i !== index);
        setQuestDirty(true); renderQuestPanel();
      });
      els.questObjectivesEditor.appendChild(row);
    });
    els.questObjectivesEmptyState.classList.toggle('hidden', values.length > 0);
  }
  function buildCurrentQuestObject() {
    const current = getSelectedQuestEntry() || {};
    return {
      id: (els.questIdInput.value || '').trim(),
      name: els.questNameInput.value || '',
      giver: els.questGiverInput.value || '',
      description: els.questDescriptionInput.value || '',
      level: Number(els.questLevelInput.value || 1),
      prerequisiteQuests: Array.isArray(current.prerequisiteQuests) ? [...current.prerequisiteQuests] : [],
      objectives: Array.isArray(current.objectives) ? JSON.parse(JSON.stringify(current.objectives)) : [],
      rewards: {
        xp: Number(els.questRewardXpInput.value || 0),
        gold: Number(els.questRewardGoldInput.value || 0),
        items: Array.isArray(current.rewards?.items) ? [...current.rewards.items] : [],
      },
      dialog: {
        not_started: { text: els.questDialogNotStartedTextInput.value || '', options: normalizeDialogOptions(current.dialog?.not_started?.options || []) },
        active: { text: els.questDialogActiveTextInput.value || '', options: normalizeDialogOptions(current.dialog?.active?.options || []) },
        ready_to_turn_in: { text: els.questDialogReadyTextInput.value || '', options: normalizeDialogOptions(current.dialog?.ready_to_turn_in?.options || []) },
        completed: { text: els.questDialogCompletedTextInput.value || '', options: normalizeDialogOptions(current.dialog?.completed?.options || []) },
      },
    };
  }
  function renderQuestPanel() {
    const quest = getSelectedQuestEntry();
    if (!quest) {
      els.selectedQuestLabel.textContent = 'Nothing selected';
      els.questEmptyState.classList.remove('hidden');
      els.questForm.classList.add('hidden');
      els.questJsonPreview.textContent = '';
      return;
    }
    const dialog = quest.dialog || {};
    const notStarted = safeDialogState(dialog, 'not_started');
    const active = safeDialogState(dialog, 'active');
    const ready = safeDialogState(dialog, 'ready_to_turn_in');
    const completed = safeDialogState(dialog, 'completed');
    els.selectedQuestLabel.textContent = state.selectedQuestKey;
    els.questEmptyState.classList.add('hidden');
    els.questForm.classList.remove('hidden');
    els.questIdInput.value = state.selectedQuestKey;
    els.questNameInput.value = quest.name || '';
    populateQuestGiverSelect(quest.giver || '');
    els.questLevelInput.value = toIntOrEmpty(quest.level ?? 1);
    els.questDescriptionInput.value = quest.description || '';
    els.questRewardXpInput.value = toIntOrEmpty(quest.rewards?.xp ?? 0);
    els.questRewardGoldInput.value = toIntOrEmpty(quest.rewards?.gold ?? 0);
    els.questDialogNotStartedTextInput.value = notStarted.text || '';
    els.questDialogActiveTextInput.value = active.text || '';
    els.questDialogReadyTextInput.value = ready.text || '';
    els.questDialogCompletedTextInput.value = completed.text || '';
    renderQuestPrereqEditor();
    renderQuestObjectivesEditor();
    renderQuestRewardItemsEditor();
    renderQuestDialogOptionsEditor('not_started');
    renderQuestDialogOptionsEditor('active');
    renderQuestDialogOptionsEditor('ready_to_turn_in');
    renderQuestDialogOptionsEditor('completed');
    els.questJsonPreview.textContent = JSON.stringify({ [state.selectedQuestKey]: buildCurrentQuestObject() }, null, 2);
  }
  function renderQuestDiagnostics(items=[], summary='No validation run yet') {
    els.questValidationSummary.textContent = summary; els.questDiagnosticsList.innerHTML = '';
    if (!items.length) { els.questDiagnosticsList.className='diagnostics-list empty-diagnostics'; els.questDiagnosticsList.innerHTML='<p>No messages yet.</p>'; return; }
    els.questDiagnosticsList.className='diagnostics-list';
    for (const item of items) { const div=document.createElement('div'); div.className=`diagnostic-item ${item.level||'info'}`; div.innerHTML=`<strong>${item.title}</strong><div>${item.message}</div>`; els.questDiagnosticsList.appendChild(div); }
  }
  function renderQuests() { renderQuestList(); renderQuestPanel(); }
  function renameSelectedQuestKey(newKeyRaw) {
    const quest = getSelectedQuestEntry(); if(!quest) return; const newKey = String(newKeyRaw||'').trim(); if(!newKey || newKey===state.selectedQuestKey) return;
    if (state.quests[newKey]) { renderQuestDiagnostics([{level:'error', title:'Rename failed', message:`A quest with id "${newKey}" already exists.`}], 'Rename blocked'); renderQuestPanel(); return; }
    const oldKey = state.selectedQuestKey; const newQuests = {};
    Object.keys(state.quests).forEach(k => {
      if (k === oldKey) { const cloned = JSON.parse(JSON.stringify(quest)); cloned.id = newKey; newQuests[newKey] = cloned; }
      else newQuests[k] = state.quests[k];
    });
    state.quests = newQuests; state.selectedQuestKey = newKey; setQuestDirty(true); renderQuests();
  }
  function syncSelectedQuestFromForm() {
    const current = getSelectedQuestEntry(); if (!current) return;
    const newKey = (els.questIdInput.value || '').trim() || state.selectedQuestKey;
    if (newKey !== state.selectedQuestKey) { renameSelectedQuestKey(newKey); return; }
    state.quests[state.selectedQuestKey] = buildCurrentQuestObject();
    setQuestDirty(true); renderQuests();
  }
  async function loadQuests() {
    const [questResult, npcResult, enemyResult, itemResult] = await Promise.all([apiFetch('/api/quests'), apiFetch('/api/npcs'), apiFetch('/api/enemies'), apiFetch('/api/items')]);
    state.quests = questResult.quests || {};
    state.npcs = npcResult.npcs || state.npcs;
    state.enemies = enemyResult.enemies || state.enemies;
    state.items = itemResult.items || state.items;
    const keys = Object.keys(state.quests);
    state.selectedQuestKey = keys.includes(state.selectedQuestKey) ? state.selectedQuestKey : (keys[0] || null);
    setQuestDirty(false); renderQuests(); renderQuestDiagnostics([{level:'info', title:'Quests loaded', message:questResult.path}], `Loaded ${keys.length} entries from disk`);
  }
  async function saveQuests() {
    const result = await apiFetch('/api/quests', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({quests: state.quests}) });
    setQuestDirty(false); renderQuestDiagnostics([{level:'info', title:'Saved successfully', message:result.path}], `Saved ${Object.keys(state.quests).length} entries to disk`);
  }
  function validateQuests() {
    const messages=[]; const entries=Object.entries(state.quests); const npcIds=new Set(Object.keys(state.npcs)); const enemyIds=new Set(Object.keys(state.enemies)); const itemIds=new Set(Object.keys(state.items));
    if(!entries.length) messages.push({level:'warning', title:'Quest list is empty', message:'There are no quest entries defined.'});
    for (const [key,quest] of entries) {
      if(!quest || typeof quest !== 'object' || Array.isArray(quest)) { messages.push({level:'error', title:`Invalid entry: ${key}`, message:'Quest entry must be an object.'}); continue; }
      if((quest.id || '') !== key) messages.push({level:'warning', title:`Key/id mismatch: ${key}`, message:`Object key is "${key}" but id is "${quest.id || ''}".`});
      ['name','giver','description'].forEach(field => { if(typeof quest[field] !== 'string' || !quest[field].trim()) messages.push({level:'error', title:`Missing ${field}: ${key}`, message:`${field} must be a non-empty string.`}); });
      if(typeof quest.level !== 'number' || Number.isNaN(quest.level)) messages.push({level:'error', title:`Invalid level: ${key}`, message:'level must be a number.'});
      if(quest.giver && !npcIds.has(quest.giver)) messages.push({level:'warning', title:`Missing giver NPC: ${key}`, message:`NPC id "${quest.giver}" does not exist in npcs.json.`});
      (Array.isArray(quest.prerequisiteQuests) ? quest.prerequisiteQuests : []).forEach(id => { if(!state.quests[id]) messages.push({level:'warning', title:`Missing prerequisite: ${key}`, message:`Quest id "${id}" does not exist in quests.json.`}); if(id===key) messages.push({level:'warning', title:`Circular prerequisite: ${key}`, message:'A quest should not list itself as a prerequisite.'}); });
      if(!Array.isArray(quest.objectives) || !quest.objectives.length) messages.push({level:'warning', title:`No objectives: ${key}`, message:'Quest has no objectives defined.'});
      else quest.objectives.forEach((obj, index) => {
        if(obj?.type !== 'kill') messages.push({level:'warning', title:`Unexpected objective type: ${key}`, message:`Objective ${index+1} uses type "${obj?.type || ''}".`});
        if(!enemyIds.has(obj?.target)) messages.push({level:'warning', title:`Missing objective target: ${key}`, message:`Objective ${index+1} target "${obj?.target || ''}" does not exist in enemies.json.`});
        if(!Number.isFinite(Number(obj?.count)) || Number(obj.count) <= 0) messages.push({level:'error', title:`Invalid objective count: ${key}`, message:`Objective ${index+1} count must be > 0.`});
      });
      const rewards = quest.rewards || {};
      if(typeof rewards.xp !== 'number' || Number.isNaN(rewards.xp)) messages.push({level:'error', title:`Invalid rewards.xp: ${key}`, message:'rewards.xp must be a number.'});
      if(typeof rewards.gold !== 'number' || Number.isNaN(rewards.gold)) messages.push({level:'error', title:`Invalid rewards.gold: ${key}`, message:'rewards.gold must be a number.'});
      (Array.isArray(rewards.items) ? rewards.items : []).forEach(id => { if(!itemIds.has(id)) messages.push({level:'warning', title:`Missing reward item: ${key}`, message:`Reward item id "${id}" does not exist in items.json.`}); });
      ['not_started','active','ready_to_turn_in','completed'].forEach(stateKey => {
        const d = quest.dialog?.[stateKey];
        if(!d || typeof d !== 'object') messages.push({level:'error', title:`Missing dialog state: ${key}`, message:`dialog.${stateKey} is required.`});
        else {
          if(typeof d.text !== 'string') messages.push({level:'error', title:`Invalid dialog text: ${key}`, message:`dialog.${stateKey}.text must be a string.`});
          if(!Array.isArray(d.options)) messages.push({level:'error', title:`Invalid dialog options: ${key}`, message:`dialog.${stateKey}.options must be an array.`});
        }
      });
    }
    if(!messages.length) messages.push({level:'info', title:'Validation passed', message:'No schema problems detected in quests.json.'});
    const errorCount = messages.filter(m=>m.level==='error').length; const warningCount = messages.filter(m=>m.level==='warning').length;
    renderQuestDiagnostics(messages, errorCount||warningCount ? `${errorCount} error(s), ${warningCount} warning(s)` : 'Validation passed');
  }
  function addQuest() { const key=ensureUniqueQuestKey('newQuest'); const q=JSON.parse(JSON.stringify(DEFAULT_NEW_QUEST)); q.id=key; if(!q.giver) q.giver=Object.keys(state.npcs)[0] || ''; state.quests[key]=q; state.selectedQuestKey=key; setQuestDirty(true); renderQuests(); }
  function duplicateQuest() { const quest=getSelectedQuestEntry(); if(!quest) return; const key=ensureUniqueQuestKey(`${state.selectedQuestKey}_copy`); const clone=JSON.parse(JSON.stringify(quest)); clone.id=key; state.quests[key]=clone; state.selectedQuestKey=key; setQuestDirty(true); renderQuests(); }
  function deleteQuest() { const quest=getSelectedQuestEntry(); if(!quest) return; if(!window.confirm(`Delete quest "${state.selectedQuestKey}"?`)) return; delete state.quests[state.selectedQuestKey]; state.selectedQuestKey=Object.keys(state.quests)[0]||null; setQuestDirty(true); renderQuests(); }
  function addQuestPrereqEntry() { const quest=getSelectedQuestEntry(); if(!quest) return; quest.prerequisiteQuests = Array.isArray(quest.prerequisiteQuests) ? [...quest.prerequisiteQuests, ''] : ['']; setQuestDirty(true); renderQuestPanel(); }
  function addQuestRewardItemEntry() { const quest=getSelectedQuestEntry(); if(!quest) return; quest.rewards = quest.rewards && typeof quest.rewards==='object' ? quest.rewards : { xp:0, gold:0, items:[] }; quest.rewards.items = Array.isArray(quest.rewards.items) ? [...quest.rewards.items, ''] : ['']; setQuestDirty(true); renderQuestPanel(); }
  function addQuestObjectiveEntry() { const quest=getSelectedQuestEntry(); if(!quest) return; quest.objectives = Array.isArray(quest.objectives) ? [...quest.objectives, { type:'kill', target:'', count:1, label:'' }] : [{ type:'kill', target:'', count:1, label:'' }]; setQuestDirty(true); renderQuestPanel(); }


  // Player Base
  function renderPlayerBaseDiagnostics(messages, summary) {
    els.playerBaseValidationSummary.textContent = summary || '';
    els.playerBaseDiagnosticsList.innerHTML = '';
    if (!messages || !messages.length) { els.playerBaseDiagnosticsList.innerHTML = '<p>No messages yet.</p>'; els.playerBaseDiagnosticsList.className = 'diagnostics-list empty-diagnostics'; return; }
    els.playerBaseDiagnosticsList.className = 'diagnostics-list';
    messages.forEach(m => {
      const div = document.createElement('div'); div.className = `diagnostic-item ${m.level || 'info'}`;
      div.innerHTML = `<strong>${m.title || ''}</strong><span>${m.message || ''}</span>`;
      els.playerBaseDiagnosticsList.appendChild(div);
    });
  }
  function renderPlayerBaseJsonPreview() {
    els.playerBaseJsonPreview.textContent = state.playerBase ? JSON.stringify(state.playerBase, null, 2) : '{}';
  }
  function renderClassCard(classId, classObj, defaults) {
    const card = document.createElement('div');
    card.className = 'field-group';
    card.style.cssText = 'border:1px solid var(--border);border-radius:6px;padding:10px 12px;background:var(--surface-2)';
    const STAT_FIELDS = ['maxHp','maxMana','damage','hpPerLevel','manaPerLevel','damagePerLevel','moveSpeed'];
    const colorSwatch = classObj.color ? `<span style="display:inline-block;width:12px;height:12px;background:${classObj.color};border-radius:2px;margin-right:4px;vertical-align:middle"></span>` : '';
    const iconFilename = classObj.icon || '';
    const iconSrc = iconFilename ? `/api/class-icon/${encodeURIComponent(iconFilename)}?v=${Date.now()}` : '';
    card.innerHTML = `<div style="font-weight:600;font-size:13px;margin-bottom:8px;display:flex;align-items:center;gap:8px">
        ${iconSrc ? `<img class="pb-class-icon" src="${iconSrc}" alt="${classId} icon" style="width:24px;height:24px;image-rendering:pixelated;border-radius:3px;background:var(--surface);border:1px solid var(--border);display:none" />` : ''}
        <span class="pb-class-icon-fallback" style="width:24px;height:24px;background:${classObj.color||'#555'};border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:#fff;opacity:0.7">${classId[0].toUpperCase()}</span>
        ${colorSwatch}${classObj.name||classId} <span class="subtle mono" style="font-weight:400;font-size:11px">(${classId})</span>
        <span class="subtle" style="font-size:11px;font-weight:400;margin-left:auto">${iconFilename||'no icon'}</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${classObj.description||''}</div>
      <div class="split-grid four-columns" style="gap:6px">
        ${STAT_FIELDS.map(f => {
          const isOverride = classObj[f] !== undefined && classObj[f] !== defaults[f];
          const val = classObj[f] !== undefined ? classObj[f] : (defaults[f]||'');
          const label = {maxHp:'Max HP',maxMana:'Max Mana',damage:'Damage',hpPerLevel:'HP/lvl',manaPerLevel:'Mana/lvl',damagePerLevel:'Dmg/lvl',moveSpeed:'MoveSpd'}[f]||f;
          return `<label class="field" title="${isOverride?'Class override':'Inherited from defaults'}"><span style="${isOverride?'color:var(--accent-gold)':''}">${label}${isOverride?' ★':''}</span><input class="pb-class-stat" data-class="${classId}" data-field="${f}" type="number" step="1" value="${val}" /></label>`;
        }).join('')}
      </div>`;
    // Wire icon load/error
    const img = card.querySelector('.pb-class-icon');
    const fallback = card.querySelector('.pb-class-icon-fallback');
    if (img) {
      img.addEventListener('load', () => { img.style.display = 'inline-block'; if (fallback) fallback.style.display = 'none'; });
      img.addEventListener('error', () => { img.style.display = 'none'; if (fallback) fallback.style.display = 'inline-flex'; });
    }
    card.querySelectorAll('.pb-class-stat').forEach(inp => inp.addEventListener('input', syncPlayerBaseFromForm));
    return card;
  }
  function renderPlayerBaseForm() {
    const pb = state.playerBase;
    if (!pb) return;
    const def = pb.defaults || {};
    els.pbMaxHpInput.value = def.maxHp ?? '';
    els.pbMaxManaInput.value = def.maxMana ?? '';
    els.pbDamageInput.value = def.damage ?? '';
    els.pbHpPerLevelInput.value = def.hpPerLevel ?? '';
    els.pbManaPerLevelInput.value = def.manaPerLevel ?? '';
    els.pbDamagePerLevelInput.value = def.damagePerLevel ?? '';
    els.pbMoveSpeedInput.value = def.moveSpeed ?? '';
    els.pbAttackRangeInput.value = def.attackRange ?? '';
    els.pbAttackCooldownInput.value = def.attackCooldown ?? '';
    els.pbHitParticleInput.value = def.hitParticle || '';
    els.pbHitSfxInput.value = def.hitSfx || '';
    els.pbSwingSfxInput.value = def.swingSfx || '';
    // Render class cards
    els.pbClassesEditor.innerHTML = '';
    const classes = pb.classes || {};
    Object.entries(classes).forEach(([classId, classObj]) => {
      els.pbClassesEditor.appendChild(renderClassCard(classId, classObj, def));
    });
    renderPlayerBaseJsonPreview();
  }
  function syncPlayerBaseFromForm() {
    if (!state.playerBase) state.playerBase = { defaults: {}, classes: {} };
    const pb = state.playerBase;
    if (!pb.defaults) pb.defaults = {};
    const def = pb.defaults;
    def.moveSpeed = Number(els.pbMoveSpeedInput.value) || 0;
    def.attackRange = Number(els.pbAttackRangeInput.value) || 0;
    def.attackCooldown = Number(els.pbAttackCooldownInput.value) || 0;
    def.maxHp = Number(els.pbMaxHpInput.value) || 0;
    def.maxMana = Number(els.pbMaxManaInput.value) || 0;
    def.damage = Number(els.pbDamageInput.value) || 0;
    def.hpPerLevel = Number(els.pbHpPerLevelInput.value) || 0;
    def.manaPerLevel = Number(els.pbManaPerLevelInput.value) || 0;
    def.damagePerLevel = Number(els.pbDamagePerLevelInput.value) || 0;
    const hitParticle = els.pbHitParticleInput.value.trim();
    const hitSfx = els.pbHitSfxInput.value.trim();
    const swingSfx = els.pbSwingSfxInput.value.trim();
    if (hitParticle) def.hitParticle = hitParticle; else delete def.hitParticle;
    if (hitSfx) def.hitSfx = hitSfx; else delete def.hitSfx;
    if (swingSfx) def.swingSfx = swingSfx; else delete def.swingSfx;
    // Sync class overrides
    if (!pb.classes) pb.classes = {};
    document.querySelectorAll('.pb-class-stat').forEach(inp => {
      const classId = inp.dataset.class;
      const field = inp.dataset.field;
      if (!pb.classes[classId]) return;
      const val = inp.value.trim();
      if (val !== '') pb.classes[classId][field] = Number(val);
    });
    setPlayerBaseDirty(true);
    renderPlayerBaseJsonPreview();
  }
  async function loadPlayerBase() {
    const result = await apiFetch('/api/player-base');
    state.playerBase = result.playerBase || {};
    setPlayerBaseDirty(false);
    renderPlayerBaseForm();
    renderPlayerBaseDiagnostics([{level:'info', title:'Player base loaded', message:result.path}], 'Loaded from disk');
  }
  async function savePlayerBase() {
    const result = await apiFetch('/api/player-base', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({playerBase: state.playerBase}) });
    setPlayerBaseDirty(false);
    renderPlayerBaseDiagnostics([{level:'info', title:'Saved successfully', message:result.path}], 'Saved to disk');
  }
  function validatePlayerBase() {
    const messages = [];
    const pb = state.playerBase;
    if (!pb || typeof pb !== 'object' || Array.isArray(pb)) { messages.push({level:'error', title:'Invalid data', message:'playerBase must be an object with defaults and classes keys.'}); renderPlayerBaseDiagnostics(messages, '1 error'); return; }
    if (!pb.defaults || typeof pb.defaults !== 'object') messages.push({level:'error', title:'Missing defaults', message:'playerBase.defaults is required.'});
    else {
      const numFields = ['moveSpeed','attackRange','attackCooldown','maxHp','maxMana','damage','hpPerLevel','manaPerLevel','damagePerLevel'];
      numFields.forEach(f => { if (typeof pb.defaults[f] !== 'number') messages.push({level:'error', title:`defaults.${f}`, message:`${f} must be a number.`}); });
      ['hitParticle','hitSfx','swingSfx'].forEach(f => { if (!pb.defaults[f]) messages.push({level:'warning', title:`defaults.${f}`, message:`${f} should be set for unarmed combat.`}); });
    }
    if (!pb.classes || typeof pb.classes !== 'object' || !Object.keys(pb.classes).length) messages.push({level:'warning', title:'No classes defined', message:'At least one class entry expected.'});
    else {
      Object.entries(pb.classes).forEach(([id, cls]) => {
        if (!cls.name) messages.push({level:'error', title:`classes.${id}.name`, message:'Each class needs a name.'});
        if (!cls.icon) messages.push({level:'warning', title:`classes.${id}.icon`, message:'icon should reference a sprite file.'});
        if (!cls.color) messages.push({level:'warning', title:`classes.${id}.color`, message:'color (CSS) should be set for UI display.'});
      });
    }
    if (!messages.length) messages.push({level:'info', title:'Validation passed', message:'All required fields are present and valid.'});
    const errCount = messages.filter(m=>m.level==='error').length;
    const warnCount = messages.filter(m=>m.level==='warning').length;
    renderPlayerBaseDiagnostics(messages, errCount||warnCount ? `${errCount} error(s), ${warnCount} warning(s)` : 'Validation passed');
  }


  // Props
  function getPropSpriteUrl(id) { return `/api/prop-sprite/${encodeURIComponent(id)}?v=${Date.now()}`; }
  function getPropSpriteDisplayPath(id) { return `public/assets/sprites/props/${id}.png`; }
  function getVisiblePropKeys() { return Object.keys(state.props).filter(k => k.toLowerCase().includes(state.propSearch.toLowerCase())).sort((a,b)=>a.localeCompare(b)); }
  function getSelectedPropEntry() { return state.selectedPropKey ? state.props[state.selectedPropKey] || null : null; }
  function ensureUniquePropKey(baseKey){ let c=baseKey, i=2; while(state.props[c]) c=`${baseKey}_${i++}`; return c; }

  function setPropSpriteStatus(exists) {
    state.propSpriteExists = exists;
    if (exists === true) {
      els.propSpriteStatusBadge.textContent = 'Sprite found';
      els.propSpriteStatusBadge.className = 'badge online';
      els.propSpritePreviewImage.classList.remove('hidden');
      els.propSpritePreviewFallback.classList.add('hidden');
    } else if (exists === false) {
      els.propSpriteStatusBadge.textContent = 'Using fallback color';
      els.propSpriteStatusBadge.className = 'badge unsaved';
      els.propSpritePreviewImage.classList.add('hidden');
      els.propSpritePreviewFallback.classList.remove('hidden');
    } else {
      els.propSpriteStatusBadge.textContent = 'Checking sprite';
      els.propSpriteStatusBadge.className = 'badge muted';
      els.propSpritePreviewImage.classList.add('hidden');
      els.propSpritePreviewFallback.classList.remove('hidden');
    }
  }
  function renderPropList() {
    const visibleKeys = getVisiblePropKeys();
    const allKeys = Object.keys(state.props);
    els.propEntryCount.textContent = String(allKeys.length);
    els.propBlockedCount.textContent = String(allKeys.filter(k => !!state.props[k]?.blocked).length);
    els.propList.innerHTML = '';
    if (!visibleKeys.length) { const empty=document.createElement('div'); empty.className='subtle'; empty.textContent='No matching props.'; els.propList.appendChild(empty); return; }
    for (const key of visibleKeys) {
      const entry = state.props[key] || {};
      const button = document.createElement('button');
      button.className = 'tile-list-item' + (key === state.selectedPropKey ? ' active' : '');
      button.type = 'button';
      const color = Array.isArray(entry.color) ? entry.color : [0,0,0];
      button.innerHTML = `
        <span class="swatch" style="background:${rgbToHex(color)}"></span>
        <span class="tile-text">
          <strong class="tile-name">${key}</strong>
          <span class="tile-meta">${entry.blocked ? 'Blocked' : 'Walkable'} • fallback rgb(${color.join(', ')})</span>
        </span>`;
      button.addEventListener('click', () => { state.selectedPropKey = key; renderPropPanel(); renderPropList(); });
      els.propList.appendChild(button);
    }
  }
  function renderPropPanel() {
    const entry = getSelectedPropEntry();
    if (!entry) {
      els.selectedPropLabel.textContent = 'Nothing selected';
      els.propEmptyState.classList.remove('hidden');
      els.propForm.classList.add('hidden');
      els.propJsonPreview.textContent = '';
      return;
    }
    const color = Array.isArray(entry.color) ? entry.color.map(clampByte) : [0,0,0];
    const hex = rgbToHex(color);
    els.selectedPropLabel.textContent = state.selectedPropKey;
    els.propEmptyState.classList.add('hidden');
    els.propForm.classList.remove('hidden');
    els.propIdInput.value = state.selectedPropKey;
    els.propBlockedInput.checked = !!entry.blocked;
    els.propColorPicker.value = hex;
    els.propRInput.value = String(color[0]); els.propGInput.value = String(color[1]); els.propBInput.value = String(color[2]);
    els.propColorPreview.style.background = hex;
    els.propSpritePathLabel.textContent = getPropSpriteDisplayPath(state.selectedPropKey);
    els.propJsonPreview.textContent = JSON.stringify({ [state.selectedPropKey]: { color, blocked: !!entry.blocked } }, null, 2);
    setPropSpriteStatus(null);
    els.propSpritePreviewImage.src = getPropSpriteUrl(state.selectedPropKey);
  }
  function renderPropDiagnostics(items=[], summary='No validation run yet') {
    els.propValidationSummary.textContent = summary; els.propDiagnosticsList.innerHTML = '';
    if (!items.length) { els.propDiagnosticsList.className='diagnostics-list empty-diagnostics'; els.propDiagnosticsList.innerHTML='<p>No messages yet.</p>'; return; }
    els.propDiagnosticsList.className='diagnostics-list';
    for (const item of items) { const div=document.createElement('div'); div.className=`diagnostic-item ${item.level||'info'}`; div.innerHTML=`<strong>${item.title}</strong><div>${item.message}</div>`; els.propDiagnosticsList.appendChild(div); }
  }
  function renderProps() { renderPropList(); renderPropPanel(); }
  function updateSelectedPropColor(rgb) { const entry=getSelectedPropEntry(); if(!entry) return; entry.color=rgb.map(clampByte); setPropDirty(true); renderProps(); }
  function renameSelectedPropKey(newKeyRaw) {
    const entry=getSelectedPropEntry(); if(!entry) return; const newKey=String(newKeyRaw||'').trim(); if(!newKey || newKey===state.selectedPropKey) return;
    if(state.props[newKey]) { renderPropDiagnostics([{level:'error',title:'Rename failed',message:`A prop with type "${newKey}" already exists.`}],'Rename blocked'); renderPropPanel(); return; }
    const oldKey=state.selectedPropKey; const newProps={};
    Object.keys(state.props).forEach(k => { newProps[k===oldKey ? newKey : k] = k===oldKey ? entry : state.props[k]; });
    state.props=newProps; state.selectedPropKey=newKey; setPropDirty(true); renderProps();
  }
  async function loadProps() {
    const result = await apiFetch('/api/props');
    state.props = result.props || {};
    const keys = Object.keys(state.props);
    state.selectedPropKey = keys.includes(state.selectedPropKey) ? state.selectedPropKey : (keys[0] || null);
    setPropDirty(false); renderProps(); renderPropDiagnostics([{level:'info',title:'Props loaded',message:result.path}], `Loaded ${keys.length} entries from disk`);
  }
  async function saveProps() {
    const result = await apiFetch('/api/props', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({props: state.props}) });
    setPropDirty(false); renderPropDiagnostics([{level:'info',title:'Saved successfully',message:result.path}], `Saved ${Object.keys(state.props).length} entries to disk`);
  }
  function validateProps() {
    const messages=[]; const entries=Object.entries(state.props);
    if(!entries.length) messages.push({level:'warning', title:'Props list is empty', message:'There are no prop entries defined. Add a key here and place a matching PNG in public/assets/sprites/props/ — no code changes needed.'});
    for(const [key, value] of entries){
      if(!key.trim()) messages.push({level:'error', title:'Blank prop type', message:'A prop entry has an empty type key.'});
      if(!value || typeof value !== 'object'){ messages.push({level:'error', title:`Invalid entry: ${key}`, message:'Entry must be an object.'}); continue; }
      if(!Array.isArray(value.color) || value.color.length !== 3) messages.push({level:'error', title:`Invalid color: ${key}`, message:'Color must be an RGB array with exactly 3 values.'});
      else value.color.forEach((channel,index)=>{ if(!Number.isInteger(Number(channel)) || Number(channel)<0 || Number(channel)>255) messages.push({level:'error', title:`Channel out of range: ${key}`, message:`Color index ${index} must be 0-255.`}); });
      if(typeof value.blocked !== 'boolean') messages.push({level:'warning', title:`Blocked flag type: ${key}`, message:'blocked should be a boolean true or false.'});
    }
    if(state.propSpriteExists === false && state.selectedPropKey) messages.push({level:'warning', title:'Selected prop sprite missing', message:`${getPropSpriteDisplayPath(state.selectedPropKey)} was not found. SpriteManager will use the fallback color at runtime. Add the PNG to fix this.`});
    if(!messages.length) messages.push({level:'info', title:'Validation passed', message:'No schema problems detected in props.json.'});
    const errorCount=messages.filter(m=>m.level==='error').length; const warningCount=messages.filter(m=>m.level==='warning').length;
    renderPropDiagnostics(messages, errorCount||warningCount ? `${errorCount} error(s), ${warningCount} warning(s)` : 'Validation passed');
  }
  function addProp(){ const key=ensureUniquePropKey('newProp'); state.props[key]={color:[128,128,128], blocked:false}; state.selectedPropKey=key; setPropDirty(true); renderProps(); }
  function duplicateProp(){ const entry=getSelectedPropEntry(); if(!entry) return; const key=ensureUniquePropKey(`${state.selectedPropKey}_copy`); state.props[key]=JSON.parse(JSON.stringify(entry)); state.selectedPropKey=key; setPropDirty(true); renderProps(); }
  function deleteProp(){ const entry=getSelectedPropEntry(); if(!entry) return; if(!window.confirm(`Delete prop "${state.selectedPropKey}"?`)) return; delete state.props[state.selectedPropKey]; state.selectedPropKey=Object.keys(state.props)[0]||null; setPropDirty(true); renderProps(); }
  async function scanPropsFolder() {
    const result = await apiFetch('/api/prop-sprites/scan');
    const pendingIds = result.newIds || [];
    // Build and show a simple confirm — reuse the tile scan modal
    state.pendingPropScanIds = pendingIds;
    els.scanNewCount.textContent = String(pendingIds.length);
    els.scanExistingCount.textContent = String((result.existingSpriteIds||[]).length);
    els.scanSpriteDirLabel.textContent = result.spriteDir || 'public/assets/sprites/props';
    els.scanTileIdList.innerHTML = '';
    if (!pendingIds.length) {
      els.scanModalSubtitle.textContent = 'No new prop types were found. All PNGs already have entries.';
      els.scanTileIdList.innerHTML = '<p class="subtle">Nothing new will be added.</p>';
      els.scanConfirmButton.disabled = true;
    } else {
      els.scanModalSubtitle.textContent = 'Review additions before applying them to props. This does not save to disk until you click Save.';
      pendingIds.forEach(id => { const pill=document.createElement('span'); pill.className='pill'; pill.textContent=id; els.scanTileIdList.appendChild(pill); });
      els.scanConfirmButton.disabled = false;
    }
    // Override confirm to apply to props instead of tiles
    els.scanConfirmButton.onclick = confirmPropScanAdditions;
    els.scanModal.classList.remove('hidden'); els.scanModal.setAttribute('aria-hidden','false');
  }
  function confirmPropScanAdditions() {
    if(!state.pendingPropScanIds.length){ closeScanModal(); return; }
    state.pendingPropScanIds.forEach(id=>{ if(!state.props[id]) state.props[id]={color:[128,128,128], blocked:false}; });
    if(!state.selectedPropKey && state.pendingPropScanIds.length) state.selectedPropKey=state.pendingPropScanIds[0];
    const addedCount=state.pendingPropScanIds.length;
    setPropDirty(true); renderProps();
    renderPropDiagnostics([{level:'info', title:'Prop scan applied', message:`Added ${addedCount} new prop entr${addedCount===1?'y':'ies'} from the sprites folder. SpriteManager will auto-load the matching PNGs at startup. Click Save to write to disk.`}], `Added ${addedCount} staged prop entr${addedCount===1?'y':'ies'}`);
    state.pendingPropScanIds=[];
    closeScanModal();
    // Restore tile confirm handler
    els.scanConfirmButton.onclick = null;
    els.scanConfirmButton.addEventListener('click', confirmScanAdditions);
  }

  // Particles
  const DEFAULT_NEW_PARTICLE = { count:[4,8], lifetime:[0.2,0.5], speed:[40,120], angle:[0,360], size:[2,5], sizeEnd:0, color:['#ffffff','#ffeeaa'], gravity:0, friction:0.92, fadeOut:true, blendMode:'lighter' };

  // ── Self-contained preview engine ──────────────────────────────────────────
  // Mirrors ParticleSystem logic exactly but needs no import, no game ref,
  // no fetch — works directly from the live preset object in state.
  const _preview = {
    particles: [],
    maxParticles: 1500,
    rafId: null,
    lastTime: null,
    autoEmitInterval: 1.2,   // seconds between auto-bursts
    autoEmitAccum: 0,
    ctx: null,
    canvas: null,

    _rand(min, max) { return min + Math.random() * (max - min); },

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this._resize();
    },

    _resize() {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width  = rect.width  * devicePixelRatio;
      this.canvas.height = rect.height * devicePixelRatio;
      if (this.ctx) this.ctx.scale(devicePixelRatio, devicePixelRatio);
    },

    emit(cfg, x, y) {
      if (!cfg) return;
      const count = (this._rand(cfg.count[0], cfg.count[1])) | 0;
      const colors = cfg.color;
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= this.maxParticles) break;
        const angleDeg = this._rand(cfg.angle[0], cfg.angle[1]);
        const angleRad = angleDeg * Math.PI / 180;
        const speed    = this._rand(cfg.speed[0],    cfg.speed[1]);
        const life     = this._rand(cfg.lifetime[0], cfg.lifetime[1]);
        const size     = this._rand(cfg.size[0],     cfg.size[1]);
        this.particles.push({
          x, y,
          vx: Math.cos(angleRad) * speed,
          vy: Math.sin(angleRad) * speed,
          life, maxLife: life, size,
          sizeEnd:   cfg.sizeEnd  ?? 0,
          color:     colors[(Math.random() * colors.length) | 0],
          gravity:   cfg.gravity  || 0,
          friction:  cfg.friction ?? 1,
          fadeOut:   cfg.fadeOut  !== false,
          blendMode: cfg.blendMode || 'source-over',
        });
      }
    },

    update(dt) {
      const ps = this.particles;
      let w = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) continue;
        p.vy += p.gravity  * dt;
        p.vx *= p.friction;
        p.vy *= p.friction;
        p.x  += p.vx * dt;
        p.y  += p.vy * dt;
        ps[w++] = p;
      }
      ps.length = w;
    },

    draw() {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx;
      const W = this.canvas.width  / devicePixelRatio;
      const H = this.canvas.height / devicePixelRatio;
      // Fade trail effect — cheaper than clearRect and looks great
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#08090f';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;

      if (this.particles.length === 0) return;
      const prevAlpha = ctx.globalAlpha;
      const prevBlend = ctx.globalCompositeOperation;
      let currentBlend = null;

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const t    = 1 - p.life / p.maxLife;
        const size = p.size + (p.sizeEnd - p.size) * t;
        if (size <= 0) continue;
        const alpha = p.fadeOut ? p.life / p.maxLife : 1;
        if (p.blendMode !== currentBlend) {
          currentBlend = p.blendMode;
          ctx.globalCompositeOperation = currentBlend;
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = p.color;
        ctx.fillRect(p.x - size * 0.5, p.y - size * 0.5, size, size);
      }
      ctx.globalAlpha = prevAlpha;
      ctx.globalCompositeOperation = prevBlend;
    },

    clear() { this.particles.length = 0; },

    _loop(ts) {
      this.rafId = requestAnimationFrame(t => this._loop(t));
      const dt = Math.min((ts - (this.lastTime || ts)) / 1000, 0.1);
      this.lastTime = ts;

      // Auto-emit burst on interval, respecting emitInterval for continuous presets
      if (state.activeTab === 'particles' && state.selectedParticleKey) {
        const cfg = state.particles[state.selectedParticleKey];
        const interval = (cfg && cfg.continuous && cfg.emitInterval) ? cfg.emitInterval : this.autoEmitInterval;
        this.autoEmitAccum += dt;
        if (this.autoEmitAccum >= interval) {
          this.autoEmitAccum = 0;
          if (cfg && this.canvas) {
            const W = this.canvas.width  / devicePixelRatio;
            const H = this.canvas.height / devicePixelRatio;
            this.emit(cfg, W / 2, H / 2);
          }
        }
      }

      this.update(dt);
      this.draw();
    },

    start() {
      if (this.rafId) return;
      this.lastTime = null;
      this.autoEmitAccum = 0;
      this.rafId = requestAnimationFrame(t => this._loop(t));
    },

    stop() {
      if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
      // Do one final clear draw so the canvas doesn't linger
      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      this.clear();
    },

    emitAtCenter() {
      const cfg = state.selectedParticleKey ? state.particles[state.selectedParticleKey] : null;
      if (!cfg || !this.canvas) return;
      const W = this.canvas.width  / devicePixelRatio;
      const H = this.canvas.height / devicePixelRatio;
      this.emit(cfg, W / 2, H / 2);
      this.autoEmitAccum = 0; // reset timer so next auto-burst is a full interval away
    },

    emitAt(canvasX, canvasY) {
      const cfg = state.selectedParticleKey ? state.particles[state.selectedParticleKey] : null;
      if (!cfg) return;
      this.emit(cfg, canvasX, canvasY);
      this.autoEmitAccum = 0;
    },
  };
  // ── End preview engine ──────────────────────────────────────────────────────

  function getVisibleParticleKeys() { return Object.keys(state.particles).filter(k => k.toLowerCase().includes(state.particleSearch.toLowerCase())).sort((a,b)=>a.localeCompare(b)); }
  function getSelectedParticleEntry() { return state.selectedParticleKey ? state.particles[state.selectedParticleKey] || null : null; }
  function ensureUniqueParticleKey(baseKey){ let c=baseKey, i=2; while(state.particles[c]) c=`${baseKey}_${i++}`; return c; }

  function renderParticleColorSwatches(colors) {
    els.particleColorSwatchRow.innerHTML = '';
    (colors || []).forEach(hex => {
      const s = document.createElement('div');
      s.className = 'particle-swatch-preview';
      s.style.background = hex;
      s.title = hex;
      els.particleColorSwatchRow.appendChild(s);
    });
  }
  function renderParticleColorEditor(colors) {
    els.particleColorEditor.innerHTML = '';
    const arr = Array.isArray(colors) ? colors : [];
    els.particleColorEmptyState.classList.toggle('hidden', arr.length > 0);
    arr.forEach((hex, index) => {
      const row = document.createElement('div');
      row.className = 'particle-color-row';
      row.innerHTML = `
        <input class="particle-color-swatch-inline" type="color" value="${/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#ffffff'}" />
        <input class="particle-color-text-input" type="text" value="${hex}" />
        <button class="button danger small" type="button">Remove</button>
      `;
      const picker = row.querySelector('.particle-color-swatch-inline');
      const text = row.querySelector('.particle-color-text-input');
      const updateColor = (val) => {
        const entry = getSelectedParticleEntry(); if (!entry) return;
        entry.color[index] = val;
        setParticleDirty(true);
        renderParticleColorSwatches(entry.color);
        renderParticleJsonPreview();
      };
      picker.addEventListener('input', e => { text.value = e.target.value; updateColor(e.target.value); });
      text.addEventListener('input', e => {
        const v = e.target.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) { picker.value = v; updateColor(v); }
        else { const entry = getSelectedParticleEntry(); if (entry) { entry.color[index] = v; setParticleDirty(true); renderParticleJsonPreview(); } }
      });
      row.querySelector('.button').addEventListener('click', () => {
        const entry = getSelectedParticleEntry(); if (!entry) return;
        entry.color.splice(index, 1); setParticleDirty(true); renderParticlePanel();
      });
      els.particleColorEditor.appendChild(row);
    });
  }
  function renderParticleJsonPreview() {
    const entry = getSelectedParticleEntry();
    els.particleJsonPreview.textContent = entry ? JSON.stringify({ [state.selectedParticleKey]: entry }, null, 2) : '';
  }
  function renderParticleList() {
    const visibleKeys = getVisibleParticleKeys();
    const allKeys = Object.keys(state.particles);
    els.particleEntryCount.textContent = String(allKeys.length);
    els.particleAdditiveCount.textContent = String(allKeys.filter(k => state.particles[k]?.blendMode === 'lighter').length);
    els.particleList.innerHTML = '';
    if (!visibleKeys.length) { const empty=document.createElement('div'); empty.className='subtle'; empty.textContent='No matching presets.'; els.particleList.appendChild(empty); return; }
    for (const key of visibleKeys) {
      const entry = state.particles[key] || {};
      const colors = Array.isArray(entry.color) ? entry.color : [];
      const primaryColor = colors[0] || '#888';
      const button = document.createElement('button');
      button.className = 'tile-list-item' + (key === state.selectedParticleKey ? ' active' : '');
      button.type = 'button';
      button.innerHTML = `
        <span class="swatch" style="background:${primaryColor}"></span>
        <span class="tile-text">
          <strong class="tile-name">${key}</strong>
          <span class="tile-meta">${entry.blendMode || 'source-over'} • count ${(entry.count||[0])[0]}–${(entry.count||[0,0])[1]} • ${colors.length} color${colors.length!==1?'s':''}</span>
        </span>`;
      button.addEventListener('click', () => { state.selectedParticleKey = key; renderParticlePanel(); renderParticleList(); });
      els.particleList.appendChild(button);
    }
  }
  function renderParticlePanel() {
    const entry = getSelectedParticleEntry();
    if (!entry) {
      els.selectedParticleLabel.textContent = 'Nothing selected';
      els.particleEmptyState.classList.remove('hidden');
      els.particleForm.classList.add('hidden');
      els.particleJsonPreview.textContent = '';
      return;
    }
    els.selectedParticleLabel.textContent = state.selectedParticleKey;
    els.particleEmptyState.classList.add('hidden');
    els.particleForm.classList.remove('hidden');
    els.particleIdInput.value = state.selectedParticleKey;
    els.particleBlendModeInput.value = entry.blendMode || 'source-over';
    els.particleFadeOutInput.checked = entry.fadeOut !== false;
    els.particleContinuousInput.checked = !!entry.continuous;
    els.particleEmitIntervalInput.value = entry.emitInterval != null ? entry.emitInterval : '';
    els.particleCountMinInput.value = entry.count?.[0] ?? '';
    els.particleCountMaxInput.value = entry.count?.[1] ?? '';
    els.particleLifetimeMinInput.value = entry.lifetime?.[0] ?? '';
    els.particleLifetimeMaxInput.value = entry.lifetime?.[1] ?? '';
    els.particleSpeedMinInput.value = entry.speed?.[0] ?? '';
    els.particleSpeedMaxInput.value = entry.speed?.[1] ?? '';
    els.particleAngleMinInput.value = entry.angle?.[0] ?? '';
    els.particleAngleMaxInput.value = entry.angle?.[1] ?? '';
    els.particleGravityInput.value = entry.gravity ?? 0;
    els.particleFrictionInput.value = entry.friction ?? 1;
    els.particleSizeMinInput.value = entry.size?.[0] ?? '';
    els.particleSizeMaxInput.value = entry.size?.[1] ?? '';
    els.particleSizeEndInput.value = entry.sizeEnd ?? 0;
    renderParticleColorEditor(entry.color || []);
    renderParticleColorSwatches(entry.color || []);
    renderParticleJsonPreview();
  }
  function syncSelectedParticleFromForm() {
    const entry = getSelectedParticleEntry(); if (!entry) return;
    const newKey = (els.particleIdInput.value || '').trim() || state.selectedParticleKey;
    if (newKey !== state.selectedParticleKey) {
      if (state.particles[newKey]) return;
      const oldKey = state.selectedParticleKey; const newParticles = {};
      Object.keys(state.particles).forEach(k => { newParticles[k === oldKey ? newKey : k] = state.particles[k]; });
      state.particles = newParticles; state.selectedParticleKey = newKey;
    }
    entry.blendMode = els.particleBlendModeInput.value;
    entry.fadeOut = els.particleFadeOutInput.checked;
    entry.continuous = els.particleContinuousInput.checked;
    const emitInterval = parseFloat(els.particleEmitIntervalInput.value);
    if (!isNaN(emitInterval) && emitInterval > 0) entry.emitInterval = emitInterval;
    else delete entry.emitInterval;
    entry.count = [Number(els.particleCountMinInput.value||0), Number(els.particleCountMaxInput.value||0)];
    entry.lifetime = [Number(els.particleLifetimeMinInput.value||0), Number(els.particleLifetimeMaxInput.value||0)];
    entry.speed = [Number(els.particleSpeedMinInput.value||0), Number(els.particleSpeedMaxInput.value||0)];
    entry.angle = [Number(els.particleAngleMinInput.value||0), Number(els.particleAngleMaxInput.value||0)];
    entry.gravity = Number(els.particleGravityInput.value||0);
    entry.friction = Number(els.particleFrictionInput.value||1);
    entry.size = [Number(els.particleSizeMinInput.value||0), Number(els.particleSizeMaxInput.value||0)];
    entry.sizeEnd = Number(els.particleSizeEndInput.value||0);
    setParticleDirty(true);
    renderParticleList();
    renderParticleJsonPreview();
  }
  function renderParticleDiagnostics(items=[], summary='No validation run yet') {
    els.particleValidationSummary.textContent = summary; els.particleDiagnosticsList.innerHTML = '';
    if (!items.length) { els.particleDiagnosticsList.className='diagnostics-list empty-diagnostics'; els.particleDiagnosticsList.innerHTML='<p>No messages yet.</p>'; return; }
    els.particleDiagnosticsList.className='diagnostics-list';
    for (const item of items) { const div=document.createElement('div'); div.className=`diagnostic-item ${item.level||'info'}`; div.innerHTML=`<strong>${item.title}</strong><div>${item.message}</div>`; els.particleDiagnosticsList.appendChild(div); }
  }
  function renderParticles() { renderParticleList(); renderParticlePanel(); }
  async function loadParticles() {
    const result = await apiFetch('/api/particles');
    state.particles = result.particles || {};
    const keys = Object.keys(state.particles);
    state.selectedParticleKey = keys.includes(state.selectedParticleKey) ? state.selectedParticleKey : (keys[0] || null);
    setParticleDirty(false); renderParticles(); renderParticleDiagnostics([{level:'info', title:'Particles loaded', message:result.path}], `Loaded ${keys.length} presets from disk`);
  }
  async function saveParticles() {
    const result = await apiFetch('/api/particles', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({particles: state.particles}) });
    setParticleDirty(false); renderParticleDiagnostics([{level:'info', title:'Saved successfully', message:result.path}], `Saved ${Object.keys(state.particles).length} presets to disk`);
  }
  function validateParticles() {
    const messages=[]; const entries=Object.entries(state.particles);
    const VALID_BLENDS = new Set(['lighter','source-over','multiply','screen','overlay']);
    if (!entries.length) messages.push({level:'warning', title:'No presets', message:'particles.json is empty.'});
    for (const [key, entry] of entries) {
      if (!key.trim()) { messages.push({level:'error', title:'Blank key', message:'A preset has an empty name.'}); continue; }
      for (const field of ['count','lifetime','speed','angle','size']) {
        if (!Array.isArray(entry[field]) || entry[field].length !== 2) messages.push({level:'error', title:`${key}: ${field}`, message:`${field} must be [min, max].`});
        else if (entry[field][0] > entry[field][1]) messages.push({level:'warning', title:`${key}: ${field} range`, message:`${field}[0] is greater than ${field}[1].`});
      }
      if (typeof entry.sizeEnd !== 'number') messages.push({level:'error', title:`${key}: sizeEnd`, message:'sizeEnd must be a number.'});
      if (!Array.isArray(entry.color) || !entry.color.length) messages.push({level:'error', title:`${key}: color`, message:'color must be a non-empty array.'});
      else entry.color.forEach((c,i) => { if(typeof c !== 'string') messages.push({level:'warning', title:`${key}: color[${i}]`, message:'Color entries should be strings.'}); });
      if (typeof entry.gravity !== 'number') messages.push({level:'error', title:`${key}: gravity`, message:'gravity must be a number.'});
      if (typeof entry.friction !== 'number' || entry.friction < 0 || entry.friction > 1) messages.push({level:'warning', title:`${key}: friction`, message:'friction should be a number between 0 and 1.'});
      if (typeof entry.fadeOut !== 'boolean') messages.push({level:'warning', title:`${key}: fadeOut`, message:'fadeOut should be a boolean.'});
      if (!VALID_BLENDS.has(entry.blendMode)) messages.push({level:'warning', title:`${key}: blendMode`, message:`blendMode "${entry.blendMode}" is unusual. Common values: lighter, source-over.`});
      if (entry.continuous && !entry.emitInterval) messages.push({level:'warning', title:`${key}: emitInterval`, message:'Continuous presets should define emitInterval (seconds between bursts).'});
      if (entry.emitInterval != null && (typeof entry.emitInterval !== 'number' || entry.emitInterval <= 0)) messages.push({level:'error', title:`${key}: emitInterval`, message:'emitInterval must be a positive number.'});
    }
    if (!messages.length) messages.push({level:'info', title:'Validation passed', message:'No schema problems detected in particles.json.'});
    const errorCount=messages.filter(m=>m.level==='error').length; const warningCount=messages.filter(m=>m.level==='warning').length;
    renderParticleDiagnostics(messages, errorCount||warningCount ? `${errorCount} error(s), ${warningCount} warning(s)` : 'Validation passed');
  }
  function addParticle() { const key=ensureUniqueParticleKey('newParticle'); state.particles[key]=JSON.parse(JSON.stringify(DEFAULT_NEW_PARTICLE)); state.selectedParticleKey=key; setParticleDirty(true); renderParticles(); }
  function duplicateParticle() { const entry=getSelectedParticleEntry(); if(!entry) return; const key=ensureUniqueParticleKey(`${state.selectedParticleKey}_copy`); state.particles[key]=JSON.parse(JSON.stringify(entry)); state.selectedParticleKey=key; setParticleDirty(true); renderParticles(); }
  function deleteParticle() { const entry=getSelectedParticleEntry(); if(!entry) return; if(!window.confirm(`Delete preset "${state.selectedParticleKey}"?`)) return; delete state.particles[state.selectedParticleKey]; state.selectedParticleKey=Object.keys(state.particles)[0]||null; setParticleDirty(true); renderParticles(); }
  function addParticleColor() { const entry=getSelectedParticleEntry(); if(!entry) return; if(!Array.isArray(entry.color)) entry.color=[]; entry.color.push('#ffffff'); setParticleDirty(true); renderParticlePanel(); }

  // Skills
  function getSkillIconUrl(icon) { return `/api/skill-icon/${encodeURIComponent(icon)}?v=${Date.now()}`; }
  function getSkillIconDisplayPath(icon) { return `public/assets/sprites/skills/${icon}.png`; }
  function setSkillIconStatus(exists) {
    state.skillIconExists = exists;
    if (exists === true) {
      els.skillIconStatusBadge.textContent = 'Icon found'; els.skillIconStatusBadge.className = 'badge online';
      els.skillIconPreviewImage.classList.remove('hidden'); els.skillIconPreviewFallback.classList.add('hidden');
    } else if (exists === false) {
      els.skillIconStatusBadge.textContent = 'Missing icon'; els.skillIconStatusBadge.className = 'badge unsaved';
      els.skillIconPreviewImage.classList.add('hidden'); els.skillIconPreviewFallback.classList.remove('hidden');
    } else {
      els.skillIconStatusBadge.textContent = 'Checking'; els.skillIconStatusBadge.className = 'badge muted';
      els.skillIconPreviewImage.classList.add('hidden'); els.skillIconPreviewFallback.classList.remove('hidden');
    }
  }

  function getStatusEffectIconUrl(iconPath) { return `/api/status-sprite/${encodeURIComponent(iconPath)}?v=${Date.now()}`; }
  function setStatusEffectIconStatus(exists) {
    state.statusEffectIconExists = exists;
    if (exists === true) {
      els.statusEffectIconStatusBadge.textContent = 'Icon found'; els.statusEffectIconStatusBadge.className = 'badge online';
      els.statusEffectIconPreviewImage.classList.remove('hidden'); els.statusEffectIconPreviewFallback.classList.add('hidden');
    } else if (exists === false) {
      els.statusEffectIconStatusBadge.textContent = 'Missing icon'; els.statusEffectIconStatusBadge.className = 'badge unsaved';
      els.statusEffectIconPreviewImage.classList.add('hidden'); els.statusEffectIconPreviewFallback.classList.remove('hidden');
    } else {
      els.statusEffectIconStatusBadge.textContent = 'Checking'; els.statusEffectIconStatusBadge.className = 'badge muted';
      els.statusEffectIconPreviewImage.classList.add('hidden'); els.statusEffectIconPreviewFallback.classList.remove('hidden');
    }
  }

  const SKILL_TYPES = ['attack','heal','buff','debuff','support'];
  const SKILL_TARGETING = ['enemy','self','aoe','aoe_ally'];
  const KNOWN_CLASSES = ['warrior','mage','ranger','cleric','rogue'];
  const DEFAULT_NEW_SKILL = { id:'newSkill', name:'New Skill', description:'', type:'attack', targeting:'enemy', range:null, cooldown:null, manaCost:0, damage:0, damageType:'physical', particle:null, sfx:null, classes:[], levelReq:1, icon:'newSkill' };

  function getVisibleSkillKeys() {
    const q = state.skillSearch.toLowerCase();
    return Object.keys(state.skills).filter(k => {
      const s = state.skills[k] || {};
      return !q || k.toLowerCase().includes(q) || String(s.name||'').toLowerCase().includes(q) || String(s.type||'').toLowerCase().includes(q);
    }).sort((a,b)=>a.localeCompare(b));
  }
  function getSelectedSkillEntry() { return state.selectedSkillKey ? state.skills[state.selectedSkillKey] || null : null; }
  function ensureUniqueSkillKey(baseKey){ let c=baseKey, i=2; while(state.skills[c]) c=`${baseKey}_${i++}`; return c; }

  const SKILL_TYPE_COLOR = { attack:'#d06060', heal:'#3fb06a', buff:'#5a9cf5', debuff:'#c8983a', support:'#9daabf' };

  function updateSkillTypeVisibility(type) {
    document.querySelectorAll('.skill-type-group').forEach(el => {
      const types = (el.dataset.skillType || '').split(',');
      el.classList.toggle('visible', types.includes(type));
    });
  }

  function getSkillClasses() {
    const checked = [...document.querySelectorAll('.skill-class-cb:checked')].map(cb => cb.value);
    const extra = (els.skillClassesExtraInput.value || '').split(',').map(s=>s.trim()).filter(Boolean);
    return [...new Set([...checked, ...extra])];
  }

  function buildCurrentSkillObject() {
    const type = els.skillTypeInput.value;
    const obj = {
      id: (els.skillIdInput.value || '').trim() || state.selectedSkillKey,
      name: els.skillNameInput.value || '',
      description: els.skillDescriptionInput.value || '',
      type,
      targeting: els.skillTargetingInput.value,
      range: els.skillRangeInput.value !== '' ? Number(els.skillRangeInput.value) : null,
      cooldown: els.skillCooldownInput.value !== '' ? Number(els.skillCooldownInput.value) : null,
      manaCost: Number(els.skillManaCostInput.value || 0),
      classes: getSkillClasses(),
      levelReq: Number(els.skillLevelReqInput.value || 1),
      icon: (els.skillIconInput.value || '').trim(),
    };
    const particle = els.skillParticleInput.value.trim();
    const hitParticle = els.skillHitParticleInput.value.trim();
    const sfx = els.skillSfxInput.value.trim();
    const castSfx = els.skillCastSfxInput.value.trim();
    const projSpeed = els.skillProjectileSpeedInput.value;
    if (particle) obj.particle = particle;
    if (hitParticle) obj.hitParticle = hitParticle;
    if (sfx) obj.sfx = sfx;
    if (castSfx) obj.castSfx = castSfx;
    if (projSpeed !== '') obj.projectileSpeed = Number(projSpeed);
    if (els.skillRequiresWeaponInput.checked) obj.requiresWeapon = true;
    if (els.skillRequiresShieldInput.checked) obj.requiresShield = true;
    const weaponTypes = (els.skillRequiresWeaponTypeInput.value || '').split(',').map(s=>s.trim()).filter(Boolean);
    if (weaponTypes.length) obj.requiresWeaponType = weaponTypes;
    if (type === 'attack' || type === 'debuff') {
      obj.damage = Number(els.skillDamageInput.value || 0);
      obj.damageType = els.skillDamageTypeInput.value;
      const dpl = els.skillDamagePerLevelInput.value;
      if (dpl !== '') obj.damagePerLevel = Number(dpl);
      const aoeR = els.skillAoeRadiusInput.value;
      if (aoeR !== '') obj.aoeRadius = Number(aoeR);
      const hits = els.skillHitsInput.value;
      if (hits !== '') obj.hits = Number(hits);
      const hitInt = els.skillHitIntervalInput.value;
      if (hitInt !== '') obj.hitInterval = Number(hitInt);
      if (els.skillChanneledInput.checked) obj.channeled = true;
    }
    if (type === 'heal') {
      obj.healAmount = Number(els.skillHealAmountInput.value || 0);
      const hpl = els.skillHealPerLevelInput.value;
      if (hpl !== '') obj.healPerLevel = Number(hpl);
      const ticks = els.skillHealTicksInput.value;
      if (ticks !== '') obj.healTicks = Number(ticks);
      const tickInt = els.skillHealIntervalInput.value;
      if (tickInt !== '') obj.healInterval = Number(tickInt);
      if (els.skillHealChanneledInput.checked) obj.channeled = true;
    }
    return obj;
  }

  function renderSkillPanel() {
    const skill = getSelectedSkillEntry();
    if (!skill) {
      els.selectedSkillLabel.textContent = 'Nothing selected';
      els.skillEmptyState.classList.remove('hidden');
      els.skillForm.classList.add('hidden');
      els.skillJsonPreview.textContent = '';
      return;
    }
    els.selectedSkillLabel.textContent = state.selectedSkillKey;
    els.skillEmptyState.classList.add('hidden');
    els.skillForm.classList.remove('hidden');
    els.skillIdInput.value = skill.id || state.selectedSkillKey;
    els.skillNameInput.value = skill.name || '';
    els.skillDescriptionInput.value = skill.description || '';
    els.skillTypeInput.value = SKILL_TYPES.includes(skill.type) ? skill.type : 'attack';
    els.skillTargetingInput.value = SKILL_TARGETING.includes(skill.targeting) ? skill.targeting : 'enemy';
    els.skillIconInput.value = skill.icon || '';
    els.skillLevelReqInput.value = skill.levelReq ?? 1;
    els.skillManaCostInput.value = skill.manaCost ?? 0;
    els.skillCooldownInput.value = skill.cooldown != null ? skill.cooldown : '';
    els.skillRangeInput.value = skill.range != null ? skill.range : '';
    // Classes
    const classes = Array.isArray(skill.classes) ? skill.classes : [];
    document.querySelectorAll('.skill-class-cb').forEach(cb => { cb.checked = classes.includes(cb.value); });
    const extra = classes.filter(c => !KNOWN_CLASSES.includes(c));
    els.skillClassesExtraInput.value = extra.join(', ');
    // FX
    els.skillParticleInput.value = skill.particle || '';
    els.skillHitParticleInput.value = skill.hitParticle || '';
    els.skillSfxInput.value = skill.sfx || '';
    els.skillCastSfxInput.value = skill.castSfx || '';
    els.skillProjectileSpeedInput.value = skill.projectileSpeed != null ? skill.projectileSpeed : '';
    els.skillRequiresWeaponInput.checked = !!skill.requiresWeapon;
    els.skillRequiresShieldInput.checked = !!skill.requiresShield;
    els.skillRequiresWeaponTypeInput.value = Array.isArray(skill.requiresWeaponType) ? skill.requiresWeaponType.join(', ') : '';
    // Type-specific
    els.skillDamageInput.value = skill.damage ?? '';
    els.skillDamagePerLevelInput.value = skill.damagePerLevel != null ? skill.damagePerLevel : '';
    els.skillDamageTypeInput.value = skill.damageType || 'physical';
    els.skillAoeRadiusInput.value = skill.aoeRadius != null ? skill.aoeRadius : '';
    els.skillHitsInput.value = skill.hits != null ? skill.hits : '';
    els.skillHitIntervalInput.value = skill.hitInterval != null ? skill.hitInterval : '';
    els.skillChanneledInput.checked = !!skill.channeled;
    els.skillHealAmountInput.value = skill.healAmount ?? '';
    els.skillHealPerLevelInput.value = skill.healPerLevel != null ? skill.healPerLevel : '';
    els.skillHealTicksInput.value = skill.healTicks != null ? skill.healTicks : '';
    els.skillHealIntervalInput.value = skill.healInterval != null ? skill.healInterval : '';
    els.skillHealChanneledInput.checked = !!skill.channeled;
    updateSkillTypeVisibility(els.skillTypeInput.value);
    // Icon preview
    const iconKey = (skill.icon || '').trim();
    els.skillIconPathLabel.textContent = getSkillIconDisplayPath(iconKey || '…');
    els.skillJsonPreview.textContent = JSON.stringify({ [state.selectedSkillKey]: skill }, null, 2);
    if (iconKey) { setSkillIconStatus(null); els.skillIconPreviewImage.src = getSkillIconUrl(iconKey); }
    else { setSkillIconStatus(false); }
  }

  function syncSelectedSkillFromForm() {
    const current = getSelectedSkillEntry(); if (!current) return;
    const built = buildCurrentSkillObject();
    const newKey = built.id || state.selectedSkillKey;
    if (newKey !== state.selectedSkillKey && !state.skills[newKey]) {
      const newSkills = {};
      Object.keys(state.skills).forEach(k => { newSkills[k === state.selectedSkillKey ? newKey : k] = state.skills[k]; });
      state.skills = newSkills; state.selectedSkillKey = newKey;
    }
    state.skills[state.selectedSkillKey] = built;
    setSkillDirty(true);
    renderSkillList();
    els.skillJsonPreview.textContent = JSON.stringify({ [state.selectedSkillKey]: built }, null, 2);
  }

  function renderSkillList() {
    const visibleKeys = getVisibleSkillKeys();
    const allKeys = Object.keys(state.skills);
    els.skillEntryCount.textContent = String(allKeys.length);
    els.skillTypeCount.textContent = String(new Set(allKeys.map(k => state.skills[k]?.type).filter(Boolean)).size);
    els.skillList.innerHTML = '';
    if (!visibleKeys.length) { const empty=document.createElement('div'); empty.className='subtle'; empty.textContent='No matching skills.'; els.skillList.appendChild(empty); return; }
    for (const key of visibleKeys) {
      const skill = state.skills[key] || {};
      const color = SKILL_TYPE_COLOR[skill.type] || '#888';
      const button = document.createElement('button');
      button.className = 'tile-list-item' + (key === state.selectedSkillKey ? ' active' : '');
      button.type = 'button';
      button.innerHTML = `<span class="swatch" style="background:${color}"></span><span class="tile-text"><strong class="tile-name">${skill.name || key}</strong><span class="tile-meta">${key} • ${skill.type||'?'} • lvl ${skill.levelReq??'?'} • ${(skill.classes||[]).join(', ')||'no class'}</span></span>`;
      button.addEventListener('click', () => { state.selectedSkillKey = key; renderSkillPanel(); renderSkillList(); });
      els.skillList.appendChild(button);
    }
  }

  function renderSkillDiagnostics(items=[], summary='No validation run yet') {
    els.skillValidationSummary.textContent = summary; els.skillDiagnosticsList.innerHTML = '';
    if (!items.length) { els.skillDiagnosticsList.className='diagnostics-list empty-diagnostics'; els.skillDiagnosticsList.innerHTML='<p>No messages yet.</p>'; return; }
    els.skillDiagnosticsList.className='diagnostics-list';
    for (const item of items) { const div=document.createElement('div'); div.className=`diagnostic-item ${item.level||'info'}`; div.innerHTML=`<strong>${item.title}</strong><div>${item.message}</div>`; els.skillDiagnosticsList.appendChild(div); }
  }

  function renderSkills() { renderSkillList(); renderSkillPanel(); }

  async function loadSkills() {
    const result = await apiFetch('/api/skills');
    state.skills = result.skills || {};
    const keys = Object.keys(state.skills);
    state.selectedSkillKey = keys.includes(state.selectedSkillKey) ? state.selectedSkillKey : (keys[0] || null);
    setSkillDirty(false); renderSkills(); renderSkillDiagnostics([{level:'info', title:'Skills loaded', message:result.path}], `Loaded ${keys.length} entries from disk`);
  }

  async function saveSkills() {
    const result = await apiFetch('/api/skills', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({skills: state.skills}) });
    setSkillDirty(false); renderSkillDiagnostics([{level:'info', title:'Saved successfully', message:result.path}], `Saved ${Object.keys(state.skills).length} entries to disk`);
  }

  function validateSkills() {
    const messages=[]; const entries=Object.entries(state.skills);
    if (!entries.length) messages.push({level:'warning', title:'No skills', message:'skills.json is empty.'});
    for (const [key, skill] of entries) {
      if (!key.trim()) { messages.push({level:'error', title:'Blank key', message:'A skill has an empty id.'}); continue; }
      if ((skill.id||'') !== key) messages.push({level:'warning', title:`Key/id mismatch: ${key}`, message:`Object key is "${key}" but id is "${skill.id||''}".`});
      ['name','description','icon'].forEach(f => { if (!skill[f]||!String(skill[f]).trim()) messages.push({level:'warning', title:`Missing ${f}: ${key}`, message:`${f} should be a non-empty string.`}); });
      if (!SKILL_TYPES.includes(skill.type)) messages.push({level:'error', title:`Invalid type: ${key}`, message:`type must be one of ${SKILL_TYPES.join(', ')}.`});
      if (!SKILL_TARGETING.includes(skill.targeting)) messages.push({level:'error', title:`Invalid targeting: ${key}`, message:`targeting must be one of ${SKILL_TARGETING.join(', ')}.`});
      if (typeof skill.manaCost !== 'number') messages.push({level:'error', title:`manaCost: ${key}`, message:'manaCost must be a number.'});
      if (typeof skill.levelReq !== 'number') messages.push({level:'error', title:`levelReq: ${key}`, message:'levelReq must be a number.'});
      if (!Array.isArray(skill.classes)||!skill.classes.length) messages.push({level:'warning', title:`No classes: ${key}`, message:'classes should be a non-empty array.'});
      if ((skill.type==='attack'||skill.type==='debuff') && typeof skill.damage !== 'number') messages.push({level:'error', title:`damage: ${key}`, message:'attack/debuff skills must have a numeric damage field.'});
      if (skill.type==='heal' && typeof skill.healAmount !== 'number') messages.push({level:'error', title:`healAmount: ${key}`, message:'heal skills must have a numeric healAmount field.'});
    }
    if (!messages.length) messages.push({level:'info', title:'Validation passed', message:'No schema problems detected in skills.json.'});
    const errorCount=messages.filter(m=>m.level==='error').length; const warnCount=messages.filter(m=>m.level==='warning').length;
    renderSkillDiagnostics(messages, errorCount||warnCount ? `${errorCount} error(s), ${warnCount} warning(s)` : 'Validation passed');
  }

  function addSkill() { const key=ensureUniqueSkillKey('newSkill'); state.skills[key]=JSON.parse(JSON.stringify(DEFAULT_NEW_SKILL)); state.skills[key].id=key; state.selectedSkillKey=key; setSkillDirty(true); renderSkills(); }
  function duplicateSkill() { const s=getSelectedSkillEntry(); if(!s) return; const key=ensureUniqueSkillKey(`${state.selectedSkillKey}_copy`); const clone=JSON.parse(JSON.stringify(s)); clone.id=key; state.skills[key]=clone; state.selectedSkillKey=key; setSkillDirty(true); renderSkills(); }
  function deleteSkill() { if(!getSelectedSkillEntry()) return; if(!window.confirm(`Delete skill "${state.selectedSkillKey}"?`)) return; delete state.skills[state.selectedSkillKey]; state.selectedSkillKey=Object.keys(state.skills)[0]||null; setSkillDirty(true); renderSkills(); }

  // Status Effects
  const DEFAULT_NEW_STATUS_EFFECT = { name:'New Effect', description:'', type:'buff', icon:'' };

  function getVisibleStatusEffectKeys() {
    const q = state.statusEffectSearch.toLowerCase();
    return Object.keys(state.statusEffects).filter(k => {
      const se = state.statusEffects[k] || {};
      return !q || k.toLowerCase().includes(q) || String(se.name||'').toLowerCase().includes(q) || String(se.type||'').toLowerCase().includes(q);
    }).sort((a,b)=>a.localeCompare(b));
  }
  function getSelectedStatusEffectEntry() { return state.selectedStatusEffectKey ? state.statusEffects[state.selectedStatusEffectKey] || null : null; }
  function ensureUniqueStatusEffectKey(baseKey){ let c=baseKey, i=2; while(state.statusEffects[c]) c=`${baseKey}_${i++}`; return c; }

  function renderStatusEffectList() {
    const visibleKeys = getVisibleStatusEffectKeys();
    const allKeys = Object.keys(state.statusEffects);
    els.statusEffectEntryCount.textContent = String(allKeys.length);
    els.statusEffectBuffCount.textContent = String(allKeys.filter(k => state.statusEffects[k]?.type === 'buff').length);
    els.statusEffectList.innerHTML = '';
    if (!visibleKeys.length) { const empty=document.createElement('div'); empty.className='subtle'; empty.textContent='No matching effects.'; els.statusEffectList.appendChild(empty); return; }
    for (const key of visibleKeys) {
      const se = state.statusEffects[key] || {};
      const color = se.type === 'buff' ? '#3fb06a' : '#d06060';
      const button = document.createElement('button');
      button.className = 'tile-list-item' + (key === state.selectedStatusEffectKey ? ' active' : '');
      button.type = 'button';
      button.innerHTML = `<span class="swatch" style="background:${color}"></span><span class="tile-text"><strong class="tile-name">${se.name || key}</strong><span class="tile-meta">${key} • ${se.type || '?'}</span></span>`;
      button.addEventListener('click', () => { state.selectedStatusEffectKey = key; renderStatusEffectPanel(); renderStatusEffectList(); });
      els.statusEffectList.appendChild(button);
    }
  }

  function renderStatusEffectPanel() {
    const se = getSelectedStatusEffectEntry();
    if (!se) {
      els.selectedStatusEffectLabel.textContent = 'Nothing selected';
      els.statusEffectEmptyState.classList.remove('hidden');
      els.statusEffectForm.classList.add('hidden');
      els.statusEffectJsonPreview.textContent = '';
      return;
    }
    els.selectedStatusEffectLabel.textContent = state.selectedStatusEffectKey;
    els.statusEffectEmptyState.classList.add('hidden');
    els.statusEffectForm.classList.remove('hidden');
    els.statusEffectIdInput.value = state.selectedStatusEffectKey;
    els.statusEffectNameInput.value = se.name || '';
    els.statusEffectDescriptionInput.value = se.description || '';
    els.statusEffectTypeInput.value = se.type || 'buff';
    els.statusEffectIconInput.value = se.icon || '';
    // Icon preview
    const iconPath = (se.icon || '').trim();
    els.statusEffectIconPathLabel.textContent = iconPath || 'assets/sprites/status/…';
    els.statusEffectJsonPreview.textContent = JSON.stringify({ [state.selectedStatusEffectKey]: se }, null, 2);
    if (iconPath) { setStatusEffectIconStatus(null); els.statusEffectIconPreviewImage.src = getStatusEffectIconUrl(iconPath); }
    else { setStatusEffectIconStatus(false); }
  }

  function syncSelectedStatusEffectFromForm() {
    const current = getSelectedStatusEffectEntry(); if (!current) return;
    const newKey = (els.statusEffectIdInput.value || '').trim() || state.selectedStatusEffectKey;
    if (newKey !== state.selectedStatusEffectKey && !state.statusEffects[newKey]) {
      const newMap = {};
      Object.keys(state.statusEffects).forEach(k => { newMap[k === state.selectedStatusEffectKey ? newKey : k] = state.statusEffects[k]; });
      state.statusEffects = newMap; state.selectedStatusEffectKey = newKey;
    }
    state.statusEffects[state.selectedStatusEffectKey] = {
      name: els.statusEffectNameInput.value || '',
      description: els.statusEffectDescriptionInput.value || '',
      type: els.statusEffectTypeInput.value || 'buff',
      icon: els.statusEffectIconInput.value || '',
    };
    setStatusEffectDirty(true);
    renderStatusEffectList();
    els.statusEffectJsonPreview.textContent = JSON.stringify({ [state.selectedStatusEffectKey]: state.statusEffects[state.selectedStatusEffectKey] }, null, 2);
  }

  function renderStatusEffectDiagnostics(items=[], summary='No validation run yet') {
    els.statusEffectValidationSummary.textContent = summary; els.statusEffectDiagnosticsList.innerHTML = '';
    if (!items.length) { els.statusEffectDiagnosticsList.className='diagnostics-list empty-diagnostics'; els.statusEffectDiagnosticsList.innerHTML='<p>No messages yet.</p>'; return; }
    els.statusEffectDiagnosticsList.className='diagnostics-list';
    for (const item of items) { const div=document.createElement('div'); div.className=`diagnostic-item ${item.level||'info'}`; div.innerHTML=`<strong>${item.title}</strong><div>${item.message}</div>`; els.statusEffectDiagnosticsList.appendChild(div); }
  }

  function renderStatusEffects() { renderStatusEffectList(); renderStatusEffectPanel(); }

  async function loadStatusEffects() {
    const result = await apiFetch('/api/status-effects');
    state.statusEffects = result.statusEffects || {};
    const keys = Object.keys(state.statusEffects);
    state.selectedStatusEffectKey = keys.includes(state.selectedStatusEffectKey) ? state.selectedStatusEffectKey : (keys[0] || null);
    setStatusEffectDirty(false); renderStatusEffects(); renderStatusEffectDiagnostics([{level:'info', title:'Status effects loaded', message:result.path}], `Loaded ${keys.length} entries from disk`);
  }

  async function saveStatusEffects() {
    const result = await apiFetch('/api/status-effects', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({statusEffects: state.statusEffects}) });
    setStatusEffectDirty(false); renderStatusEffectDiagnostics([{level:'info', title:'Saved successfully', message:result.path}], `Saved ${Object.keys(state.statusEffects).length} entries to disk`);
  }

  function validateStatusEffects() {
    const messages=[]; const entries=Object.entries(state.statusEffects);
    if (!entries.length) messages.push({level:'warning', title:'No entries', message:'statusEffects.json is empty.'});
    for (const [key, se] of entries) {
      if (!key.trim()) { messages.push({level:'error', title:'Blank key', message:'A status effect has an empty id.'}); continue; }
      if (!se.name || !String(se.name).trim()) messages.push({level:'warning', title:`Missing name: ${key}`, message:'name should be a non-empty string.'});
      if (!['buff','debuff'].includes(se.type)) messages.push({level:'error', title:`Invalid type: ${key}`, message:`type must be "buff" or "debuff", got "${se.type}".`});
      if (!se.icon) messages.push({level:'warning', title:`Missing icon: ${key}`, message:'icon path should be set (e.g. assets/sprites/status/stunned.png).'});
      // Check that a matching skill buff/debuff id exists
      const referencedBySkill = Object.values(state.skills).some(skill =>
        (skill.buff && skill.buff.id === key) || (skill.debuff && skill.debuff.id === key)
      );
      if (!referencedBySkill) messages.push({level:'info', title:`Unreferenced: ${key}`, message:'No skill buff/debuff references this id. May be intentional.'});
    }
    if (!messages.length) messages.push({level:'info', title:'Validation passed', message:'No schema problems detected in statusEffects.json.'});
    const errorCount=messages.filter(m=>m.level==='error').length; const warnCount=messages.filter(m=>m.level==='warning').length;
    renderStatusEffectDiagnostics(messages, errorCount||warnCount ? `${errorCount} error(s), ${warnCount} warning(s)` : 'Validation passed');
  }

  function addStatusEffect() { const key=ensureUniqueStatusEffectKey('newEffect'); state.statusEffects[key]=JSON.parse(JSON.stringify(DEFAULT_NEW_STATUS_EFFECT)); state.selectedStatusEffectKey=key; setStatusEffectDirty(true); renderStatusEffects(); }
  function duplicateStatusEffect() { const se=getSelectedStatusEffectEntry(); if(!se) return; const key=ensureUniqueStatusEffectKey(`${state.selectedStatusEffectKey}_copy`); state.statusEffects[key]=JSON.parse(JSON.stringify(se)); state.selectedStatusEffectKey=key; setStatusEffectDirty(true); renderStatusEffects(); }
  function deleteStatusEffect() { if(!getSelectedStatusEffectEntry()) return; if(!window.confirm(`Delete status effect "${state.selectedStatusEffectKey}"?`)) return; delete state.statusEffects[state.selectedStatusEffectKey]; state.selectedStatusEffectKey=Object.keys(state.statusEffects)[0]||null; setStatusEffectDirty(true); renderStatusEffects(); }

  // Gathering Skills
  const GATHERING_TOOL_TYPES = ['pickaxe','hatchet','fishing_rod'];
  const DEFAULT_NEW_GATHERING_SKILL = { id:'newSkill', name:'New Skill', description:'', icon:'', toolType:'pickaxe' };

  function getVisibleGatheringSkillKeys() { const q=state.gatheringSkillSearch.toLowerCase(); return Object.keys(state.gatheringSkills).filter(k=>!q||k.toLowerCase().includes(q)||String(state.gatheringSkills[k]?.name||'').toLowerCase().includes(q)).sort((a,b)=>a.localeCompare(b)); }
  function getSelectedGatheringSkillEntry() { return state.selectedGatheringSkillKey ? state.gatheringSkills[state.selectedGatheringSkillKey]||null : null; }
  function ensureUniqueGatheringSkillKey(base){ let c=base,i=2; while(state.gatheringSkills[c]) c=`${base}_${i++}`; return c; }

  function renderGatheringSkillList() {
    const visibleKeys = getVisibleGatheringSkillKeys();
    const allKeys = Object.keys(state.gatheringSkills);
    els.gatheringSkillEntryCount.textContent = String(allKeys.length);
    els.gatheringSkillToolCount.textContent = String(new Set(allKeys.map(k=>state.gatheringSkills[k]?.toolType).filter(Boolean)).size);
    els.gatheringSkillList.innerHTML = '';
    if (!visibleKeys.length) { const e=document.createElement('div'); e.className='subtle'; e.textContent='No matching skills.'; els.gatheringSkillList.appendChild(e); return; }
    const COLORS = { pickaxe:'#c8983a', hatchet:'#3fb06a', fishing_rod:'#5a9cf5', processing:'#c87060' };
    for (const key of visibleKeys) {
      const gs = state.gatheringSkills[key]||{};
      const color = gs.category === 'processing' ? COLORS.processing : (COLORS[gs.toolType]||'#888');
      const btn = document.createElement('button');
      btn.className = 'tile-list-item'+(key===state.selectedGatheringSkillKey?' active':'');
      btn.type='button';
      btn.innerHTML=`<span class="swatch" style="background:${color}"></span><span class="tile-text"><strong class="tile-name">${gs.name||key}</strong><span class="tile-meta">${key} • ${gs.toolType||'?'}</span></span>`;
      btn.addEventListener('click',()=>{ state.selectedGatheringSkillKey=key; renderGatheringSkillPanel(); renderGatheringSkillList(); });
      els.gatheringSkillList.appendChild(btn);
    }
  }
  function renderGatheringSkillPanel() {
    const gs = getSelectedGatheringSkillEntry();
    if (!gs) { els.selectedGatheringSkillLabel.textContent='Nothing selected'; els.gatheringSkillEmptyState.classList.remove('hidden'); els.gatheringSkillForm.classList.add('hidden'); els.gatheringSkillJsonPreview.textContent=''; return; }
    els.selectedGatheringSkillLabel.textContent = state.selectedGatheringSkillKey;
    els.gatheringSkillEmptyState.classList.add('hidden'); els.gatheringSkillForm.classList.remove('hidden');
    els.gatheringSkillIdInput.value = gs.id||state.selectedGatheringSkillKey;
    els.gatheringSkillNameInput.value = gs.name||'';
    els.gatheringSkillDescriptionInput.value = gs.description||'';
    els.gatheringSkillIconInput.value = gs.icon||'';
    els.gatheringSkillToolTypeInput.value = gs.toolType||'';
    els.gatheringSkillCategoryInput.value = gs.category||'';
    els.gatheringSkillJsonPreview.textContent = JSON.stringify({[state.selectedGatheringSkillKey]:gs},null,2);
  }
  function syncSelectedGatheringSkillFromForm() {
    const current = getSelectedGatheringSkillEntry(); if(!current) return;
    const newKey = (els.gatheringSkillIdInput.value||'').trim()||state.selectedGatheringSkillKey;
    if (newKey!==state.selectedGatheringSkillKey&&!state.gatheringSkills[newKey]) { const m={}; Object.keys(state.gatheringSkills).forEach(k=>{ m[k===state.selectedGatheringSkillKey?newKey:k]=state.gatheringSkills[k]; }); state.gatheringSkills=m; state.selectedGatheringSkillKey=newKey; }
    state.gatheringSkills[state.selectedGatheringSkillKey] = { id:state.selectedGatheringSkillKey, name:els.gatheringSkillNameInput.value||'', description:els.gatheringSkillDescriptionInput.value||'', icon:(els.gatheringSkillIconInput.value||'').trim() };
    const toolTypeVal = (els.gatheringSkillToolTypeInput.value||'').trim();
    const catVal = (els.gatheringSkillCategoryInput.value||'').trim();
    if (toolTypeVal) state.gatheringSkills[state.selectedGatheringSkillKey].toolType = toolTypeVal;
    if (catVal) state.gatheringSkills[state.selectedGatheringSkillKey].category = catVal;
    setGatheringSkillDirty(true); renderGatheringSkillList(); els.gatheringSkillJsonPreview.textContent = JSON.stringify({[state.selectedGatheringSkillKey]:state.gatheringSkills[state.selectedGatheringSkillKey]},null,2);
  }
  function renderGatheringSkillDiagnostics(items=[],summary='No validation run yet') { els.gatheringSkillValidationSummary.textContent=summary; els.gatheringSkillDiagnosticsList.innerHTML=''; if(!items.length){els.gatheringSkillDiagnosticsList.className='diagnostics-list empty-diagnostics';els.gatheringSkillDiagnosticsList.innerHTML='<p>No messages yet.</p>';return;} els.gatheringSkillDiagnosticsList.className='diagnostics-list'; for(const item of items){const d=document.createElement('div');d.className=`diagnostic-item ${item.level||'info'}`;d.innerHTML=`<strong>${item.title}</strong><div>${item.message}</div>`;els.gatheringSkillDiagnosticsList.appendChild(d);} }
  function renderGatheringSkills() { renderGatheringSkillList(); renderGatheringSkillPanel(); }
  async function loadGatheringSkills() { const r=await apiFetch('/api/gathering-skills'); state.gatheringSkills=r.gatheringSkills||{}; const keys=Object.keys(state.gatheringSkills); state.selectedGatheringSkillKey=keys.includes(state.selectedGatheringSkillKey)?state.selectedGatheringSkillKey:(keys[0]||null); setGatheringSkillDirty(false); renderGatheringSkills(); renderGatheringSkillDiagnostics([{level:'info',title:'Loaded',message:r.path}],`Loaded ${keys.length} entries`); }
  async function saveGatheringSkills() { const r=await apiFetch('/api/gathering-skills',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gatheringSkills:state.gatheringSkills})}); setGatheringSkillDirty(false); renderGatheringSkillDiagnostics([{level:'info',title:'Saved',message:r.path}],`Saved ${Object.keys(state.gatheringSkills).length} entries`); }
  function validateGatheringSkills() {
    const messages=[]; const entries=Object.entries(state.gatheringSkills);
    if(!entries.length) messages.push({level:'warning',title:'Empty',message:'No gathering skills defined.'});
    for(const [key,gs] of entries) {
      if((gs.id||'')!==key) messages.push({level:'warning',title:`Key/id mismatch: ${key}`,message:`id should match the object key.`});
      if(!gs.name) messages.push({level:'warning',title:`Missing name: ${key}`,message:'name should be a non-empty string.'});
      if(!gs.toolType) messages.push({level:'error',title:`Missing toolType: ${key}`,message:'toolType is required.'});
    }
    if(!messages.length) messages.push({level:'info',title:'Validation passed',message:'No schema problems.'});
    const ec=messages.filter(m=>m.level==='error').length; const wc=messages.filter(m=>m.level==='warning').length;
    renderGatheringSkillDiagnostics(messages,ec||wc?`${ec} error(s), ${wc} warning(s)`:'Validation passed');
  }
  function addGatheringSkill() { const k=ensureUniqueGatheringSkillKey('newSkill'); state.gatheringSkills[k]=JSON.parse(JSON.stringify(DEFAULT_NEW_GATHERING_SKILL)); state.gatheringSkills[k].id=k; state.selectedGatheringSkillKey=k; setGatheringSkillDirty(true); renderGatheringSkills(); }
  function duplicateGatheringSkill() { const gs=getSelectedGatheringSkillEntry(); if(!gs) return; const k=ensureUniqueGatheringSkillKey(`${state.selectedGatheringSkillKey}_copy`); const clone=JSON.parse(JSON.stringify(gs)); clone.id=k; state.gatheringSkills[k]=clone; state.selectedGatheringSkillKey=k; setGatheringSkillDirty(true); renderGatheringSkills(); }
  function deleteGatheringSkill() { if(!getSelectedGatheringSkillEntry()) return; if(!window.confirm(`Delete "${state.selectedGatheringSkillKey}"?`)) return; delete state.gatheringSkills[state.selectedGatheringSkillKey]; state.selectedGatheringSkillKey=Object.keys(state.gatheringSkills)[0]||null; setGatheringSkillDirty(true); renderGatheringSkills(); }

  // Resource Nodes
  const RESOURCE_NODE_SKILLS = ['mining','logging','fishing'];
  const RESOURCE_NODE_TOOL_TYPES = ['pickaxe','hatchet','fishing_rod'];
  const DEFAULT_NEW_RESOURCE_NODE = { name:'New Node', skill:'mining', requiredLevel:1, requiredToolType:'pickaxe', requiredToolTier:1, xpPerGather:10, gatherItem:'', maxHarvests:3, respawnTicks:1800, color:[128,128,128] };
  const SKILL_COLORS_RN = { mining:'#c8983a', logging:'#3fb06a', fishing:'#5a9cf5' };

  function getResourceNodeSpriteUrl(id) { return `/api/gathering-sprite/${encodeURIComponent(id)}?v=${Date.now()}`; }
  function getResourceNodeSpriteDisplayPath(id) { return `public/assets/sprites/gathering/${id}.png`; }

  function setResourceNodeSpriteStatus(exists) {
    state.resourceNodeSpriteExists=exists;
    if(exists===true){els.resourceNodeSpriteStatusBadge.textContent='Sprite found';els.resourceNodeSpriteStatusBadge.className='badge online';els.resourceNodeSpriteImage.classList.remove('hidden');els.resourceNodeSpriteFallback.classList.add('hidden');}
    else if(exists===false){els.resourceNodeSpriteStatusBadge.textContent='Using fallback';els.resourceNodeSpriteStatusBadge.className='badge unsaved';els.resourceNodeSpriteImage.classList.add('hidden');els.resourceNodeSpriteFallback.classList.remove('hidden');}
    else{els.resourceNodeSpriteStatusBadge.textContent='Checking';els.resourceNodeSpriteStatusBadge.className='badge muted';els.resourceNodeSpriteImage.classList.add('hidden');els.resourceNodeSpriteFallback.classList.remove('hidden');}
  }
  function getVisibleResourceNodeKeys() { const q=state.resourceNodeSearch.toLowerCase(); return Object.keys(state.resourceNodes).filter(k=>!q||k.toLowerCase().includes(q)||String(state.resourceNodes[k]?.name||'').toLowerCase().includes(q)||String(state.resourceNodes[k]?.skill||'').toLowerCase().includes(q)).sort((a,b)=>a.localeCompare(b)); }
  function getSelectedResourceNodeEntry() { return state.selectedResourceNodeKey ? state.resourceNodes[state.selectedResourceNodeKey]||null : null; }
  function ensureUniqueResourceNodeKey(base){ let c=base,i=2; while(state.resourceNodes[c]) c=`${base}_${i++}`; return c; }

  function buildCurrentResourceNodeObject() {
    const color = [clampByte(els.resourceNodeRInput.value),clampByte(els.resourceNodeGInput.value),clampByte(els.resourceNodeBInput.value)];
    return { name:els.resourceNodeNameInput.value||'', skill:els.resourceNodeSkillInput.value||'mining', requiredLevel:Number(els.resourceNodeRequiredLevelInput.value||1), requiredToolType:els.resourceNodeToolTypeInput.value||'pickaxe', requiredToolTier:Number(els.resourceNodeToolTierInput.value||1), xpPerGather:Number(els.resourceNodeXpInput.value||0), gatherItem:(els.resourceNodeGatherItemInput.value||'').trim(), maxHarvests:Number(els.resourceNodeMaxHarvestsInput.value||1), respawnTicks:Number(els.resourceNodeRespawnTicksInput.value||1800), color };
  }
  function renderResourceNodeList() {
    const visibleKeys = getVisibleResourceNodeKeys();
    const allKeys = Object.keys(state.resourceNodes);
    els.resourceNodeEntryCount.textContent = String(allKeys.length);
    els.resourceNodeSkillCount.textContent = String(new Set(allKeys.map(k=>state.resourceNodes[k]?.skill).filter(Boolean)).size);
    els.resourceNodeList.innerHTML = '';
    if(!visibleKeys.length){const e=document.createElement('div');e.className='subtle';e.textContent='No matching nodes.';els.resourceNodeList.appendChild(e);return;}
    for(const key of visibleKeys){
      const rn=state.resourceNodes[key]||{};
      const color=Array.isArray(rn.color)?rgbToHex(rn.color):(SKILL_COLORS_RN[rn.skill]||'#888');
      const btn=document.createElement('button');
      btn.className='tile-list-item'+(key===state.selectedResourceNodeKey?' active':'');
      btn.type='button';
      btn.innerHTML=`<span class="swatch" style="background:${color}"></span><span class="tile-text"><strong class="tile-name">${rn.name||key}</strong><span class="tile-meta">${key} • ${rn.skill||'?'} • lvl ${rn.requiredLevel??'?'}</span></span>`;
      btn.addEventListener('click',()=>{state.selectedResourceNodeKey=key;renderResourceNodePanel();renderResourceNodeList();});
      els.resourceNodeList.appendChild(btn);
    }
  }
  function renderResourceNodePanel() {
    const rn=getSelectedResourceNodeEntry();
    if(!rn){els.selectedResourceNodeLabel.textContent='Nothing selected';els.resourceNodeEmptyState.classList.remove('hidden');els.resourceNodeForm.classList.add('hidden');els.resourceNodeJsonPreview.textContent='';return;}
    els.selectedResourceNodeLabel.textContent=state.selectedResourceNodeKey;
    els.resourceNodeEmptyState.classList.add('hidden');els.resourceNodeForm.classList.remove('hidden');
    els.resourceNodeIdInput.value=state.selectedResourceNodeKey;
    els.resourceNodeNameInput.value=rn.name||'';
    els.resourceNodeSkillInput.value=RESOURCE_NODE_SKILLS.includes(rn.skill)?rn.skill:'mining';
    els.resourceNodeToolTypeInput.value=RESOURCE_NODE_TOOL_TYPES.includes(rn.requiredToolType)?rn.requiredToolType:'pickaxe';
    els.resourceNodeToolTierInput.value=String(rn.requiredToolTier||1);
    els.resourceNodeRequiredLevelInput.value=rn.requiredLevel??1;
    els.resourceNodeXpInput.value=rn.xpPerGather??0;
    els.resourceNodeMaxHarvestsInput.value=rn.maxHarvests??3;
    els.resourceNodeRespawnTicksInput.value=rn.respawnTicks??1800;
    els.resourceNodeGatherItemInput.value=rn.gatherItem||'';
    const color=Array.isArray(rn.color)?rn.color.map(clampByte):[128,128,128];
    const hex=rgbToHex(color);
    els.resourceNodeColorPicker.value=hex;
    els.resourceNodeRInput.value=String(color[0]);els.resourceNodeGInput.value=String(color[1]);els.resourceNodeBInput.value=String(color[2]);
    els.resourceNodeColorPreview.style.background=hex;
    els.resourceNodeSpritePathLabel.textContent=getResourceNodeSpriteDisplayPath(state.selectedResourceNodeKey);
    els.resourceNodeJsonPreview.textContent=JSON.stringify({[state.selectedResourceNodeKey]:rn},null,2);
    setResourceNodeSpriteStatus(null);
    els.resourceNodeSpriteImage.src=getResourceNodeSpriteUrl(state.selectedResourceNodeKey);
  }
  function syncSelectedResourceNodeFromForm() {
    const current=getSelectedResourceNodeEntry();if(!current)return;
    const newKey=(els.resourceNodeIdInput.value||'').trim()||state.selectedResourceNodeKey;
    if(newKey!==state.selectedResourceNodeKey&&!state.resourceNodes[newKey]){const m={};Object.keys(state.resourceNodes).forEach(k=>{m[k===state.selectedResourceNodeKey?newKey:k]=state.resourceNodes[k];});state.resourceNodes=m;state.selectedResourceNodeKey=newKey;}
    state.resourceNodes[state.selectedResourceNodeKey]=buildCurrentResourceNodeObject();
    setResourceNodeDirty(true);renderResourceNodeList();
    const rn=state.resourceNodes[state.selectedResourceNodeKey];
    const color=Array.isArray(rn.color)?rn.color:[128,128,128];
    els.resourceNodeColorPreview.style.background=rgbToHex(color);
    els.resourceNodeJsonPreview.textContent=JSON.stringify({[state.selectedResourceNodeKey]:rn},null,2);
  }
  function updateResourceNodeColor(rgb){const rn=getSelectedResourceNodeEntry();if(!rn)return;rn.color=rgb.map(clampByte);setResourceNodeDirty(true);renderResourceNodeList();renderResourceNodePanel();}
  function renderResourceNodeDiagnostics(items=[],summary='No validation run yet'){els.resourceNodeValidationSummary.textContent=summary;els.resourceNodeDiagnosticsList.innerHTML='';if(!items.length){els.resourceNodeDiagnosticsList.className='diagnostics-list empty-diagnostics';els.resourceNodeDiagnosticsList.innerHTML='<p>No messages yet.</p>';return;}els.resourceNodeDiagnosticsList.className='diagnostics-list';for(const item of items){const d=document.createElement('div');d.className=`diagnostic-item ${item.level||'info'}`;d.innerHTML=`<strong>${item.title}</strong><div>${item.message}</div>`;els.resourceNodeDiagnosticsList.appendChild(d);}}
  function renderResourceNodes(){renderResourceNodeList();renderResourceNodePanel();}
  async function loadResourceNodes(){const r=await apiFetch('/api/resource-nodes');state.resourceNodes=r.resourceNodes||{};const keys=Object.keys(state.resourceNodes);state.selectedResourceNodeKey=keys.includes(state.selectedResourceNodeKey)?state.selectedResourceNodeKey:(keys[0]||null);setResourceNodeDirty(false);renderResourceNodes();renderResourceNodeDiagnostics([{level:'info',title:'Loaded',message:r.path}],`Loaded ${keys.length} entries`);}
  async function saveResourceNodes(){const r=await apiFetch('/api/resource-nodes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resourceNodes:state.resourceNodes})});setResourceNodeDirty(false);renderResourceNodeDiagnostics([{level:'info',title:'Saved',message:r.path}],`Saved ${Object.keys(state.resourceNodes).length} entries`);}
  function validateResourceNodes(){
    const messages=[]; const entries=Object.entries(state.resourceNodes); const itemIds=new Set(Object.keys(state.items));
    if(!entries.length) messages.push({level:'warning',title:'Empty',message:'No resource nodes defined.'});
    for(const [key,rn] of entries){
      if(!rn.name) messages.push({level:'warning',title:`Missing name: ${key}`,message:'name should be a non-empty string.'});
      if(!RESOURCE_NODE_SKILLS.includes(rn.skill)) messages.push({level:'error',title:`Invalid skill: ${key}`,message:`skill must be one of ${RESOURCE_NODE_SKILLS.join(', ')}.`});
      if(!RESOURCE_NODE_TOOL_TYPES.includes(rn.requiredToolType)) messages.push({level:'warning',title:`Unusual toolType: ${key}`,message:`requiredToolType "${rn.requiredToolType}" is not a known tool type.`});
      if(typeof rn.requiredToolTier!=='number'||rn.requiredToolTier<1||rn.requiredToolTier>3) messages.push({level:'warning',title:`Tool tier: ${key}`,message:'requiredToolTier should be 1, 2, or 3.'});
      if(!rn.gatherItem) messages.push({level:'error',title:`Missing gatherItem: ${key}`,message:'gatherItem must reference an item id.'});
      else if(!itemIds.has(rn.gatherItem)) messages.push({level:'warning',title:`Unknown gatherItem: ${key}`,message:`"${rn.gatherItem}" not found in items.json.`});
      if(typeof rn.xpPerGather!=='number') messages.push({level:'error',title:`xpPerGather: ${key}`,message:'xpPerGather must be a number.'});
      if(!Array.isArray(rn.color)||rn.color.length!==3) messages.push({level:'error',title:`color: ${key}`,message:'color must be [r,g,b].'});
    }
    if(!messages.length) messages.push({level:'info',title:'Validation passed',message:'No schema problems.'});
    const ec=messages.filter(m=>m.level==='error').length; const wc=messages.filter(m=>m.level==='warning').length;
    renderResourceNodeDiagnostics(messages,ec||wc?`${ec} error(s), ${wc} warning(s)`:'Validation passed');
  }
  function addResourceNode(){const k=ensureUniqueResourceNodeKey('newNode');state.resourceNodes[k]=JSON.parse(JSON.stringify(DEFAULT_NEW_RESOURCE_NODE));state.selectedResourceNodeKey=k;setResourceNodeDirty(true);renderResourceNodes();}
  function duplicateResourceNode(){const rn=getSelectedResourceNodeEntry();if(!rn)return;const k=ensureUniqueResourceNodeKey(`${state.selectedResourceNodeKey}_copy`);state.resourceNodes[k]=JSON.parse(JSON.stringify(rn));state.selectedResourceNodeKey=k;setResourceNodeDirty(true);renderResourceNodes();}
  function deleteResourceNode(){if(!getSelectedResourceNodeEntry())return;if(!window.confirm(`Delete "${state.selectedResourceNodeKey}"?`))return;delete state.resourceNodes[state.selectedResourceNodeKey];state.selectedResourceNodeKey=Object.keys(state.resourceNodes)[0]||null;setResourceNodeDirty(true);renderResourceNodes();}

  // Recipes
  const RECIPE_SKILLS = ['smelting','milling','cooking'];
  const RECIPE_SKILL_COLOR = { smelting:'#d06060', milling:'#c8983a', cooking:'#3fb06a' };
  const DEFAULT_NEW_RECIPE = { id:'new_recipe', name:'New Recipe', skill:'smelting', requiredLevel:1, xp:10, input:{ 'material': 1 }, output:{ id:'result', qty:1 }, craftTime:2.0 };

  function getVisibleRecipeKeys() { const q=state.recipeSearch.toLowerCase(); return Object.keys(state.recipes).filter(k=>!q||k.toLowerCase().includes(q)||String(state.recipes[k]?.name||'').toLowerCase().includes(q)||String(state.recipes[k]?.skill||'').toLowerCase().includes(q)).sort((a,b)=>a.localeCompare(b)); }
  function getSelectedRecipeEntry() { return state.selectedRecipeKey ? state.recipes[state.selectedRecipeKey]||null : null; }
  function ensureUniqueRecipeKey(base){ let c=base,i=2; while(state.recipes[c]) c=`${base}_${i++}`; return c; }

  function buildCurrentRecipeObject() {
    const inputs = {};
    els.recipeInputEditor.querySelectorAll('.ingredient-row').forEach(row => {
      const itemId = (row.querySelector('.ing-id')?.value||'').trim();
      const qty = Number(row.querySelector('.ing-qty')?.value||1);
      if (itemId) inputs[itemId] = qty;
    });
    return { id:state.selectedRecipeKey, name:els.recipeNameInput.value||'', skill:els.recipeSkillInput.value||'smelting', requiredLevel:Number(els.recipeRequiredLevelInput.value||1), xp:Number(els.recipeXpInput.value||0), craftTime:Number(els.recipeCraftTimeInput.value||2), input:inputs, output:{ id:(els.recipeOutputIdInput.value||'').trim(), qty:Number(els.recipeOutputQtyInput.value||1) } };
  }

  function renderRecipeInputEditor(inputObj) {
    els.recipeInputEditor.innerHTML = '';
    const entries = Object.entries(inputObj||{});
    if (!entries.length) { els.recipeInputEmptyState.classList.remove('hidden'); return; }
    els.recipeInputEmptyState.classList.add('hidden');
    entries.forEach(([itemId, qty]) => {
      const row = document.createElement('div');
      row.className = 'linked-list-row ingredient-row';
      row.innerHTML = `<input class="ing-id mono" type="text" value="${itemId}" placeholder="itemId" style="flex:1" /><input class="ing-qty" type="number" min="1" value="${qty}" style="width:60px" /><button type="button" class="button danger small ing-remove" style="flex-shrink:0">✕</button>`;
      row.querySelector('.ing-id').addEventListener('input', syncSelectedRecipeFromForm);
      row.querySelector('.ing-qty').addEventListener('input', syncSelectedRecipeFromForm);
      row.querySelector('.ing-remove').addEventListener('click', () => { row.remove(); if (!els.recipeInputEditor.children.length) els.recipeInputEmptyState.classList.remove('hidden'); syncSelectedRecipeFromForm(); });
      els.recipeInputEditor.appendChild(row);
    });
  }

  function renderRecipeList() {
    const visibleKeys = getVisibleRecipeKeys();
    const allKeys = Object.keys(state.recipes);
    els.recipeEntryCount.textContent = String(allKeys.length);
    els.recipeSkillCount.textContent = String(new Set(allKeys.map(k=>state.recipes[k]?.skill).filter(Boolean)).size);
    els.recipeList.innerHTML = '';
    if (!visibleKeys.length) { const e=document.createElement('div'); e.className='subtle'; e.textContent='No matching recipes.'; els.recipeList.appendChild(e); return; }
    for (const key of visibleKeys) {
      const r = state.recipes[key]||{};
      const color = RECIPE_SKILL_COLOR[r.skill]||'#888';
      const inputSummary = Object.entries(r.input||{}).map(([id,qty])=>`${qty}×${id}`).join(', ');
      const btn = document.createElement('button');
      btn.className = 'tile-list-item'+(key===state.selectedRecipeKey?' active':'');
      btn.type = 'button';
      btn.innerHTML = `<span class="swatch" style="background:${color}"></span><span class="tile-text"><strong class="tile-name">${r.name||key}</strong><span class="tile-meta">${r.skill||'?'} • ${inputSummary} → ${r.output?.qty??'?'}×${r.output?.id||'?'}</span></span>`;
      btn.addEventListener('click', ()=>{ state.selectedRecipeKey=key; renderRecipePanel(); renderRecipeList(); });
      els.recipeList.appendChild(btn);
    }
  }

  function renderRecipePanel() {
    const r = getSelectedRecipeEntry();
    if (!r) { els.selectedRecipeLabel.textContent='Nothing selected'; els.recipeEmptyState.classList.remove('hidden'); els.recipeForm.classList.add('hidden'); els.recipeJsonPreview.textContent=''; return; }
    els.selectedRecipeLabel.textContent = state.selectedRecipeKey;
    els.recipeEmptyState.classList.add('hidden'); els.recipeForm.classList.remove('hidden');
    els.recipeIdInput.value = state.selectedRecipeKey;
    els.recipeNameInput.value = r.name||'';
    els.recipeSkillInput.value = RECIPE_SKILLS.includes(r.skill)?r.skill:'smelting';
    els.recipeRequiredLevelInput.value = r.requiredLevel??1;
    els.recipeXpInput.value = r.xp??0;
    els.recipeCraftTimeInput.value = r.craftTime??2;
    els.recipeOutputIdInput.value = r.output?.id||'';
    els.recipeOutputQtyInput.value = r.output?.qty??1;
    renderRecipeInputEditor(r.input||{});
    els.recipeJsonPreview.textContent = JSON.stringify({[state.selectedRecipeKey]:r},null,2);
  }

  function syncSelectedRecipeFromForm() {
    const current = getSelectedRecipeEntry(); if (!current) return;
    const newKey = (els.recipeIdInput.value||'').trim()||state.selectedRecipeKey;
    if (newKey!==state.selectedRecipeKey&&!state.recipes[newKey]) { const m={}; Object.keys(state.recipes).forEach(k=>{ m[k===state.selectedRecipeKey?newKey:k]=state.recipes[k]; }); state.recipes=m; state.selectedRecipeKey=newKey; }
    state.recipes[state.selectedRecipeKey] = buildCurrentRecipeObject();
    setRecipeDirty(true); renderRecipeList();
    els.recipeJsonPreview.textContent = JSON.stringify({[state.selectedRecipeKey]:state.recipes[state.selectedRecipeKey]},null,2);
  }

  function renderRecipeDiagnostics(items=[],summary='No validation run yet') { els.recipeValidationSummary.textContent=summary; els.recipeDiagnosticsList.innerHTML=''; if(!items.length){els.recipeDiagnosticsList.className='diagnostics-list empty-diagnostics';els.recipeDiagnosticsList.innerHTML='<p>No messages yet.</p>';return;} els.recipeDiagnosticsList.className='diagnostics-list'; for(const item of items){const d=document.createElement('div');d.className=`diagnostic-item ${item.level||'info'}`;d.innerHTML=`<strong>${item.title}</strong><div>${item.message}</div>`;els.recipeDiagnosticsList.appendChild(d);} }
  function renderRecipes() { renderRecipeList(); renderRecipePanel(); }

  async function loadRecipes() { const r=await apiFetch('/api/recipes'); state.recipes=r.recipes||{}; const keys=Object.keys(state.recipes); state.selectedRecipeKey=keys.includes(state.selectedRecipeKey)?state.selectedRecipeKey:(keys[0]||null); setRecipeDirty(false); renderRecipes(); renderRecipeDiagnostics([{level:'info',title:'Loaded',message:r.path}],`Loaded ${keys.length} entries`); }
  async function saveRecipes() { const r=await apiFetch('/api/recipes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipes:state.recipes})}); setRecipeDirty(false); renderRecipeDiagnostics([{level:'info',title:'Saved',message:r.path}],`Saved ${Object.keys(state.recipes).length} entries`); }

  function validateRecipes() {
    const messages=[]; const entries=Object.entries(state.recipes); const itemIds=new Set(Object.keys(state.items));
    if (!entries.length) messages.push({level:'warning',title:'Empty',message:'No recipes defined.'});
    for (const [key,r] of entries) {
      if (!r.name) messages.push({level:'warning',title:`Missing name: ${key}`,message:'name should be non-empty.'});
      if (!RECIPE_SKILLS.includes(r.skill)) messages.push({level:'error',title:`Invalid skill: ${key}`,message:`skill must be one of ${RECIPE_SKILLS.join(', ')}.`});
      if (!r.input||!Object.keys(r.input).length) messages.push({level:'error',title:`No input: ${key}`,message:'Recipe must have at least one input ingredient.'});
      else for (const [itemId,qty] of Object.entries(r.input)) { if (!itemIds.has(itemId)) messages.push({level:'warning',title:`Unknown input: ${key}`,message:`Input item "${itemId}" not found in items.json.`}); if (typeof qty!=='number'||qty<1) messages.push({level:'error',title:`Bad qty: ${key}`,message:`Qty for "${itemId}" must be a positive number.`}); }
      if (!r.output?.id) messages.push({level:'error',title:`No output: ${key}`,message:'Recipe must have an output item id.'});
      else if (!itemIds.has(r.output.id)) messages.push({level:'warning',title:`Unknown output: ${key}`,message:`Output item "${r.output.id}" not found in items.json.`});
      if (typeof r.craftTime!=='number'||r.craftTime<=0) messages.push({level:'error',title:`craftTime: ${key}`,message:'craftTime must be a positive number.'});
    }
    if (!messages.length) messages.push({level:'info',title:'Validation passed',message:'No schema problems.'});
    const ec=messages.filter(m=>m.level==='error').length; const wc=messages.filter(m=>m.level==='warning').length;
    renderRecipeDiagnostics(messages,ec||wc?`${ec} error(s), ${wc} warning(s)`:'Validation passed');
  }

  function addRecipeIngredient() {
    els.recipeInputEmptyState.classList.add('hidden');
    const row = document.createElement('div');
    row.className = 'linked-list-row ingredient-row';
    row.innerHTML = `<input class="ing-id mono" type="text" placeholder="itemId" style="flex:1" /><input class="ing-qty" type="number" min="1" value="1" style="width:60px" /><button type="button" class="button danger small ing-remove" style="flex-shrink:0">✕</button>`;
    row.querySelector('.ing-id').addEventListener('input', syncSelectedRecipeFromForm);
    row.querySelector('.ing-qty').addEventListener('input', syncSelectedRecipeFromForm);
    row.querySelector('.ing-remove').addEventListener('click', () => { row.remove(); if (!els.recipeInputEditor.children.length) els.recipeInputEmptyState.classList.remove('hidden'); syncSelectedRecipeFromForm(); });
    els.recipeInputEditor.appendChild(row);
    row.querySelector('.ing-id').focus();
  }

  function addRecipe() { const k=ensureUniqueRecipeKey('new_recipe'); state.recipes[k]=JSON.parse(JSON.stringify(DEFAULT_NEW_RECIPE)); state.recipes[k].id=k; state.selectedRecipeKey=k; setRecipeDirty(true); renderRecipes(); }
  function duplicateRecipe() { const r=getSelectedRecipeEntry(); if(!r) return; const k=ensureUniqueRecipeKey(`${state.selectedRecipeKey}_copy`); state.recipes[k]=JSON.parse(JSON.stringify(r)); state.recipes[k].id=k; state.selectedRecipeKey=k; setRecipeDirty(true); renderRecipes(); }
  function deleteRecipe() { if(!getSelectedRecipeEntry()) return; if(!window.confirm(`Delete "${state.selectedRecipeKey}"?`)) return; delete state.recipes[state.selectedRecipeKey]; state.selectedRecipeKey=Object.keys(state.recipes)[0]||null; setRecipeDirty(true); renderRecipes(); }

  function bindEvents() {
    document.querySelectorAll('.tabbar .tab[data-tab]').forEach(btn => { if (!btn.disabled) btn.addEventListener('click', () => switchTab(btn.dataset.tab)); });
    els.loadButton.addEventListener('click', () => state.activeTab === 'items' ? loadItems() : (state.activeTab === 'enemies' ? loadEnemies() : (state.activeTab === 'npcs' ? loadNpcs() : (state.activeTab === 'quests' ? loadQuests() : (state.activeTab === 'playerBase' ? loadPlayerBase() : (state.activeTab === 'props' ? loadProps() : (state.activeTab === 'particles' ? loadParticles() : (state.activeTab === 'skills' ? loadSkills() : (state.activeTab === 'statusEffects' ? loadStatusEffects() : (state.activeTab === 'gatheringSkills' ? loadGatheringSkills() : (state.activeTab === 'resourceNodes' ? loadResourceNodes() : (state.activeTab === 'recipes' ? loadRecipes() : loadPalette()))))))))))));
    els.saveButton.addEventListener('click', () => {
      const tabNames = { tilePalette:'Tile Palette', items:'Items', enemies:'Enemies', npcs:'NPCs', quests:'Quests', playerBase:'Player Base', props:'Props', particles:'Particles', skills:'Skills', statusEffects:'Status Effects', gatheringSkills:'Gathering Skills', resourceNodes:'Resource Nodes', recipes:'Recipes' };
      const label = tabNames[state.activeTab] || state.activeTab;
      if (!window.confirm(`Save ${label} to disk?\n\nThis will overwrite the JSON file.`)) return;
      if (state.activeTab === 'items') saveItems();
      else if (state.activeTab === 'enemies') saveEnemies();
      else if (state.activeTab === 'npcs') saveNpcs();
      else if (state.activeTab === 'quests') saveQuests();
      else if (state.activeTab === 'playerBase') savePlayerBase();
      else if (state.activeTab === 'props') saveProps();
      else if (state.activeTab === 'particles') saveParticles();
      else if (state.activeTab === 'skills') saveSkills();
      else if (state.activeTab === 'statusEffects') saveStatusEffects();
      else if (state.activeTab === 'gatheringSkills') saveGatheringSkills();
      else if (state.activeTab === 'resourceNodes') saveResourceNodes();
      else if (state.activeTab === 'recipes') saveRecipes();
      else savePalette();
    });
    els.reloadButton.addEventListener('click', loadPalette);
    els.validateButton.addEventListener('click', validatePalette);
    els.scanTilesButton.addEventListener('click', scanTilesFolder);
    els.addTileButton.addEventListener('click', addTile);
    els.duplicateTileButton.addEventListener('click', duplicateTile);
    els.deleteTileButton.addEventListener('click', deleteTile);
    els.searchInput.addEventListener('input', e => { state.tileSearch = e.target.value || ''; renderTileList(); });
    els.tileIdInput.addEventListener('change', e => renameSelectedTileKey(e.target.value));
    els.tileBlockedInput.addEventListener('change', e => { const entry=getSelectedTileEntry(); if(!entry) return; entry.blocked = !!e.target.checked; setTileDirty(true); renderTiles(); });
    els.tileColorPicker.addEventListener('input', e => updateSelectedTileColor(hexToRgb(e.target.value)));
    [els.tileRInput, els.tileGInput, els.tileBInput].forEach(input => input.addEventListener('input', () => updateSelectedTileColor([els.tileRInput.value, els.tileGInput.value, els.tileBInput.value])));
    els.spritePreviewImage.addEventListener('load', () => setTileSpriteStatus(true));
    els.spritePreviewImage.addEventListener('error', () => setTileSpriteStatus(false));
    els.scanCancelButton.addEventListener('click', closeScanModal);
    els.scanModalCloseButton.addEventListener('click', closeScanModal);
    els.scanConfirmButton.addEventListener('click', confirmScanAdditions);
    els.scanModal.addEventListener('click', e => { if (e.target === els.scanModal) closeScanModal(); });

    els.reloadItemsButton.addEventListener('click', loadItems);
    els.validateItemsButton.addEventListener('click', validateItems);
    els.addItemButton.addEventListener('click', addItem);
    els.duplicateItemButton.addEventListener('click', duplicateItem);
    els.deleteItemButton.addEventListener('click', deleteItem);
    els.itemSearchInput.addEventListener('input', e => { state.itemSearch = e.target.value || ''; renderItemList(); });
    ['itemIdInput','itemNameInput','itemTypeInput','itemIconInput','itemValueInput','itemStackSizeInput','itemDescriptionInput','itemAttackBonusInput','itemHandedInput','itemWeaponTypeInput','itemWeaponRangeInput','itemMaxArrowsInput','itemToolTypeInput','itemGatheringLevelReqInput','itemStatsAttackInput','itemStatsHpInput','itemStatsManaInput','itemStatsDefenseInput','itemHpBonusInput','itemManaBonusInput','itemCastTimeInput','itemCooldownInput','itemHitParticleInput','itemHitSfxInput','itemSwingSfxInput','itemUseParticleInput','itemUseSfxInput'].forEach(id => els[id] && els[id].addEventListener('input', syncSelectedItemFromForm));
    els.itemPermanentInput.addEventListener('change', syncSelectedItemFromForm);
    els.itemConcentrationInput.addEventListener('change', syncSelectedItemFromForm);
    els.itemRequiresQuiverInput.addEventListener('change', syncSelectedItemFromForm);
    els.itemToolTierInput.addEventListener('change', syncSelectedItemFromForm);
    els.itemRarityInput.addEventListener('change', syncSelectedItemFromForm);
    els.itemDismantleableInput.addEventListener('change', syncSelectedItemFromForm);
    els.itemDismantleAddButton.addEventListener('click', addItemDismantleRow);
    els.itemEffectAddButton.addEventListener('click', addItemEffectRow);
    els.itemTypeInput.addEventListener('change', () => { updateTypeFieldVisibility(els.itemTypeInput.value); syncSelectedItemFromForm(); });
    els.itemIconPreviewImage.addEventListener('load', () => setItemIconStatus(true));
    els.itemIconPreviewImage.addEventListener('error', () => setItemIconStatus(false));

    els.reloadEnemiesButton.addEventListener('click', loadEnemies);
    els.validateEnemiesButton.addEventListener('click', validateEnemies);
    els.addEnemyButton.addEventListener('click', addEnemy);
    els.duplicateEnemyButton.addEventListener('click', duplicateEnemy);
    els.deleteEnemyButton.addEventListener('click', deleteEnemy);
    els.enemySearchInput.addEventListener('input', e => { state.enemySearch = e.target.value || ''; renderEnemyList(); });
    ['enemyIdInput','enemyNameInput','enemyMaxHpInput','enemyDamageInput','enemySpeedInput','enemyXpInput','enemyGoldMinInput','enemyGoldMaxInput','enemyRespawnSecondsInput','enemyColorInput','enemyRadiusInput','enemyAggroRangeInput','enemyAttackRangeInput','enemyAttackCooldownInput','enemyHitParticleInput','enemyHitSfxInput'].forEach(id => els[id].addEventListener('input', syncSelectedEnemyFromForm));
    els.enemyLootAddButton.addEventListener('click', addEnemyLootEntry);
    els.enemyPreviewImage.addEventListener('load', () => setEnemySpriteStatus(true));
    els.enemyPreviewImage.addEventListener('error', () => setEnemySpriteStatus(false));

    els.reloadNpcsButton.addEventListener('click', loadNpcs);
    els.validateNpcsButton.addEventListener('click', validateNpcs);
    els.addNpcButton.addEventListener('click', addNpc);
    els.duplicateNpcButton.addEventListener('click', duplicateNpc);
    els.deleteNpcButton.addEventListener('click', deleteNpc);
    els.npcSearchInput.addEventListener('input', e => { state.npcSearch = e.target.value || ''; renderNpcList(); });
    ['npcIdInput','npcNameInput','npcColorInput','npcDefaultDialogInput'].forEach(id => els[id].addEventListener('input', syncSelectedNpcFromForm));
    els.npcCraftingSkillInput.addEventListener("change", syncSelectedNpcFromForm);
    els.npcTypeInput.addEventListener('change', syncSelectedNpcFromForm);
    els.npcQuestAddButton.addEventListener('click', addNpcQuestEntry);
    els.npcShopAddButton.addEventListener('click', addNpcShopEntry);
    els.npcPreviewImage.addEventListener('load', () => setNpcSpriteStatus(true));
    els.npcPreviewImage.addEventListener('error', () => setNpcSpriteStatus(false));

    els.reloadQuestsButton.addEventListener('click', loadQuests);
    els.validateQuestsButton.addEventListener('click', validateQuests);
    els.addQuestButton.addEventListener('click', addQuest);
    els.duplicateQuestButton.addEventListener('click', duplicateQuest);
    els.deleteQuestButton.addEventListener('click', deleteQuest);
    els.questSearchInput.addEventListener('input', e => { state.questSearch = e.target.value || ''; renderQuestList(); });
    ['questIdInput','questNameInput','questLevelInput','questDescriptionInput','questRewardXpInput','questRewardGoldInput','questDialogNotStartedTextInput','questDialogActiveTextInput','questDialogReadyTextInput','questDialogCompletedTextInput'].forEach(id => els[id].addEventListener('input', syncSelectedQuestFromForm));
    els.questGiverInput.addEventListener('change', syncSelectedQuestFromForm);
    els.questPrereqAddButton.addEventListener('click', addQuestPrereqEntry);
    els.questObjectiveAddButton.addEventListener('click', addQuestObjectiveEntry);
    els.questRewardItemAddButton.addEventListener('click', addQuestRewardItemEntry);
    els.questDialogNotStartedAddButton.addEventListener('click', () => addQuestDialogOption('not_started'));
    els.questDialogActiveAddButton.addEventListener('click', () => addQuestDialogOption('active'));
    els.questDialogReadyAddButton.addEventListener('click', () => addQuestDialogOption('ready_to_turn_in'));
    els.questDialogCompletedAddButton.addEventListener('click', () => addQuestDialogOption('completed'));

    els.reloadPlayerBaseButton.addEventListener('click', loadPlayerBase);
    els.validatePlayerBaseButton.addEventListener('click', validatePlayerBase);
    ['pbMaxHpInput','pbMaxManaInput','pbDamageInput','pbHpPerLevelInput','pbManaPerLevelInput','pbDamagePerLevelInput','pbMoveSpeedInput','pbAttackRangeInput','pbAttackCooldownInput','pbHitParticleInput','pbHitSfxInput','pbSwingSfxInput'].forEach(id => els[id].addEventListener('input', syncPlayerBaseFromForm));

    els.reloadPropsButton.addEventListener('click', loadProps);
    els.validatePropsButton.addEventListener('click', validateProps);
    els.scanPropsButton.addEventListener('click', scanPropsFolder);
    els.addPropButton.addEventListener('click', addProp);
    els.duplicatePropButton.addEventListener('click', duplicateProp);
    els.deletePropButton.addEventListener('click', deleteProp);
    els.propSearchInput.addEventListener('input', e => { state.propSearch = e.target.value || ''; renderPropList(); });
    els.propIdInput.addEventListener('change', e => renameSelectedPropKey(e.target.value));
    els.propBlockedInput.addEventListener('change', e => { const entry=getSelectedPropEntry(); if(!entry) return; entry.blocked=!!e.target.checked; setPropDirty(true); renderProps(); });
    els.propColorPicker.addEventListener('input', e => updateSelectedPropColor(hexToRgb(e.target.value)));
    [els.propRInput, els.propGInput, els.propBInput].forEach(input => input.addEventListener('input', () => updateSelectedPropColor([els.propRInput.value, els.propGInput.value, els.propBInput.value])));
    els.propSpritePreviewImage.addEventListener('load', () => setPropSpriteStatus(true));
    els.propSpritePreviewImage.addEventListener('error', () => setPropSpriteStatus(false));

    els.reloadParticlesButton.addEventListener('click', loadParticles);
    els.validateParticlesButton.addEventListener('click', validateParticles);
    els.addParticleButton.addEventListener('click', addParticle);
    els.duplicateParticleButton.addEventListener('click', duplicateParticle);
    els.deleteParticleButton.addEventListener('click', deleteParticle);
    els.particleColorAddButton.addEventListener('click', addParticleColor);
    els.particleSearchInput.addEventListener('input', e => { state.particleSearch = e.target.value || ''; renderParticleList(); });
    ['particleIdInput','particleBlendModeInput','particleEmitIntervalInput','particleCountMinInput','particleCountMaxInput','particleLifetimeMinInput','particleLifetimeMaxInput','particleSpeedMinInput','particleSpeedMaxInput','particleAngleMinInput','particleAngleMaxInput','particleGravityInput','particleFrictionInput','particleSizeMinInput','particleSizeMaxInput','particleSizeEndInput'].forEach(id => els[id].addEventListener('input', syncSelectedParticleFromForm));
    els.particleBlendModeInput.addEventListener('change', syncSelectedParticleFromForm);
    els.particleFadeOutInput.addEventListener('change', syncSelectedParticleFromForm);
    els.particleContinuousInput.addEventListener('change', syncSelectedParticleFromForm);
    els.particleEmitButton.addEventListener('click', () => _preview.emitAtCenter());
    els.particleClearButton.addEventListener('click', () => _preview.clear());
    els.particlePreviewCanvas.addEventListener('click', e => {
      const rect = els.particlePreviewCanvas.getBoundingClientRect();
      _preview.emitAt(e.clientX - rect.left, e.clientY - rect.top);
    });

    els.reloadSkillsButton.addEventListener('click', loadSkills);
    els.validateSkillsButton.addEventListener('click', validateSkills);
    els.addSkillButton.addEventListener('click', addSkill);
    els.duplicateSkillButton.addEventListener('click', duplicateSkill);
    els.deleteSkillButton.addEventListener('click', deleteSkill);
    els.skillSearchInput.addEventListener('input', e => { state.skillSearch = e.target.value || ''; renderSkillList(); });
    els.skillTypeInput.addEventListener('change', () => { updateSkillTypeVisibility(els.skillTypeInput.value); syncSelectedSkillFromForm(); });
    ['skillIdInput','skillNameInput','skillTargetingInput','skillIconInput','skillLevelReqInput','skillManaCostInput','skillCooldownInput','skillRangeInput','skillDescriptionInput','skillClassesExtraInput','skillParticleInput','skillHitParticleInput','skillSfxInput','skillCastSfxInput','skillProjectileSpeedInput','skillDamageInput','skillDamagePerLevelInput','skillDamageTypeInput','skillAoeRadiusInput','skillHitsInput','skillHitIntervalInput','skillHealAmountInput','skillHealPerLevelInput','skillHealTicksInput','skillHealIntervalInput'].forEach(id => els[id].addEventListener('input', syncSelectedSkillFromForm));
    els.skillChanneledInput.addEventListener('change', syncSelectedSkillFromForm);
    els.skillHealChanneledInput.addEventListener('change', syncSelectedSkillFromForm);
    document.querySelectorAll('.skill-class-cb').forEach(cb => cb.addEventListener('change', syncSelectedSkillFromForm));

    els.reloadStatusEffectsButton.addEventListener('click', loadStatusEffects);
    els.validateStatusEffectsButton.addEventListener('click', validateStatusEffects);
    els.addStatusEffectButton.addEventListener('click', addStatusEffect);
    els.duplicateStatusEffectButton.addEventListener('click', duplicateStatusEffect);
    els.deleteStatusEffectButton.addEventListener('click', deleteStatusEffect);
    els.statusEffectSearchInput.addEventListener('input', e => { state.statusEffectSearch = e.target.value || ''; renderStatusEffectList(); });
    ['statusEffectIdInput','statusEffectNameInput','statusEffectDescriptionInput','statusEffectIconInput'].forEach(id => els[id].addEventListener('input', syncSelectedStatusEffectFromForm));
    els.statusEffectTypeInput.addEventListener('change', syncSelectedStatusEffectFromForm);
    els.skillIconPreviewImage.addEventListener('load', () => setSkillIconStatus(true));
    els.skillIconPreviewImage.addEventListener('error', () => setSkillIconStatus(false));
    els.statusEffectIconPreviewImage.addEventListener('load', () => setStatusEffectIconStatus(true));
    els.statusEffectIconPreviewImage.addEventListener('error', () => setStatusEffectIconStatus(false));
    // Refresh skill icon preview live as the icon key is typed
    els.skillIconInput.addEventListener('input', () => {
      const key = els.skillIconInput.value.trim();
      els.skillIconPathLabel.textContent = getSkillIconDisplayPath(key || '…');
      if (key) { setSkillIconStatus(null); els.skillIconPreviewImage.src = getSkillIconUrl(key); }
      else setSkillIconStatus(false);
    });
    // Refresh statusEffect icon preview live as the path is typed
    els.statusEffectIconInput.addEventListener('input', () => {
      const p = els.statusEffectIconInput.value.trim();
      els.statusEffectIconPathLabel.textContent = p || 'assets/sprites/status/…';
      if (p) { setStatusEffectIconStatus(null); els.statusEffectIconPreviewImage.src = getStatusEffectIconUrl(p); }
      else setStatusEffectIconStatus(false);
    });

    els.skillRequiresWeaponInput.addEventListener('change', syncSelectedSkillFromForm);
    els.skillRequiresShieldInput.addEventListener('change', syncSelectedSkillFromForm);
    els.skillRequiresWeaponTypeInput.addEventListener('input', syncSelectedSkillFromForm);

    els.reloadGatheringSkillsButton.addEventListener('click', loadGatheringSkills);
    els.validateGatheringSkillsButton.addEventListener('click', validateGatheringSkills);
    els.addGatheringSkillButton.addEventListener('click', addGatheringSkill);
    els.duplicateGatheringSkillButton.addEventListener('click', duplicateGatheringSkill);
    els.deleteGatheringSkillButton.addEventListener('click', deleteGatheringSkill);
    els.gatheringSkillSearchInput.addEventListener('input', e=>{ state.gatheringSkillSearch=e.target.value||''; renderGatheringSkillList(); });
    ['gatheringSkillIdInput','gatheringSkillNameInput','gatheringSkillDescriptionInput','gatheringSkillIconInput','gatheringSkillToolTypeInput','gatheringSkillCategoryInput'].forEach(id=>els[id].addEventListener('input',syncSelectedGatheringSkillFromForm));

    els.reloadResourceNodesButton.addEventListener('click', loadResourceNodes);
    els.validateResourceNodesButton.addEventListener('click', validateResourceNodes);
    els.addResourceNodeButton.addEventListener('click', addResourceNode);
    els.duplicateResourceNodeButton.addEventListener('click', duplicateResourceNode);
    els.deleteResourceNodeButton.addEventListener('click', deleteResourceNode);
    els.resourceNodeSearchInput.addEventListener('input', e=>{ state.resourceNodeSearch=e.target.value||''; renderResourceNodeList(); });
    ['resourceNodeIdInput','resourceNodeNameInput','resourceNodeGatherItemInput','resourceNodeRequiredLevelInput','resourceNodeXpInput','resourceNodeMaxHarvestsInput','resourceNodeRespawnTicksInput'].forEach(id=>els[id].addEventListener('input',syncSelectedResourceNodeFromForm));
    els.resourceNodeSkillInput.addEventListener('change', syncSelectedResourceNodeFromForm);
    els.resourceNodeToolTypeInput.addEventListener('change', syncSelectedResourceNodeFromForm);
    els.resourceNodeToolTierInput.addEventListener('change', syncSelectedResourceNodeFromForm);
    els.resourceNodeColorPicker.addEventListener('input', e=>updateResourceNodeColor(hexToRgb(e.target.value)));
    [els.resourceNodeRInput,els.resourceNodeGInput,els.resourceNodeBInput].forEach(input=>input.addEventListener('input',()=>updateResourceNodeColor([els.resourceNodeRInput.value,els.resourceNodeGInput.value,els.resourceNodeBInput.value])));
    els.resourceNodeSpriteImage.addEventListener('load',()=>setResourceNodeSpriteStatus(true));
    els.resourceNodeSpriteImage.addEventListener('error',()=>setResourceNodeSpriteStatus(false));

    els.reloadRecipesButton.addEventListener('click', loadRecipes);
    els.validateRecipesButton.addEventListener('click', validateRecipes);
    els.addRecipeButton.addEventListener('click', addRecipe);
    els.duplicateRecipeButton.addEventListener('click', duplicateRecipe);
    els.deleteRecipeButton.addEventListener('click', deleteRecipe);
    els.recipeInputAddButton.addEventListener('click', addRecipeIngredient);
    els.recipeSearchInput.addEventListener('input', e=>{ state.recipeSearch=e.target.value||''; renderRecipeList(); });
    ['recipeIdInput','recipeNameInput','recipeOutputIdInput','recipeRequiredLevelInput','recipeXpInput','recipeCraftTimeInput','recipeOutputQtyInput'].forEach(id=>els[id].addEventListener('input',syncSelectedRecipeFromForm));
    els.recipeSkillInput.addEventListener('change', syncSelectedRecipeFromForm);

    // SFX play buttons — single delegated listener covers all tabs
    document.addEventListener('click', e => {
      const btn = e.target.closest('.sfx-play-btn');
      if (!btn) return;
      const inputId = btn.dataset.sfxInput;
      const input = inputId ? document.getElementById(inputId) : null;
      const key = input ? input.value.trim() : '';
      playSfx(key, btn);
    });

    window.addEventListener('keydown', event => { if (event.key === 'Escape' && !els.scanModal.classList.contains('hidden')) closeScanModal(); });
    window.addEventListener('beforeunload', event => { if (!(state.tileDirty || state.itemDirty || state.enemyDirty || state.npcDirty || state.questDirty || state.playerBaseDirty || state.propDirty || state.particleDirty || state.skillDirty || state.statusEffectDirty || state.gatheringSkillDirty || state.resourceNodeDirty || state.recipeDirty)) return; event.preventDefault(); event.returnValue = ''; });
  }

  async function init() {
    bindEls();
    bindEvents();
    _preview.init(els.particlePreviewCanvas);
    switchTab('tilePalette');
    updateDirtyBadge();
    renderTiles();
    renderItems();
    renderEnemies();
    renderNpcs();
    renderQuests();
    renderProps();
    renderParticles();
    renderSkills();
    renderStatusEffects();
    renderGatheringSkills();
    renderResourceNodes();
    renderRecipes();
    try { await Promise.all([loadPalette(), loadItems(), loadEnemies(), loadNpcs(), loadQuests(), loadPlayerBase(), loadProps(), loadParticles(), loadSkills(), loadStatusEffects(), loadGatheringSkills(), loadResourceNodes(), loadRecipes()]); }
    catch (error) {
      renderTileDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }, { level:'info', title:'Expected project-relative paths', message:'Run the included server from tools/other-tools so it can reach ../../public/data and ../../public/assets/sprites.' }], 'Unable to load one or more data files');
      renderItemDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderEnemyDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderNpcDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderQuestDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderPlayerBaseDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderParticleDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderSkillDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderStatusEffectDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderGatheringSkillDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderResourceNodeDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderRecipeDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
