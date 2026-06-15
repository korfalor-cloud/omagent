// ============================================================
// ANSI Escape Code Utilities for OmAgent TUI
// ============================================================

const E = "\x1b";
export const ESC = E;

// --- Cursor Control ---
export const cursor = {
  hide: () => E + "[?25l",
  show: () => E + "[?25h",
  save: () => E + "[s",
  restore: () => E + "[u",
  moveTo: (row: number, col: number) => E + "[" + row + ";" + col + "H",
  up: (n = 1) => E + "[" + n + "A",
  down: (n = 1) => E + "[" + n + "B",
  forward: (n = 1) => E + "[" + n + "C",
  back: (n = 1) => E + "[" + n + "D",
  clearLine: () => E + "[2K",
  clearScreen: () => E + "[2J",
  clearToEnd: () => E + "[0J",
  clearToStart: () => E + "[1J",
  scrollUp: (n = 1) => E + "[" + n + "S",
  scrollDown: (n = 1) => E + "[" + n + "T",
};

// --- Colors (Foreground) ---
export const fg = {
  black: (s: string) => E + "[30m" + s + E + "[39m",
  red: (s: string) => E + "[31m" + s + E + "[39m",
  green: (s: string) => E + "[32m" + s + E + "[39m",
  yellow: (s: string) => E + "[33m" + s + E + "[39m",
  blue: (s: string) => E + "[34m" + s + E + "[39m",
  magenta: (s: string) => E + "[35m" + s + E + "[39m",
  cyan: (s: string) => E + "[36m" + s + E + "[39m",
  white: (s: string) => E + "[37m" + s + E + "[39m",
  gray: (s: string) => E + "[90m" + s + E + "[39m",
  brightRed: (s: string) => E + "[91m" + s + E + "[39m",
  brightGreen: (s: string) => E + "[92m" + s + E + "[39m",
  brightYellow: (s: string) => E + "[93m" + s + E + "[39m",
  brightBlue: (s: string) => E + "[94m" + s + E + "[39m",
  brightMagenta: (s: string) => E + "[95m" + s + E + "[39m",
  brightCyan: (s: string) => E + "[96m" + s + E + "[39m",
};

// --- Colors (Background) ---
export const bg = {
  black: (s: string) => E + "[40m" + s + E + "[49m",
  red: (s: string) => E + "[41m" + s + E + "[49m",
  green: (s: string) => E + "[42m" + s + E + "[49m",
  yellow: (s: string) => E + "[43m" + s + E + "[49m",
  blue: (s: string) => E + "[44m" + s + E + "[49m",
  magenta: (s: string) => E + "[45m" + s + E + "[49m",
  cyan: (s: string) => E + "[46m" + s + E + "[49m",
  white: (s: string) => E + "[47m" + s + E + "[49m",
  gray: (s: string) => E + "[100m" + s + E + "[49m",
};

// --- Styles ---
export const style = {
  bold: (s: string) => E + "[1m" + s + E + "[22m",
  dim: (s: string) => E + "[2m" + s + E + "[22m",
  italic: (s: string) => E + "[3m" + s + E + "[23m",
  underline: (s: string) => E + "[4m" + s + E + "[24m",
  inverse: (s: string) => E + "[7m" + s + E + "[27m",
  strikethrough: (s: string) => E + "[9m" + s + E + "[29m",
};

// --- 256-color & True Color ---
export const fg256 = (code: number, s: string) => E + "[38;5;" + code + "m" + s + E + "[39m";
export const bg256 = (code: number, s: string) => E + "[48;5;" + code + "m" + s + E + "[49m";
export const fgRgb = (r: number, g: number, b: number, s: string) =>
  E + "[38;2;" + r + ";" + g + ";" + b + "m" + s + E + "[39m";
export const bgRgb = (r: number, g: number, b: number, s: string) =>
  E + "[48;2;" + r + ";" + g + ";" + b + "m" + s + E + "[49m";

// --- Screen ---
export const screen = {
  alternate: () => E + "[?1049h",
  normal: () => E + "[?1049l",
  clear: () => E + "[2J" + E + "[H",
  setTitle: (title: string) => E + "]0;" + title + E + "\\",
};

// --- Strip ANSI codes from string ---
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g, "");
}

// --- Measure visible width (excluding ANSI codes) ---
export function visibleWidth(str: string): number {
  return stripAnsi(str).length;
}

// --- Pad to exact visible width ---
export function padRight(str: string, width: number): string {
  const vis = visibleWidth(str);
  if (vis >= width) return str;
  return str + " ".repeat(width - vis);
}

export function padLeft(str: string, width: number): string {
  const vis = visibleWidth(str);
  if (vis >= width) return str;
  return " ".repeat(width - vis) + str;
}

export function truncate(str: string, maxWidth: number): string {
  const vis = visibleWidth(str);
  if (vis <= maxWidth) return str;
  let result = "";
  let count = 0;
  for (let i = 0; i < str.length && count < maxWidth - 1; i++) {
    const char = str[i];
    if (char === E) {
      let seq = char;
      i++;
      while (i < str.length) {
        seq += str[i];
        if (str[i] >= "A" && str[i] <= "Z") break;
        if (str[i] >= "a" && str[i] <= "z") break;
        i++;
      }
      result += seq;
    } else {
      result += char;
      count++;
    }
  }
  return result + "\u2026";
}

// --- Word wrap ---
export function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (visibleWidth(rawLine) <= maxWidth) {
      lines.push(rawLine);
      continue;
    }
    const words = rawLine.split(" ");
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine ? currentLine + " " + word : word;
      if (visibleWidth(testLine) <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  return lines;
}

// --- Box drawing ---
const LINE = "\u2500";
const VLINE = "\u2502";
const TL = "\u250c";
const TR = "\u2510";
const BL = "\u2514";
const BR = "\u2518";

export const box = {
  top: (width: number) => TL + LINE.repeat(width - 2) + TR,
  bottom: (width: number) => BL + LINE.repeat(width - 2) + BR,
  line: (width: number) => VLINE + " ".repeat(width - 2) + VLINE,
  content: (text: string, width: number) => {
    const vis = visibleWidth(text);
    const inner = width - 2;
    if (vis >= inner) return VLINE + text + VLINE;
    return VLINE + text + " ".repeat(inner - vis) + VLINE;
  },
};

// --- Theme type ---
export interface Theme {
  name: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  border: string;
  borderActive: string;
  background: string;
  backgroundPanel: string;
  backgroundElement: string;
  backgroundMenu: string;
  diffAddedBg: string;
  diffRemovedBg: string;
  diffAdded: string;
  diffRemoved: string;
  lineNumber: string;
}

export const themes = {
  dark: {
    name: "dark",
    text: E + "[37m",
    textMuted: E + "[90m",
    textDim: E + "[2m" + E + "[90m",
    accent: E + "[96m",
    primary: E + "[94m",
    secondary: E + "[35m",
    success: E + "[92m",
    warning: E + "[93m",
    error: E + "[91m",
    info: E + "[94m",
    border: E + "[90m",
    borderActive: E + "[96m",
    background: "",
    backgroundPanel: E + "[48;5;235m",
    backgroundElement: E + "[48;5;236m",
    backgroundMenu: E + "[48;5;237m",
    diffAddedBg: E + "[48;2;0;40;0m",
    diffRemovedBg: E + "[48;2;40;0;0m",
    diffAdded: E + "[92m",
    diffRemoved: E + "[91m",
    lineNumber: E + "[90m",
  } as Theme,

  light: {
    name: "light",
    text: E + "[30m",
    textMuted: E + "[90m",
    textDim: E + "[2m" + E + "[37m",
    accent: E + "[34m",
    primary: E + "[36m",
    secondary: E + "[35m",
    success: E + "[32m",
    warning: E + "[33m",
    error: E + "[31m",
    info: E + "[34m",
    border: E + "[37m",
    borderActive: E + "[34m",
    background: E + "[47m",
    backgroundPanel: E + "[48;5;254m",
    backgroundElement: E + "[48;5;253m",
    backgroundMenu: E + "[48;5;252m",
    diffAddedBg: E + "[48;2;200;255;200m",
    diffRemovedBg: E + "[48;2;255;200;200m",
    diffAdded: E + "[32m",
    diffRemoved: E + "[31m",
    lineNumber: E + "[90m",
  } as Theme,
};

// Helper: apply theme color to text
export function themed(theme: Theme, color: keyof Theme, text: string): string {
  const code = theme[color] as string;
  if (!code) return text;
  return code + text + E + "[39m";
}
