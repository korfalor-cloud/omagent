// ============================================================
// TUI Renderer - Double-buffered terminal rendering
// ============================================================

import { cursor, screen } from "./ansi.js";

export interface Size {
  width: number;
  height: number;
}

function getTerminalSize(): Size {
  try {
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    return { width: cols, height: rows };
  } catch {
    return { width: 80, height: 24 };
  }
}

export class Renderer {
  private buffer: string[] = [];
  private prevBuffer: string[] = [];
  private size: Size;
  private started = false;
  private resizeHandler: (() => void) | null = null;

  constructor() {
    this.size = getTerminalSize();
    this.buffer = new Array(this.size.height).fill("");
  }

  getSize(): Size {
    return { ...this.size };
  }

  start(onResize?: () => void) {
    if (this.started) return;
    this.started = true;
    this.resizeHandler = onResize ?? null;

    process.stdout.write(screen.alternate());
    process.stdout.write(cursor.hide());
    process.stdout.write(screen.clear());

    process.stdout.on("resize", this.handleResize);
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    process.stdout.write(cursor.show());
    process.stdout.write(screen.normal());
    process.stdout.off("resize", this.handleResize);
  }

  private handleResize = () => {
    this.size = getTerminalSize();
    this.buffer = new Array(this.size.height).fill("");
    this.forceRedraw();
    this.resizeHandler?.();
  };

  // Set an entire row
  setRow(row: number, text: string) {
    if (row < 0 || row >= this.size.height) return;
    this.buffer[row] = text;
  }

  // Render a complete frame - batch all writes into a single stdout call
  render() {
    if (!this.started) return;

    let output = "";

    for (let row = 0; row < this.size.height; row++) {
      const current = this.buffer[row] ?? "";
      const prev = this.prevBuffer[row] ?? "";

      if (current !== prev) {
        output += cursor.moveTo(row + 1, 1);
        output += cursor.clearLine();
        output += current;
      }
    }

    if (output) {
      process.stdout.write(output);
    }

    this.prevBuffer = [...this.buffer];
  }

  // Clear the entire buffer
  clear() {
    for (let i = 0; i < this.size.height; i++) {
      this.buffer[i] = "";
    }
  }

  // Force a full redraw by clearing prev buffer
  forceRedraw() {
    this.prevBuffer = [];
  }
}
