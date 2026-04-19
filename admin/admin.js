/* ════════════════════════════════════════════════════════════
   AZERFALL ENGINE – Admin Panel Client
   ════════════════════════════════════════════════════════════ */

let adminKey = "";
let questDefs = {};   // quest id → { name, ... } from quests.json

/* ── Theme: load game name from theme.json ─────────────────── */
(async () => {
  try {
    const theme = await fetch("/data/theme.json").then(r => r.json());
    const name = theme.gameName || "Game";
    document.title = `${name} Admin`;
    const h1 = document.querySelector("#login-overlay h1");
    if (h1) h1.textContent = `${name} Admin`;
    const logo = document.querySelector(".logo");
    if (logo) logo.innerHTML = `${name}<br><span>Admin Panel</span>`;
  } catch (_) { /* keep defaults */ }
})();

/* ── API helper ────────────────────────────────────────────── */

async function api(method, path, body) {
  const opts = {
    method,
    headers: { "x-admin-key": adminKey, "Content-Type": "application/json" }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ── Toast ─────────────────────────────────────────────────── */

function toast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ── Modal ─────────────────────────────────────────────────── */

function openModal(title, bodyHtml) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeModal();
});

/* ── Tab navigation ────────────────────────────────────────── */

document.querySelectorAll("#sidebar a[data-tab]").forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const tab = link.dataset.tab;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll("#sidebar a").forEach(a => a.classList.remove("active"));
    document.getElementById(`tab-${tab}`).classList.add("active");
    link.classList.add("active");

    // Auto-load data for each tab
    if (tab === "dashboard") loadDashboard();
    else if (tab === "players") loadPlayers();
    else if (tab === "accounts") loadAccounts();
    else if (tab === "characters") loadCharacters();
    else if (tab === "maps") loadMaps();
  });
});

/* ── Login ─────────────────────────────────────────────────── */

async function attemptLogin() {
  adminKey = document.getElementById("admin-key").value.trim();
  if (!adminKey) return;
  try {
    await api("GET", "/admin/api/stats");
    // Load quest definitions for human-readable names
    try { questDefs = await (await fetch("/data/quests.json")).json(); } catch (_) {}
    document.getElementById("login-overlay").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    loadDashboard();
  } catch (err) {
    document.getElementById("login-error").textContent = "Invalid admin key.";
    document.getElementById("login-error").classList.remove("hidden");
  }
}

document.getElementById("login-btn").addEventListener("click", attemptLogin);
document.getElementById("admin-key").addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptLogin();
});

/* ── Dashboard ─────────────────────────────────────────────── */

async function loadDashboard() {
  try {
    const data = await api("GET", "/admin/api/stats");
    document.getElementById("stat-online").textContent = data.onlinePlayers;
    document.getElementById("stat-accounts").textContent = data.totalAccounts;
    document.getElementById("stat-characters").textContent = data.totalCharacters;
    document.getElementById("stat-sessions").textContent = data.activeSessions;
    document.getElementById("stat-gold").textContent = data.totalGold.toLocaleString();

    // Class distribution
    const classDiv = document.getElementById("class-dist");
    const total = data.classCounts.reduce((s, c) => s + c.cnt, 0) || 1;
    classDiv.innerHTML = data.classCounts.map(c => {
      const pct = ((c.cnt / total) * 100).toFixed(1);
      return `
        <div class="bar-row">
          <span class="bar-label">${capitalize(c.char_class)}</span>
          <div class="bar-track"><div class="bar-fill ${c.char_class}" style="width:${pct}%"></div></div>
          <span>${c.cnt} (${pct}%)</span>
        </div>`;
    }).join("");

    // Map population
    const mapDiv = document.getElementById("map-pop");
    if (Object.keys(data.mapPopulation).length === 0) {
      mapDiv.innerHTML = `<p style="color:var(--text-muted)">No players online.</p>`;
    } else {
      mapDiv.innerHTML = Object.entries(data.mapPopulation).map(([mapId, count]) => `
        <div class="bar-row">
          <span class="bar-label">${formatMapName(mapId)}</span>
          <span style="color:var(--gold);font-weight:600">${count}</span>
        </div>`).join("");
    }
  } catch (err) {
    toast("Failed to load dashboard: " + err.message, "error");
  }
}

/* ── Online Players ────────────────────────────────────────── */

async function loadPlayers() {
  try {
    const data = await api("GET", "/admin/api/players");
    const tbody = document.querySelector("#players-table tbody");
    const empty = document.getElementById("players-empty");

    if (data.players.length === 0) {
      tbody.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    tbody.innerHTML = data.players.map(p => `
      <tr>
        <td><strong>${esc(p.name)}</strong></td>
        <td>${capitalize(p.charClass)}</td>
        <td>${p.level}</td>
        <td>${formatMapName(p.mapId)}</td>
        <td>${p.x}, ${p.y}</td>
        <td>${p.hp}/${p.maxHp}</td>
        <td>${p.mana}/${p.maxMana}</td>
        <td>${p.gold}</td>
        <td><span class="badge ${p.dead ? "badge-dead" : "badge-alive"}">${p.dead ? "Dead" : "Alive"}</span></td>
        <td class="action-btns">
          <button class="btn-sm" onclick="showTeleportModal('${esc(p.id)}','${esc(p.name)}')">Teleport</button>
          <button class="btn-sm btn-success" onclick="revivePlayer('${esc(p.id)}')">Revive</button>
          <button class="btn-sm" onclick="showGrantXpModal('${esc(p.id)}','${esc(p.name)}')">XP</button>
          <button class="btn-sm" onclick="showSetGoldModal('${esc(p.id)}','${esc(p.name)}',${p.gold})">Gold</button>
          <button class="btn-sm" onclick="showWhisperModal('${esc(p.id)}','${esc(p.name)}')">Whisper</button>
          <button class="btn-sm btn-danger" onclick="kickPlayer('${esc(p.id)}','${esc(p.name)}')">Kick</button>
        </td>
      </tr>`).join("");
  } catch (err) {
    toast("Failed to load players: " + err.message, "error");
  }
}

async function kickPlayer(id, name) {
  if (!confirm(`Kick ${name}?`)) return;
  try {
    await api("POST", `/admin/api/players/${id}/kick`, { reason: "Kicked by admin." });
    toast(`Kicked ${name}`, "success");
    loadPlayers();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function revivePlayer(id) {
  try {
    await api("POST", `/admin/api/players/${id}/revive`);
    toast("Player revived", "success");
    loadPlayers();
  } catch (err) {
    toast(err.message, "error");
  }
}

let _mapSpawns = null;

async function showTeleportModal(playerId, name) {
  const [waystones, statsData] = await Promise.all([getWaystones(), api("GET", "/admin/api/stats")]);
  const allMaps = statsData.maps || [];
  _mapSpawns = statsData.mapSpawns || {};
  const firstSpawn = _mapSpawns[allMaps[0]] || { tx: 0, ty: 0 };
  const wsOptions = waystones.map(w =>
    `<option value='${esc(JSON.stringify(w))}'>${esc(w.statueName)} (${formatMapName(w.mapId)}) [${w.tx}, ${w.ty}]</option>`
  ).join("");

  openModal(`Teleport ${name}`, `
    <label>Waystone</label>
    <select id="tp-waystone" onchange="onTpWaystoneChange()">
      <option value="">— Custom Location —</option>
      ${wsOptions}
    </select>
    <label>Map</label>
    <select id="tp-map" onchange="onTpMapChange()">${allMaps.map(m =>
      `<option value="${m}">${formatMapName(m)}</option>`).join("")}
    </select>
    <label>Tile X</label>
    <input type="number" id="tp-x" value="${firstSpawn.tx}" min="0">
    <label>Tile Y</label>
    <input type="number" id="tp-y" value="${firstSpawn.ty}" min="0">
    <button class="btn" onclick="doTeleport('${esc(playerId)}')">Teleport</button>
  `);
}

function onTpWaystoneChange() {
  const val = document.getElementById("tp-waystone").value;
  if (!val) { onTpMapChange(); return; }
  const ws = JSON.parse(val);
  document.getElementById("tp-map").value = ws.mapId;
  document.getElementById("tp-x").value = ws.tx;
  document.getElementById("tp-y").value = ws.ty;
}

function onTpMapChange() {
  const mapId = document.getElementById("tp-map").value;
  const spawn = _mapSpawns && _mapSpawns[mapId];
  if (spawn) {
    document.getElementById("tp-x").value = spawn.tx;
    document.getElementById("tp-y").value = spawn.ty;
  }
  document.getElementById("tp-waystone").value = "";
}

async function doTeleport(playerId) {
  const mapId = document.getElementById("tp-map").value;
  const tileX = Number(document.getElementById("tp-x").value);
  const tileY = Number(document.getElementById("tp-y").value);
  try {
    await api("POST", `/admin/api/players/${playerId}/teleport`, { mapId, tileX, tileY });
    toast("Player teleported", "success");
    closeModal();
    loadPlayers();
  } catch (err) {
    toast(err.message, "error");
  }
}

function showGrantXpModal(playerId, name) {
  openModal(`Grant XP to ${name}`, `
    <label>XP Amount</label>
    <input type="number" id="xp-amount" value="100" min="0">
    <button class="btn" onclick="doGrantXp('${esc(playerId)}')">Grant XP</button>
  `);
}

async function doGrantXp(playerId) {
  const amount = Number(document.getElementById("xp-amount").value);
  try {
    const data = await api("POST", `/admin/api/players/${playerId}/grantxp`, { amount });
    toast(`Granted ${amount} XP (now level ${data.level})`, "success");
    closeModal();
    loadPlayers();
  } catch (err) {
    toast(err.message, "error");
  }
}

function showWhisperModal(playerId, name) {
  openModal(`Whisper to ${name}`, `
    <label>Message</label>
    <input type="text" id="whisper-msg" placeholder="Type a message..." maxlength="500">
    <button class="btn" onclick="doWhisper('${esc(playerId)}','${esc(name)}')">Send Whisper</button>
  `);
  setTimeout(() => document.getElementById("whisper-msg")?.focus(), 50);
}

async function doWhisper(playerId, name) {
  const text = (document.getElementById("whisper-msg").value || "").trim();
  if (!text) return;
  try {
    await api("POST", `/admin/api/players/${playerId}/whisper`, { message: text });
    toast(`Whispered to ${name}`, "success");
    document.getElementById("whisper-msg").value = "";
    document.getElementById("whisper-msg").focus();
  } catch (err) {
    toast(err.message, "error");
  }
}

function showSetGoldModal(playerId, name, currentGold) {
  openModal(`Set Gold for ${name}`, `
    <label>Gold Amount (current: ${currentGold})</label>
    <input type="number" id="gold-amount" value="${currentGold}" min="0">
    <button class="btn" onclick="doSetGold('${esc(playerId)}')">Set Gold</button>
  `);
}

async function doSetGold(playerId) {
  const amount = Number(document.getElementById("gold-amount").value);
  try {
    await api("POST", `/admin/api/players/${playerId}/setgold`, { amount });
    toast(`Gold set to ${amount}`, "success");
    closeModal();
    loadPlayers();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ── Accounts ──────────────────────────────────────────────── */

async function loadAccounts() {
  try {
    const data = await api("GET", "/admin/api/accounts");
    const tbody = document.querySelector("#accounts-table tbody");
    tbody.innerHTML = data.accounts.map(a => `
      <tr>
        <td><strong>${esc(a.username)}</strong></td>
        <td>${formatDate(a.createdAt)}</td>
        <td class="action-btns">
          <button class="btn-sm" onclick="viewAccountChars('${esc(a.username)}')">Characters</button>
        </td>
      </tr>`).join("");
  } catch (err) {
    toast("Failed to load accounts: " + err.message, "error");
  }
}

async function viewAccountChars(username) {
  try {
    const data = await api("GET", `/admin/api/accounts/${encodeURIComponent(username)}/characters`);
    const rows = data.characters.map(c => `
      <tr>
        <td>${c.id}</td>
        <td>${esc(c.name)}</td>
        <td>${capitalize(c.charClass)}</td>
        <td>${c.level}</td>
        <td>${c.gold}</td>
      </tr>`).join("") || `<tr><td colspan="5" style="color:var(--text-muted)">No characters.</td></tr>`;

    openModal(`Characters – ${username}`, `
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Class</th><th>Level</th><th>Gold</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ── Characters ────────────────────────────────────────────── */

// Cache for items catalog and waystones
let _itemsCatalog = null;
let _waystones = null;

async function getItemsCatalog() {
  if (!_itemsCatalog) {
    const data = await api("GET", "/admin/api/items");
    _itemsCatalog = data.items;
  }
  return _itemsCatalog;
}

async function getWaystones() {
  if (!_waystones) {
    const data = await api("GET", "/admin/api/waystones");
    _waystones = data.waystones;
  }
  return _waystones;
}

async function loadCharacters() {
  try {
    const data = await api("GET", "/admin/api/characters");
    const tbody = document.querySelector("#characters-table tbody");
    tbody.innerHTML = data.characters.map(c => `
      <tr>
        <td>${c.id}</td>
        <td><strong>${esc(c.name)}</strong></td>
        <td>${capitalize(c.charClass)}</td>
        <td>${c.level}</td>
        <td>${c.gold}</td>
        <td>${esc(c.username)}</td>
        <td class="action-btns">
          <button class="btn-sm" onclick="viewCharacterDetail(${c.id})">View</button>
          <button class="btn-sm" onclick="showEditCharModal(${c.id},'${esc(c.name)}')">Edit</button>
        </td>
      </tr>`).join("");
  } catch (err) {
    toast("Failed to load characters: " + err.message, "error");
  }
}

async function viewCharacterDetail(charId) {
  try {
    const [charData, items, waystones] = await Promise.all([
      api("GET", `/admin/api/characters/${charId}`),
      getItemsCatalog(),
      getWaystones()
    ]);
    const c = charData.character;
    const equipNames = Object.entries(c.equipment)
      .filter(([, v]) => v)
      .map(([slot, item]) => `<strong>${capitalize(slot)}:</strong> ${esc(item.name || item.id)}`)
      .join("<br>") || "None";

    const stateLabels = { active: "In Progress", ready_to_turn_in: "Ready to Turn In", completed: "Completed" };
    const questList = Object.entries(c.quests)
      .map(([qid, st]) => {
        const name = (questDefs[qid] && questDefs[qid].name) || qid;
        const label = stateLabels[st.state] || st.state || "Unknown";
        return `<strong>${esc(name)}</strong>: ${esc(label)}`;
      })
      .join("<br>") || "None";

    const invCount = c.inventory.filter(i => i !== null).length;
    const bankCount = c.bank.filter(i => i !== null).length;

    // Gathering skills
    const gs = c.gatheringSkills || {};
    const skillNames = ["mining", "logging", "fishing", "smelting", "milling", "cooking"];
    const gatheringRows = skillNames
      .filter(s => gs[s])
      .map(s => `<strong>${capitalize(s)}:</strong> Lv ${gs[s].level || 1} (${gs[s].xp || 0} XP)`)
      .join("<br>") || "None";

    // Waystone options
    const hsOptions = waystones.map(w =>
      `<option value='${esc(JSON.stringify(w))}' ${c.hearthstone && c.hearthstone.statueId === w.statueId ? "selected" : ""}>${esc(w.statueName)} (${formatMapName(w.mapId)})</option>`
    ).join("");

    openModal(`Character: ${c.name}`, `
      <div class="char-detail-grid">
        <span class="field-label">Name</span><span class="field-value">${esc(c.name)}</span>
        <span class="field-label">Class</span><span class="field-value">${capitalize(c.charClass)}</span>
        <span class="field-label">Level</span><span class="field-value">${c.level}</span>
        <span class="field-label">XP</span><span class="field-value">${c.xp}</span>
        <span class="field-label">Gold</span><span class="field-value">${c.gold}</span>
        <span class="field-label">HP</span><span class="field-value">${c.hp}</span>
        <span class="field-label">Mana</span><span class="field-value">${c.mana}</span>
        <span class="field-label">Map</span><span class="field-value">${formatMapName(c.mapId || "unknown")}</span>
        <span class="field-label">Position</span><span class="field-value">${c.posX ?? "—"}, ${c.posY ?? "—"} (floor ${c.floor || 0})</span>
        <span class="field-label">Account</span><span class="field-value">${esc(c.username)}</span>
        <span class="field-label">Created</span><span class="field-value">${formatDate(c.createdAt)}</span>
      </div>

      <h4 style="color:var(--gold);margin:16px 0 8px">Hearthstone</h4>
      <div class="hs-row">
        <select id="hs-select">
          <option value="null" ${!c.hearthstone ? "selected" : ""}>Not attuned</option>
          ${hsOptions}
        </select>
        <button class="btn-sm" onclick="doSetHearthstone(${charId})">Set</button>
      </div>

      <h4 style="color:var(--gold);margin:16px 0 8px">Equipment</h4>
      <div style="font-size:13px">${equipNames}</div>

      <h4 style="color:var(--gold);margin:16px 0 8px">Inventory (${invCount}/20)
        <button class="btn-sm" style="margin-left:8px" onclick="showAddItemModal(${charId},'inventory')">+ Add Item</button>
      </h4>
      <div class="slot-grid" id="inv-grid-${charId}">
        ${renderSlotGrid(c.inventory, 20, charId, "inventory")}
      </div>

      <h4 style="color:var(--gold);margin:16px 0 8px">Bank (${bankCount}/48)
        <button class="btn-sm" style="margin-left:8px" onclick="showAddItemModal(${charId},'bank')">+ Add Item</button>
      </h4>
      <div class="slot-grid" id="bank-grid-${charId}">
        ${renderSlotGrid(c.bank, 48, charId, "bank")}
      </div>

      <h4 style="color:var(--gold);margin:16px 0 8px">Gathering Skills</h4>
      <div style="font-size:13px">${gatheringRows}</div>

      <h4 style="color:var(--gold);margin:16px 0 8px">Quests</h4>
      <div style="font-size:13px">${questList}</div>
    `);

    // Store character data for mutations
    window._editChar = c;
  } catch (err) {
    toast(err.message, "error");
  }
}

function renderSlotGrid(slots, maxSlots, charId, storageType) {
  // Pad to maxSlots
  const padded = [...slots];
  while (padded.length < maxSlots) padded.push(null);

  return padded.map((item, i) => {
    if (!item) {
      return `<div class="slot empty" title="Slot ${i} (empty)"></div>`;
    }
    const label = item.name || item.id || "???";
    const qty = item.qty ? ` x${item.qty}` : "";
    return `<div class="slot filled" title="${esc(label)}${qty}\nSlot ${i}" onclick="showSlotActions(${charId},'${storageType}',${i})">
      <span class="slot-name">${esc(label.length > 8 ? label.slice(0, 7) + "…" : label)}</span>
      ${item.qty ? `<span class="slot-qty">${item.qty}</span>` : ""}
    </div>`;
  }).join("");
}

function showSlotActions(charId, storageType, index) {
  const c = window._editChar;
  const slots = storageType === "inventory" ? c.inventory : c.bank;
  const padded = [...slots];
  const maxSlots = storageType === "inventory" ? 20 : 48;
  while (padded.length < maxSlots) padded.push(null);
  const item = padded[index];
  if (!item) return;

  const label = item.name || item.id;
  const details = Object.entries(item)
    .filter(([k]) => !["icon"].includes(k))
    .map(([k, v]) => `<strong>${esc(k)}:</strong> ${esc(typeof v === "object" ? JSON.stringify(v) : String(v))}`)
    .join("<br>");

  openModal(`Slot ${index}: ${label}`, `
    <div style="font-size:13px;margin-bottom:16px;line-height:1.6">${details}</div>
    ${item.qty ? `
      <label>Set Quantity</label>
      <input type="number" id="slot-qty" value="${item.qty}" min="1" max="${item.stackSize || 99}">
      <button class="btn-sm" onclick="doSetSlotQty(${charId},'${storageType}',${index})">Update Qty</button>
      <hr style="border-color:var(--border);margin:12px 0">
    ` : ""}
    <button class="btn-sm btn-danger" onclick="doRemoveSlot(${charId},'${storageType}',${index})">Remove Item</button>
  `);
}

async function doSetSlotQty(charId, storageType, index) {
  const c = window._editChar;
  const slots = storageType === "inventory" ? [...c.inventory] : [...c.bank];
  const maxSlots = storageType === "inventory" ? 20 : 48;
  while (slots.length < maxSlots) slots.push(null);

  const qty = Math.max(1, Number(document.getElementById("slot-qty").value) || 1);
  slots[index] = { ...slots[index], qty };

  try {
    await api("POST", `/admin/api/characters/${charId}/${storageType}`, { [storageType]: slots });
    toast("Quantity updated", "success");
    closeModal();
    viewCharacterDetail(charId);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function doRemoveSlot(charId, storageType, index) {
  const c = window._editChar;
  const slots = storageType === "inventory" ? [...c.inventory] : [...c.bank];
  const maxSlots = storageType === "inventory" ? 20 : 48;
  while (slots.length < maxSlots) slots.push(null);

  slots[index] = null;

  try {
    await api("POST", `/admin/api/characters/${charId}/${storageType}`, { [storageType]: slots });
    toast("Item removed", "success");
    closeModal();
    viewCharacterDetail(charId);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function showAddItemModal(charId, storageType) {
  const items = await getItemsCatalog();
  const sorted = Object.values(items).sort((a, b) => a.name.localeCompare(b.name));
  const typeGroups = {};
  for (const item of sorted) {
    const t = item.type || "other";
    if (!typeGroups[t]) typeGroups[t] = [];
    typeGroups[t].push(item);
  }

  const options = Object.entries(typeGroups).map(([type, list]) =>
    `<optgroup label="${capitalize(type)}">${list.map(i =>
      `<option value="${esc(i.id)}">${esc(i.name)}${i.stackSize ? " (stackable)" : ""}</option>`
    ).join("")}</optgroup>`
  ).join("");

  openModal(`Add Item to ${capitalize(storageType)}`, `
    <label>Item</label>
    <select id="add-item-select">${options}</select>
    <label>Quantity (for stackable items)</label>
    <input type="number" id="add-item-qty" value="1" min="1" max="99">
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn" onclick="doAddItem(${charId},'${storageType}')">Add Item</button>
      <button class="btn" onclick="viewCharacterDetail(${charId})">Back</button>
    </div>
  `);
}

async function doAddItem(charId, storageType) {
  const itemId = document.getElementById("add-item-select").value;
  const qty = Math.max(1, Number(document.getElementById("add-item-qty").value) || 1);
  const items = await getItemsCatalog();
  const template = items[itemId];
  if (!template) { toast("Item not found", "error"); return; }

  const c = window._editChar;
  const slots = storageType === "inventory" ? [...c.inventory] : [...c.bank];
  const maxSlots = storageType === "inventory" ? 20 : 48;
  while (slots.length < maxSlots) slots.push(null);

  // Build item object
  const newItem = { ...template };
  if (template.stackSize) newItem.qty = qty;

  // Try to stack onto existing slot first
  let placed = false;
  if (template.stackSize) {
    for (let i = 0; i < maxSlots; i++) {
      if (slots[i] && slots[i].id === itemId) {
        const room = (template.stackSize || 99) - (slots[i].qty || 0);
        if (room >= qty) {
          slots[i] = { ...slots[i], qty: (slots[i].qty || 0) + qty };
          placed = true;
          break;
        }
      }
    }
  }
  // Otherwise find empty slot
  if (!placed) {
    const emptyIdx = slots.findIndex(s => s === null);
    if (emptyIdx === -1) { toast(`${capitalize(storageType)} is full`, "error"); return; }
    slots[emptyIdx] = newItem;
  }

  try {
    await api("POST", `/admin/api/characters/${charId}/${storageType}`, { [storageType]: slots });
    // Update cached character data so subsequent adds use the latest slots
    if (storageType === "inventory") window._editChar.inventory = slots;
    else window._editChar.bank = slots;
    toast(`Added ${template.name}`, "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function doSetHearthstone(charId) {
  const val = document.getElementById("hs-select").value;
  const hs = val === "null" ? null : JSON.parse(val);

  try {
    await api("POST", `/admin/api/characters/${charId}/hearthstone`, { hearthstone: hs });
    toast(hs ? `Hearthstone set to ${hs.statueName}` : "Hearthstone cleared", "success");
    // Refresh the detail view
    viewCharacterDetail(charId);
  } catch (err) {
    toast(err.message, "error");
  }
}

function showEditCharModal(charId, name) {
  openModal(`Edit: ${name}`, `
    <label>Level</label>
    <input type="number" id="edit-level" min="1" placeholder="Leave blank to keep unchanged">
    <label>Gold</label>
    <input type="number" id="edit-gold" min="0" placeholder="Leave blank to keep unchanged">
    <label>XP</label>
    <input type="number" id="edit-xp" min="0" placeholder="Leave blank to keep unchanged">
    <label>HP</label>
    <input type="number" id="edit-hp" min="0" placeholder="Leave blank to keep unchanged">
    <label>Mana</label>
    <input type="number" id="edit-mana" min="0" placeholder="Leave blank to keep unchanged">
    <button class="btn" onclick="doEditChar(${charId})">Save Changes</button>
  `);
}

async function doEditChar(charId) {
  const changes = {};
  const level = document.getElementById("edit-level").value;
  const gold = document.getElementById("edit-gold").value;
  const xp = document.getElementById("edit-xp").value;
  const hp = document.getElementById("edit-hp").value;
  const mana = document.getElementById("edit-mana").value;
  if (level !== "") changes.level = Number(level);
  if (gold !== "") changes.gold = Number(gold);
  if (xp !== "") changes.xp = Number(xp);
  if (hp !== "") changes.hp = Number(hp);
  if (mana !== "") changes.mana = Number(mana);

  if (Object.keys(changes).length === 0) {
    toast("No changes specified", "info");
    return;
  }

  try {
    const result = await api("POST", `/admin/api/characters/${charId}/edit`, changes);
    toast(`Character updated (${result.online ? "online" : "offline"})`, "success");
    closeModal();
    loadCharacters();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ── Maps ──────────────────────────────────────────────────── */

async function loadMaps() {
  try {
    const data = await api("GET", "/admin/api/stats");
    const mapsList = document.getElementById("maps-list");
    mapsList.innerHTML = data.maps.map(mapId => {
      const pop = data.mapPopulation[mapId] || 0;
      const info = (data.mapInfo && data.mapInfo[mapId]) || {};
      return `
        <div class="map-card">
          <h4>${formatMapName(mapId)}</h4>
          <div class="map-stat">ID: ${mapId}</div>
          <div class="map-stat">Size: ${info.width || "?"}×${info.height || "?"} tiles</div>
          <div class="map-stat">Players: ${pop}</div>
          <div class="map-stat">Enemies: ${info.enemyCount ?? "?"}</div>
          <div class="map-stat">Resource Nodes: ${info.activeResourceNodes ?? "?"}/${info.resourceNodeCount ?? "?"} active</div>
          <button class="btn-sm" onclick="viewMapEnemies('${esc(mapId)}')">View Enemies</button>
          <button class="btn-sm btn-success" onclick="respawnEnemies('${esc(mapId)}')">Respawn Dead</button>
        </div>`;
    }).join("");
  } catch (err) {
    toast("Failed to load maps: " + err.message, "error");
  }
}

async function viewMapEnemies(mapId) {
  try {
    const data = await api("GET", `/admin/api/maps/${mapId}/enemies`);
    const alive = data.enemies.filter(e => !e.dead).length;
    const dead = data.enemies.filter(e => e.dead).length;
    const rows = data.enemies.map(e => `
      <tr>
        <td>${esc(e.name)}</td>
        <td>${e.type}</td>
        <td>${e.hp}/${e.maxHp}</td>
        <td><span class="badge ${e.dead ? "badge-dead" : "badge-alive"}">${e.dead ? "Dead" : "Alive"}</span></td>
      </tr>`).join("");

    openModal(`Enemies – ${formatMapName(mapId)}`, `
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">
        Total: ${data.enemies.length} | Alive: ${alive} | Dead: ${dead}
      </p>
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>HP</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function respawnEnemies(mapId) {
  try {
    const data = await api("POST", `/admin/api/maps/${mapId}/respawn-enemies`);
    toast(`Respawned ${data.respawned} enemies on ${formatMapName(mapId)}`, "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ── Tools ─────────────────────────────────────────────────── */

async function broadcastMessage() {
  const input = document.getElementById("broadcast-msg");
  const message = input.value.trim();
  if (!message) return;
  try {
    await api("POST", "/admin/api/broadcast", { message });
    toast("Message broadcast to all players", "success");
    input.value = "";
  } catch (err) {
    toast(err.message, "error");
  }
}

async function saveAll() {
  try {
    await api("POST", "/admin/api/save-all");
    toast("All players saved", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ── Helpers ───────────────────────────────────────────────── */

function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function formatMapName(id) {
  return id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(epoch) {
  if (!epoch) return "—";
  return new Date(epoch).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric"
  });
}
