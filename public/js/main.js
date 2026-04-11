import { ScreenManager } from "./screens/ScreenManager.js";
import { Game } from "./core/Game.js";

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

  game.init().catch(err => console.error("Game init failed:", err));
};