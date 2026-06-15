// ============================================================
// Keyboard Input Handler for TUI
// ============================================================

export interface KeyEvent {
  name: string;      // key name: "a", "enter", "escape", "up", "down", etc.
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;  // raw sequence
  char?: string;     // printable character
}

type KeyHandler = (event: KeyEvent) => void;

const KEY_MAP: Record<string, string> = {
  "\r": "return",
  "\n": "return",
  "\x7f": "backspace",
  "\x1b[A": "up",
  "\x1b[B": "down",
  "\x1b[C": "right",
  "\x1b[D": "left",
  "\x1b[H": "home",
  "\x1b[F": "end",
  "\x1b[5~": "pageup",
  "\x1b[6~": "pagedown",
  "\x1b[3~": "delete",
  "\x1bOP": "f1",
  "\x1bOQ": "f2",
  "\x1bOR": "f3",
  "\x1bOS": "f4",
  "\x1b[15~": "f5",
  "\x1b[17~": "f6",
  "\x1b[18~": "f7",
  "\x1b[19~": "f8",
  "\x1b[20~": "f9",
  "\x1b[21~": "f10",
  "\x1b[23~": "f11",
  "\x1b[24~": "f12",
  "\t": "tab",
};

export class InputHandler {
  private handlers: KeyHandler[] = [];
  private dataHandler: (data: Buffer) => void;
  private endHandler: () => void;

  constructor() {
    this.dataHandler = (data: Buffer) => {
      const str = data.toString("utf8");
      const event = this.parseKey(str);
      if (event) {
        for (const handler of this.handlers) {
          handler(event);
        }
      }
    };

    this.endHandler = () => {
      for (const handler of this.handlers) {
        handler({ name: "eof", ctrl: false, meta: false, shift: false, sequence: "" });
      }
    };
  }

  onKey(handler: KeyHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  start() {
    if (process.stdin.isTTY) {
      (process.stdin as any).setRawMode?.(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", this.dataHandler);
    process.stdin.on("end", this.endHandler);
  }

  stop() {
    process.stdin.off("data", this.dataHandler);
    process.stdin.off("end", this.endHandler);
    if (process.stdin.isTTY) {
      (process.stdin as any).setRawMode?.(false);
    }
  }

  private parseKey(str: string): KeyEvent | null {
    // Check for mapped keys first
    if (KEY_MAP[str]) {
      return {
        name: KEY_MAP[str],
        ctrl: false,
        meta: false,
        shift: false,
        sequence: str,
      };
    }

    // Ctrl+C
    if (str === "\x03") {
      return { name: "c", ctrl: true, meta: false, shift: false, sequence: str };
    }

    // Ctrl+D
    if (str === "\x04") {
      return { name: "d", ctrl: true, meta: false, shift: false, sequence: str };
    }

    // Ctrl+L (clear)
    if (str === "\x0c") {
      return { name: "l", ctrl: true, meta: false, shift: false, sequence: str };
    }

    // Ctrl+letter combos (1-26)
    if (str.length === 1 && str.charCodeAt(0) >= 1 && str.charCodeAt(0) <= 26) {
      const letter = String.fromCharCode(str.charCodeAt(0) + 96);
      return {
        name: letter,
        ctrl: true,
        meta: false,
        shift: false,
        char: letter,
        sequence: str,
      };
    }

    // Escape sequences (multi-byte)
    if (str.startsWith("\x1b")) {
      // Alt+key
      if (str.length === 2 && str[1] !== "[") {
        return {
          name: str[1],
          ctrl: false,
          meta: true,
          shift: false,
          char: str[1],
          sequence: str,
        };
      }
      // CSI sequences
      if (str.startsWith("\x1b[")) {
        const mapped = KEY_MAP[str];
        if (mapped) {
          return {
            name: mapped,
            ctrl: false,
            meta: false,
            shift: false,
            sequence: str,
          };
        }
        return {
          name: "unknown",
          ctrl: false,
          meta: false,
          shift: false,
          sequence: str,
        };
      }
      // Other escape
      return {
        name: "escape",
        ctrl: false,
        meta: false,
        shift: false,
        sequence: str,
      };
    }

    // Printable character
    if (str.length === 1 && str.charCodeAt(0) >= 32) {
      return {
        name: str.toLowerCase(),
        ctrl: false,
        meta: false,
        shift: str !== str.toLowerCase(),
        char: str,
        sequence: str,
      };
    }

    // Unknown
    return {
      name: "unknown",
      ctrl: false,
      meta: false,
      shift: false,
      sequence: str,
    };
  }
}
