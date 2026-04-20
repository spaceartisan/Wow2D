/**
 * ScreenManager – handles login, register, character select/create flows,
 * then boots the game when the player enters the world.
 */
export class ScreenManager {
  constructor() {
    this.session = { username: null, token: null, characters: [] };
    this.selectedCharIndex = -1;
    this.onEnterWorld = null; // callback: (charData, credentials) => void
    this.onLogout = null;     // callback: () => void  (set by main.js)

    this.screens = {
      login: document.getElementById("screen-login"),
      charselect: document.getElementById("screen-charselect"),
      game: document.getElementById("screen-game")
    };

    this.bindLogin();
    this.bindCharSelect();
  }

  /* ── helpers ────────────────────────────────────────── */

  showScreen(name) {
    Object.values(this.screens).forEach((el) => el.classList.remove("active"));
    this.screens[name].classList.add("active");
  }

  async api(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  /* ═══════════════════════════════════════════════════════
     LOGIN / REGISTER
     ═══════════════════════════════════════════════════════ */

  bindLogin() {
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const showRegister = document.getElementById("show-register");
    const showLogin = document.getElementById("show-login");
    const loginError = document.getElementById("login-error");
    const registerError = document.getElementById("register-error");

    showRegister.addEventListener("click", () => {
      loginForm.classList.add("hidden");
      registerForm.classList.remove("hidden");
      registerError.textContent = "";
      document.getElementById("login-password").value = "";
    });

    showLogin.addEventListener("click", () => {
      registerForm.classList.add("hidden");
      loginForm.classList.remove("hidden");
      loginError.textContent = "";
      document.getElementById("reg-password").value = "";
      document.getElementById("reg-password2").value = "";
    });

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      loginError.textContent = "";
      const btn = loginForm.querySelector("button");
      if (btn) btn.disabled = true;

      const username = document.getElementById("login-username").value.trim();
      const password = document.getElementById("login-password").value;

      try {
        const data = await this.api("/api/login", { username, password });
        this.session = { username, token: data.token, characters: data.characters };
        // clear password from form
        document.getElementById("login-password").value = "";
        this.goToCharSelect();
      } catch (err) {
        loginError.textContent = err.message;
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      registerError.textContent = "";

      const username = document.getElementById("reg-username").value.trim();
      const password = document.getElementById("reg-password").value;
      const password2 = document.getElementById("reg-password2").value;

      if (password !== password2) {
        registerError.textContent = "Passwords do not match.";
        return;
      }

      const btn = registerForm.querySelector("button");
      if (btn) btn.disabled = true;

      try {
        await this.api("/api/register", { username, password });
        // auto-login after register
        const data = await this.api("/api/login", { username, password });
        this.session = { username, token: data.token, characters: data.characters };
        document.getElementById("reg-password").value = "";
        document.getElementById("reg-password2").value = "";
        this.goToCharSelect();
      } catch (err) {
        registerError.textContent = err.message;
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  /* ═══════════════════════════════════════════════════════
     CHARACTER SELECT / CREATE
     ═══════════════════════════════════════════════════════ */

  goToCharSelect() {
    this.selectedCharIndex = -1;
    this.showScreen("charselect");
    this.renderCharList();
  }

  async bindCharSelect() {
    const btnEnter = document.getElementById("btn-enter-world");
    const btnCreate = document.getElementById("btn-create-char");
    const btnDelete = document.getElementById("btn-delete-char");
    const btnLogout = document.getElementById("btn-logout");
    const createPanel = document.getElementById("char-create-panel");
    const createForm = document.getElementById("char-create-form");
    const cancelCreate = document.getElementById("btn-cancel-create");
    const createError = document.getElementById("char-create-error");

    // Load class definitions and build class picker dynamically
    if (!this._classesData) {
      const pb = await fetch("/data/playerBase.json").then(r => r.json());
      this._classesData = pb.classes || {};
    }
    const classPicker = document.querySelector(".class-picker");
    classPicker.textContent = "";
    let first = true;
    for (const [classId, classDef] of Object.entries(this._classesData)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "class-btn" + (first ? " selected" : "");
      btn.dataset.class = classId;
      btn.innerHTML = `<img class="class-icon" src="/assets/sprites/ui/${classDef.icon}" alt="${classDef.name}"><span class="class-label">${classDef.name}</span>`;
      classPicker.appendChild(btn);
      first = false;
    }

    const classBtns = classPicker.querySelectorAll(".class-btn");

    // class picker
    classBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        classBtns.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      });
    });

    btnCreate.addEventListener("click", () => {
      createPanel.classList.remove("hidden");
      createError.textContent = "";
      document.getElementById("char-name-input").value = "";
      document.getElementById("char-name-input").focus();
    });

    cancelCreate.addEventListener("click", () => {
      createPanel.classList.add("hidden");
    });

    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      createError.textContent = "";

      const charName = document.getElementById("char-name-input").value.trim();
      const charClass = document.querySelector(".class-btn.selected")?.dataset.class || "warrior";

      try {
        const data = await this.api("/api/characters/create", {
          token: this.session.token,
          charName,
          charClass
        });
        this.session.characters = data.characters;
        createPanel.classList.add("hidden");
        this.selectedCharIndex = this.session.characters.length - 1;
        this.renderCharList();
      } catch (err) {
        createError.textContent = err.message;
      }
    });

    btnDelete.addEventListener("click", async () => {
      if (this.selectedCharIndex < 0) return;
      const char = this.session.characters[this.selectedCharIndex];
      if (!confirm(`Delete ${char.name}? This cannot be undone.`)) return;

      try {
        const data = await this.api("/api/characters/delete", {
          token: this.session.token,
          charId: char.id
        });
        this.session.characters = data.characters;
        this.selectedCharIndex = -1;
        this.renderCharList();
      } catch (err) {
        alert(err.message);
      }
    });

    btnEnter.addEventListener("click", () => {
      if (this.selectedCharIndex < 0) return;
      const charData = this.session.characters[this.selectedCharIndex];
      this.showScreen("game");
      if (this.onEnterWorld) {
        this.onEnterWorld(charData, {
          username: this.session.username,
          token: this.session.token
        });
      }
    });

    btnLogout.addEventListener("click", () => {
      if (this.session.token) {
        this.api("/api/logout", { token: this.session.token }).catch(() => {});
      }
      this.session = { username: null, token: null, characters: [] };
      this.selectedCharIndex = -1;
      this.showScreen("login");
    });
  }

  renderCharList() {
    const list = document.getElementById("char-list");
    const btnEnter = document.getElementById("btn-enter-world");
    const btnDelete = document.getElementById("btn-delete-char");

    list.innerHTML = "";

    if (this.session.characters.length === 0) {
      list.innerHTML = '<div class="char-list-empty">No characters yet. Create one to begin.</div>';
      btnEnter.disabled = true;
      btnDelete.disabled = true;
      return;
    }

    this.session.characters.forEach((char, index) => {
      const card = document.createElement("div");
      card.className = "char-card" + (index === this.selectedCharIndex ? " selected" : "");

      const classInitial = (this._classesData[char.charClass]?.name || char.charClass).charAt(0).toUpperCase();
      const className = this._classesData[char.charClass]?.name || this.capitalize(char.charClass);

      card.innerHTML = `
        <div class="char-avatar ${char.charClass}">${classInitial}</div>
        <div class="char-info">
          <div class="char-info-name">${this.escapeHtml(char.name)}</div>
          <div class="char-info-detail">Level ${char.level} ${className}</div>
        </div>
      `;

      card.addEventListener("click", () => {
        this.selectedCharIndex = index;
        this.renderCharList();
      });

      list.appendChild(card);
    });

    btnEnter.disabled = this.selectedCharIndex < 0;
    btnDelete.disabled = this.selectedCharIndex < 0;
  }

  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  fullLogout() {
    if (this.session.token) {
      this.api("/api/logout", { token: this.session.token }).catch(() => {});
    }
    this.session = { username: null, token: null, characters: [] };
    this.selectedCharIndex = -1;
    this.showScreen("login");
  }
}
