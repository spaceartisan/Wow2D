export class InputSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = {
      x: 0,
      y: 0,
      worldX: 0,
      worldY: 0,
      leftClicked: false
    };

    this._onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (!this.keys.has(key)) {
        this.justPressed.add(key);
      }
      this.keys.add(key);
    };

    this._onKeyUp = (event) => {
      this.keys.delete(event.key.toLowerCase());
    };

    this._onMouseMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouse.x = (event.clientX - rect.left) * scaleX;
      this.mouse.y = (event.clientY - rect.top) * scaleY;
    };

    this._onMouseDown = (event) => {
      if (event.button === 0) {
        this.mouse.leftClicked = true;
      }
    };

    this._onBlur = () => {
      this.keys.clear();
      this.justPressed.clear();
      this.mouse.leftClicked = false;
    };

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    canvas.addEventListener("mousemove", this._onMouseMove);
    canvas.addEventListener("mousedown", this._onMouseDown);
    window.addEventListener("blur", this._onBlur);
  }

  destroy() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this.canvas.removeEventListener("mousemove", this._onMouseMove);
    this.canvas.removeEventListener("mousedown", this._onMouseDown);
    window.removeEventListener("blur", this._onBlur);
  }

  isDown(...keys) {
    return keys.some((key) => this.keys.has(key));
  }

  wasPressed(...keys) {
    return keys.some((key) => this.justPressed.has(key));
  }

  endFrame() {
    this.justPressed.clear();
    this.mouse.leftClicked = false;
  }
}