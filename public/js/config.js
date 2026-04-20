/* Gameplay constants — shared with server via public/data/playerBase.json */

// Fetch is async; for simplicity we keep the import synchronous and just
// ensure the JSON stays in sync.  The server reads the same file at startup.
let _pb;
try {
  _pb = await fetch("/data/playerBase.json").then(r => {
    if (!r.ok) throw new Error(`playerBase.json HTTP ${r.status}`);
    return r.json();
  });
} catch (e) {
  console.error("Failed to load playerBase.json:", e);
  _pb = { defaults: {}, classes: {} };
}

export const PLAYER_BASE_DATA = _pb;
export const CLASSES = _pb.classes || {};

// Helper: resolve a class's effective stat (class override → defaults fallback)
export function classStats(classId) {
  const cls = CLASSES[classId] || {};
  return { ..._pb.defaults, ...cls };
}

// Backward compat: PLAYER_BASE points to defaults
export const PLAYER_BASE = _pb.defaults;

/* ── Theme / branding — loaded from public/data/theme.json ── */
let _theme;
try {
  _theme = await fetch("/data/theme.json").then(r => {
    if (!r.ok) throw new Error(`theme.json HTTP ${r.status}`);
    return r.json();
  });
} catch (e) {
  console.error("Failed to load theme.json:", e);
  _theme = {};
}
export const THEME = _theme;

/** Apply theme.json CSS custom-properties + login-specific overrides to :root */
export function applyTheme() {
  const root = document.documentElement.style;
  const c = _theme.ui?.colors || {};
  const login = _theme.ui?.login || {};

  // Map camelCase color keys → CSS custom-property names
  const colorMap = {
    bgDark: "--bg-dark", panelBg: "--panel-bg", panelBgSolid: "--panel-bg-solid",
    panelBorder: "--panel-border", panelBorderDim: "--panel-border-dim",
    accentGold: "--accent-gold", accentGoldBright: "--accent-gold-bright",
    textMain: "--text-main", textMuted: "--text-muted", textBright: "--text-bright",
    hp: "--hp", hpGrad: "--hp-grad", mana: "--mana", manaGrad: "--mana-grad",
    xp: "--xp", xpGrad: "--xp-grad", enemy: "--enemy",
    btnBg: "--btn-bg", btnBorder: "--btn-border", btnHover: "--btn-hover",
    danger: "--danger", success: "--success"
  };
  for (const [key, prop] of Object.entries(colorMap)) {
    if (c[key] !== undefined) root.setProperty(prop, c[key]);
  }

  // Global UI overrides
  if (_theme.ui?.borderRadius) root.setProperty("--radius", _theme.ui.borderRadius);
  if (_theme.ui?.fontFamily) document.body.style.fontFamily = _theme.ui.fontFamily;

  // Login-screen overrides
  const loginContainer = document.querySelector(".login-container");
  if (loginContainer && login.containerBorderRadius) loginContainer.style.borderRadius = login.containerBorderRadius;
  if (loginContainer && login.containerPadding) loginContainer.style.padding = login.containerPadding;

  const backdrop = document.querySelector(".login-backdrop");
  if (backdrop && login.backdropGradient) backdrop.style.background = login.backdropGradient;

  const logoH1 = document.querySelector(".logo-title h1");
  if (logoH1 && login.titleFontSize) logoH1.style.fontSize = login.titleFontSize;

  const taglineEl = document.querySelector(".tagline");
  if (taglineEl && login.taglineFontSize) taglineEl.style.fontSize = login.taglineFontSize;

  // Apply login button / input sizing
  document.querySelectorAll(".auth-form .form-group input").forEach(el => {
    if (login.inputFontSize) el.style.fontSize = login.inputFontSize;
    if (login.inputBorderRadius) el.style.borderRadius = login.inputBorderRadius;
    if (login.inputPadding) el.style.padding = login.inputPadding;
  });
  document.querySelectorAll(".auth-form .btn-primary, .auth-form .btn-secondary").forEach(el => {
    if (login.buttonFontSize) el.style.fontSize = login.buttonFontSize;
    if (login.buttonBorderRadius) el.style.borderRadius = login.buttonBorderRadius;
    if (login.buttonPadding) el.style.padding = login.buttonPadding;
  });

  // Text content driven by theme
  document.title = `${_theme.gameName || "Game"} - ${_theme.gameSubtitle || ""}`;
  const h1 = document.querySelector(".logo-title h1");
  if (h1) h1.textContent = _theme.gameName || "Game";
  const tag = document.querySelector(".tagline");
  if (tag) tag.textContent = _theme.tagline || "";
  const glyph = document.querySelector(".logo-glyph");
  if (glyph && _theme.logoGlyph) glyph.src = _theme.logoGlyph;
  const footer = document.querySelector(".login-footer");
  if (footer) footer.textContent = _theme.versionText || "";

  // Character-select screen text
  const csTitle = document.querySelector(".charselect-title");
  if (csTitle) csTitle.textContent = _theme.charSelectTitle || "Choose Your Champion";
  const ccTitle = document.querySelector(".char-create-panel h3");
  if (ccTitle) ccTitle.textContent = _theme.createCharTitle || "Create Character";
}