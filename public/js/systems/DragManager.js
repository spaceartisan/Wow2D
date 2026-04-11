/**
 * DragManager — makes HUD panels draggable by their header / title bar.
 *
 * Usage:
 *   const drag = new DragManager(hudElement);
 *   drag.makeDraggable(panelEl, handleEl);   // or auto-detect
 *   drag.destroy();
 */
export class DragManager {
  constructor(container) {
    /** The #hud element — all coordinates are relative to this */
    this.container = container;
    this._panels = [];
    this._active = null; // { panel, handle, startX, startY, origLeft, origTop }
    this._topZ = 20;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);

    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);
  }

  /**
   * Register a panel as draggable.
   * @param {HTMLElement} panel  — the panel element (must be position:absolute inside #hud)
   * @param {HTMLElement} [handle] — the drag handle element (defaults to .panel-header or first h3/h4)
   */
  makeDraggable(panel, handle) {
    if (!handle) {
      handle = panel.querySelector(".panel-header") ||
               panel.querySelector("#chat-tabs") ||
               panel.querySelector("h3") ||
               panel.querySelector("h4") ||
               panel;
    }

    handle.style.cursor = "move";
    handle.classList.add("drag-handle");

    const onDown = (e) => {
      // Don't start drag on buttons, inputs, sliders, close buttons
      if (e.target.closest("button, input, select, textarea, .panel-close")) return;

      // Check if this panel is locked
      const entry = this._panels.find(p => p.panel === panel);
      if (entry && entry._locked) return;

      e.preventDefault();

      // Bring to front
      this._topZ += 1;
      panel.style.zIndex = this._topZ;

      // Get current computed position relative to container
      const containerRect = this.container.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      // Convert the panel's current visual position to left/top
      const currentLeft = panelRect.left - containerRect.left;
      const currentTop = panelRect.top - containerRect.top;

      this._active = {
        panel,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: currentLeft,
        origTop: currentTop
      };

      // Switch from any transform-based centering to explicit left/top
      panel.style.left = currentLeft + "px";
      panel.style.top = currentTop + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.transform = "none";
    };

    handle.addEventListener("mousedown", onDown);
    this._panels.push({ panel, handle, onDown });
  }

  _onMouseMove(e) {
    if (!this._active) return;

    const dx = e.clientX - this._active.startX;
    const dy = e.clientY - this._active.startY;

    const containerRect = this.container.getBoundingClientRect();
    const panel = this._active.panel;

    let newLeft = this._active.origLeft + dx;
    let newTop = this._active.origTop + dy;

    // Clamp to container bounds
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    newLeft = Math.max(0, Math.min(containerRect.width - pw, newLeft));
    newTop = Math.max(0, Math.min(containerRect.height - ph, newTop));

    panel.style.left = newLeft + "px";
    panel.style.top = newTop + "px";
  }

  _onMouseUp() {
    this._active = null;
  }

  /** Prevent a panel from being dragged */
  lockPanel(panel) {
    const entry = this._panels.find(p => p.panel === panel);
    if (entry) entry._locked = true;
  }

  /** Allow a panel to be dragged again */
  unlockPanel(panel) {
    const entry = this._panels.find(p => p.panel === panel);
    if (entry) entry._locked = false;
  }

  destroy() {
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);

    for (const { handle, onDown } of this._panels) {
      handle.removeEventListener("mousedown", onDown);
      handle.style.cursor = "";
      handle.classList.remove("drag-handle");
    }
    this._panels = [];
  }
}
