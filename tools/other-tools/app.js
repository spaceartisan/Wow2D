
(() => {
  const ITEM_TYPES = ['weapon', 'armor', 'trinket', 'consumable', 'junk', 'hearthstone'];
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
  const NPC_TYPES = ['quest_giver', 'vendor', 'banker'];
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
  };

  const els = {};
  const ids = [
    'connectionBadge','dirtyBadge','loadButton','saveButton',
    'reloadButton','validateButton','scanTilesButton','addTileButton','duplicateTileButton','deleteTileButton','searchInput','tileList','entryCount','blockedCount','selectedTileLabel','emptyState','tileForm','tileIdInput','tileBlockedInput','tileColorPicker','tileRInput','tileGInput','tileBInput','colorPreview','spritePreviewImage','spritePreviewFallback','spriteStatusBadge','spritePathLabel','entryJsonPreview','diagnosticsList','validationSummary','tileListItemTemplate','scanModal','scanModalSubtitle','scanModalCloseButton','scanCancelButton','scanConfirmButton','scanNewCount','scanExistingCount','scanSpriteDirLabel','scanTileIdList',
    'itemSearchInput','itemList','itemEntryCount','itemTypeCount','selectedItemLabel','itemEmptyState','itemForm','itemIdInput','itemNameInput','itemTypeInput','itemIconInput','itemValueInput','itemStackSizeInput','itemDescriptionInput','itemAttackBonusInput','itemHpBonusInput','itemManaBonusInput','itemEffectInput','itemPowerInput','itemPermanentInput','itemCastTimeInput','itemCooldownInput','itemIconPreviewImage','itemIconPreviewFallback','itemIconStatusBadge','itemIconPathLabel','itemJsonPreview','itemDiagnosticsList','itemValidationSummary','itemListItemTemplate','addItemButton','duplicateItemButton','deleteItemButton','validateItemsButton','reloadItemsButton',
    'enemySearchInput','enemyList','enemyEntryCount','enemyLootRefCount','selectedEnemyLabel','enemyEmptyState','enemyForm','enemyIdInput','enemyNameInput','enemyPreviewImage','enemyPreviewFallback','enemySpriteStatusBadge','enemySpritePathLabel','enemyColorPreview','enemyMaxHpInput','enemyDamageInput','enemySpeedInput','enemyXpInput','enemyGoldMinInput','enemyGoldMaxInput','enemyRespawnSecondsInput','enemyColorInput','enemyRadiusInput','enemyAggroRangeInput','enemyAttackRangeInput','enemyAttackCooldownInput','enemyLootEditor','enemyLootEmptyState','enemyLootAddButton','enemyJsonPreview','enemyDiagnosticsList','enemyValidationSummary','enemyListItemTemplate','addEnemyButton','duplicateEnemyButton','deleteEnemyButton','validateEnemiesButton','reloadEnemiesButton',
    'npcSearchInput','npcList','npcEntryCount','npcVendorCount','selectedNpcLabel','npcEmptyState','npcForm','npcIdInput','npcNameInput','npcTypeInput','npcColorInput','npcPreviewImage','npcPreviewFallback','npcSpriteStatusBadge','npcSpritePathLabel','npcColorPreview','npcDefaultDialogInput','npcQuestEditor','npcQuestEmptyState','npcQuestAddButton','npcShopEditor','npcShopEmptyState','npcShopAddButton','npcJsonPreview','npcDiagnosticsList','npcValidationSummary','addNpcButton','duplicateNpcButton','deleteNpcButton','validateNpcsButton','reloadNpcsButton',
    'questSearchInput','questList','questEntryCount','questObjectiveCount','selectedQuestLabel','questEmptyState','questForm','questIdInput','questNameInput','questGiverInput','questLevelInput','questDescriptionInput','questPrereqEditor','questPrereqEmptyState','questPrereqAddButton','questObjectivesEditor','questObjectivesEmptyState','questObjectiveAddButton','questRewardXpInput','questRewardGoldInput','questRewardItemsEditor','questRewardItemsEmptyState','questRewardItemAddButton','questDialogNotStartedTextInput','questDialogNotStartedOptionsEditor','questDialogNotStartedOptionsEmptyState','questDialogNotStartedAddButton','questDialogActiveTextInput','questDialogActiveOptionsEditor','questDialogActiveOptionsEmptyState','questDialogActiveAddButton','questDialogReadyTextInput','questDialogReadyOptionsEditor','questDialogReadyOptionsEmptyState','questDialogReadyAddButton','questDialogCompletedTextInput','questDialogCompletedOptionsEditor','questDialogCompletedOptionsEmptyState','questDialogCompletedAddButton','questJsonPreview','questDiagnosticsList','questValidationSummary','addQuestButton','duplicateQuestButton','deleteQuestButton','validateQuestsButton','reloadQuestsButton',
    'playerBaseForm','pbMaxHpInput','pbMaxManaInput','pbDamageInput','pbMoveSpeedInput','pbAttackRangeInput','pbAttackCooldownInput','playerBaseJsonPreview','playerBaseDiagnosticsList','playerBaseValidationSummary','validatePlayerBaseButton','reloadPlayerBaseButton',
    'propSearchInput','propList','propEntryCount','propBlockedCount','selectedPropLabel','propEmptyState','propForm','propIdInput','propBlockedInput','propColorPicker','propRInput','propGInput','propBInput','propColorPreview','propSpritePreviewImage','propSpritePreviewFallback','propSpriteStatusBadge','propSpritePathLabel','propJsonPreview','propDiagnosticsList','propValidationSummary','addPropButton','duplicatePropButton','deletePropButton','validatePropsButton','reloadPropsButton','scanPropsButton'
  ];

  function bindEls() { ids.forEach(id => els[id] = document.getElementById(id)); }
  function currentDirty() { return state.activeTab === 'items' ? state.itemDirty : (state.activeTab === 'enemies' ? state.enemyDirty : (state.activeTab === 'npcs' ? state.npcDirty : (state.activeTab === 'quests' ? state.questDirty : (state.activeTab === 'playerBase' ? state.playerBaseDirty : (state.activeTab === 'props' ? state.propDirty : state.tileDirty))))); }
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

  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.tabbar .tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('.tool-view').forEach(view => view.classList.toggle('active', view.dataset.view === tab));
    updateDirtyBadge();
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
    if (type === 'weapon') visible.add('attackBonus');
    if (type === 'armor') visible.add('hpBonus');
    if (type === 'trinket') visible.add('manaBonus');
    if (type === 'consumable') { visible.add('effect'); visible.add('power'); }
    if (type === 'hearthstone') { visible.add('permanent'); visible.add('castTime'); visible.add('cooldown'); }
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
    if (obj.type === 'weapon' && els.itemAttackBonusInput.value !== '') obj.attackBonus = Number(els.itemAttackBonusInput.value);
    if (obj.type === 'armor' && els.itemHpBonusInput.value !== '') obj.hpBonus = Number(els.itemHpBonusInput.value);
    if (obj.type === 'trinket' && els.itemManaBonusInput.value !== '') obj.manaBonus = Number(els.itemManaBonusInput.value);
    if (obj.type === 'consumable') {
      if (els.itemEffectInput.value) obj.effect = els.itemEffectInput.value;
      if (els.itemPowerInput.value !== '') obj.power = Number(els.itemPowerInput.value);
    }
    if (obj.type === 'hearthstone') {
      obj.permanent = !!els.itemPermanentInput.checked;
      if (els.itemCastTimeInput.value !== '') obj.castTime = Number(els.itemCastTimeInput.value);
      if (els.itemCooldownInput.value !== '') obj.cooldown = Number(els.itemCooldownInput.value);
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
    els.itemHpBonusInput.value = toIntOrEmpty(item.hpBonus);
    els.itemManaBonusInput.value = toIntOrEmpty(item.manaBonus);
    els.itemEffectInput.value = item.effect || '';
    els.itemPowerInput.value = toIntOrEmpty(item.power);
    els.itemPermanentInput.checked = !!item.permanent;
    els.itemCastTimeInput.value = toNumOrEmpty(item.castTime);
    els.itemCooldownInput.value = toNumOrEmpty(item.cooldown);
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
      const show = (type === 'quest_giver' && field === 'questIds') || (type === 'vendor' && field === 'shop');
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
  function renderPlayerBaseForm() {
    const pb = state.playerBase;
    if (!pb) return;
    els.pbMaxHpInput.value = pb.maxHp ?? '';
    els.pbMaxManaInput.value = pb.maxMana ?? '';
    els.pbDamageInput.value = pb.damage ?? '';
    els.pbMoveSpeedInput.value = pb.moveSpeed ?? '';
    els.pbAttackRangeInput.value = pb.attackRange ?? '';
    els.pbAttackCooldownInput.value = pb.attackCooldown ?? '';
    renderPlayerBaseJsonPreview();
  }
  function syncPlayerBaseFromForm() {
    if (!state.playerBase) state.playerBase = {};
    const pb = state.playerBase;
    pb.moveSpeed = Number(els.pbMoveSpeedInput.value) || 0;
    pb.attackRange = Number(els.pbAttackRangeInput.value) || 0;
    pb.attackCooldown = Number(els.pbAttackCooldownInput.value) || 0;
    pb.maxHp = Number(els.pbMaxHpInput.value) || 0;
    pb.maxMana = Number(els.pbMaxManaInput.value) || 0;
    pb.damage = Number(els.pbDamageInput.value) || 0;
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
    if (!pb || typeof pb !== 'object' || Array.isArray(pb)) { messages.push({level:'error', title:'Invalid data', message:'playerBase must be a flat object.'}); renderPlayerBaseDiagnostics(messages, '1 error'); return; }
    const numFields = [['moveSpeed','Movement speed in pixels/sec'],['attackRange','Melee range in pixels'],['attackCooldown','Seconds between attacks'],['maxHp','Base max HP'],['maxMana','Base max mana'],['damage','Base damage']];
    numFields.forEach(([field, hint]) => {
      if (typeof pb[field] !== 'number' || Number.isNaN(pb[field])) messages.push({level:'error', title:`Missing or invalid: ${field}`, message:`${field} must be a number. (${hint})`});
      else if (pb[field] <= 0) messages.push({level:'warning', title:`Low value: ${field}`, message:`${field} is ${pb[field]} — expected a positive number.`});
    });
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

  function bindEvents() {
    document.querySelectorAll('.tabbar .tab[data-tab]').forEach(btn => { if (!btn.disabled) btn.addEventListener('click', () => switchTab(btn.dataset.tab)); });
    els.loadButton.addEventListener('click', () => state.activeTab === 'items' ? loadItems() : (state.activeTab === 'enemies' ? loadEnemies() : (state.activeTab === 'npcs' ? loadNpcs() : (state.activeTab === 'quests' ? loadQuests() : (state.activeTab === 'playerBase' ? loadPlayerBase() : (state.activeTab === 'props' ? loadProps() : loadPalette()))))));
    els.saveButton.addEventListener('click', () => state.activeTab === 'items' ? saveItems() : (state.activeTab === 'enemies' ? saveEnemies() : (state.activeTab === 'npcs' ? saveNpcs() : (state.activeTab === 'quests' ? saveQuests() : (state.activeTab === 'playerBase' ? savePlayerBase() : (state.activeTab === 'props' ? saveProps() : savePalette()))))));
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
    ['itemIdInput','itemNameInput','itemTypeInput','itemIconInput','itemValueInput','itemStackSizeInput','itemDescriptionInput','itemAttackBonusInput','itemHpBonusInput','itemManaBonusInput','itemEffectInput','itemPowerInput','itemCastTimeInput','itemCooldownInput'].forEach(id => els[id].addEventListener('input', syncSelectedItemFromForm));
    els.itemPermanentInput.addEventListener('change', syncSelectedItemFromForm);
    els.itemTypeInput.addEventListener('change', () => { updateTypeFieldVisibility(els.itemTypeInput.value); syncSelectedItemFromForm(); });
    els.itemIconPreviewImage.addEventListener('load', () => setItemIconStatus(true));
    els.itemIconPreviewImage.addEventListener('error', () => setItemIconStatus(false));

    els.reloadEnemiesButton.addEventListener('click', loadEnemies);
    els.validateEnemiesButton.addEventListener('click', validateEnemies);
    els.addEnemyButton.addEventListener('click', addEnemy);
    els.duplicateEnemyButton.addEventListener('click', duplicateEnemy);
    els.deleteEnemyButton.addEventListener('click', deleteEnemy);
    els.enemySearchInput.addEventListener('input', e => { state.enemySearch = e.target.value || ''; renderEnemyList(); });
    ['enemyIdInput','enemyNameInput','enemyMaxHpInput','enemyDamageInput','enemySpeedInput','enemyXpInput','enemyGoldMinInput','enemyGoldMaxInput','enemyRespawnSecondsInput','enemyColorInput','enemyRadiusInput','enemyAggroRangeInput','enemyAttackRangeInput','enemyAttackCooldownInput'].forEach(id => els[id].addEventListener('input', syncSelectedEnemyFromForm));
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
    ['pbMaxHpInput','pbMaxManaInput','pbDamageInput','pbMoveSpeedInput','pbAttackRangeInput','pbAttackCooldownInput'].forEach(id => els[id].addEventListener('input', syncPlayerBaseFromForm));

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

    window.addEventListener('keydown', event => { if (event.key === 'Escape' && !els.scanModal.classList.contains('hidden')) closeScanModal(); });
    window.addEventListener('beforeunload', event => { if (!(state.tileDirty || state.itemDirty || state.enemyDirty || state.npcDirty || state.questDirty || state.playerBaseDirty || state.propDirty)) return; event.preventDefault(); event.returnValue = ''; });
  }

  async function init() {
    bindEls();
    bindEvents();
    switchTab('tilePalette');
    updateDirtyBadge();
    renderTiles();
    renderItems();
    renderEnemies();
    renderNpcs();
    renderQuests();
    renderProps();
    try { await Promise.all([loadPalette(), loadItems(), loadEnemies(), loadNpcs(), loadQuests(), loadPlayerBase(), loadProps()]); }
    catch (error) {
      renderTileDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }, { level:'info', title:'Expected project-relative paths', message:'Run the included server from tools/other-tools so it can reach ../../public/data and ../../public/assets/sprites.' }], 'Unable to load one or more data files');
      renderItemDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderEnemyDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderNpcDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderQuestDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
      renderPlayerBaseDiagnostics([{ level:'error', title:'Startup load failed', message:String(error.message || error) }], 'Unable to load one or more data files');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
