import { ScreenManager } from "./screens/ScreenManager.js";
import { Game } from "./core/Game.js";
import { applyTheme } from "./config.js";

applyTheme();

const screenManager = new ScreenManager();
let activeGame = null;

screenManager.onEnterWorld = (charData, credentials) => {
  // Destroy previous game if somehow still active
  if (activeGame) {
    activeGame.destroy();
    activeGame = null;
  }

  const canvas = document.getElementById("game-canvas");
  const game = new Game(canvas, charData, credentials);
  activeGame = game;

  // Set up logout callback so the game can return to character select
  game.onLogout = () => {
    if (activeGame === game) {
      activeGame = null;
    }
    screenManager.goToCharSelect();
  };

  // Full logout returns to login screen
  game.onLogoutFull = () => {
    if (activeGame === game) {
      activeGame = null;
    }
    screenManager.fullLogout();
  };

  game.init().catch(err => {
    console.error("Game init failed:", err);
    const hud = document.getElementById("hud");
    if (hud) {
      const msg = document.createElement("div");
      msg.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#ff4444;background:#111;padding:24px;border:1px solid #ff4444;border-radius:8px;z-index:9999;font-size:16px;text-align:center;";
      msg.textContent = "Failed to initialize game. Please refresh the page.";
      hud.appendChild(msg);
    }
  });
};