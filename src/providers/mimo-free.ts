// ============================================================
// MiMo Free Provider - Anonymous free AI model access
// ============================================================
// Uses Xiaomi's free bootstrap API to get a JWT token,
// then proxies requests through their OpenAI-compatible endpoint.
// No API key required - uses device fingerprint authentication.

import crypto from "crypto";
import os from "os";
import path from "path";
import fs from "fs";

const DEFAULT_BASE_URL = "https://api.xiaomimimo.com";
const BOOTSTRAP_URL = `${DEFAULT_BASE_URL}/api/free-ai/bootstrap`;
const CHAT_BASE_URL = `${DEFAULT_BASE_URL}/api/free-ai/openai`;

// --- Client Fingerprint ---
// Generated from system info, cached on disk
let fingerprintCache: string | undefined;

function getDataDir(): string {
  const xdgData = process.env.XDG_DATA_HOME;
  if (xdgData) return path.join(xdgData, "omagent");
  return path.join(os.homedir(), ".local", "share", "omagent");
}

function getClientFingerprint(): string {
  if (fingerprintCache) return fingerprintCache;

  const file = path.join(getDataDir(), "mimo-free-client");
  try {
    const existing = fs.readFileSync(file, "utf-8").trim();
    if (existing) {
      fingerprintCache = existing;
      return existing;
    }
  } catch {}

  const cpu = os.cpus()[0]?.model ?? "unknown-cpu";
  const username = (() => {
    try { return os.userInfo().username; } catch { return "unknown-user"; }
  })();
  const seed = [os.hostname(), process.platform, process.arch, cpu, username].join("|");
  const fingerprint = crypto.createHash("sha256").update(seed).digest("hex");

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, fingerprint, { mode: 0o600 });
  } catch {}

  fingerprintCache = fingerprint;
  return fingerprint;
}

// --- JWT Management ---
let cachedJwt: { jwt: string; exp: number } | null = null;
let inflight: Promise<{ jwt: string; exp: number }> | null = null;

function parseExp(jwt: string): number {
  const parts = jwt.split(".");
  if (parts.length < 2) return Date.now() + 50 * 60_000;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch {}
  return Date.now() + 50 * 60_000;
}

async function bootstrap(): Promise<{ jwt: string; exp: number }> {
  const res = await fetch(BOOTSTRAP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client: getClientFingerprint() }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MiMo Free bootstrap failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { jwt?: string };
  if (!data.jwt) throw new Error("MiMo Free bootstrap response missing jwt");

  return { jwt: data.jwt, exp: parseExp(data.jwt) };
}

const JWT_REFRESH_BUFFER_MS = 5 * 60_000;

async function getJwt(): Promise<string> {
  if (cachedJwt && cachedJwt.exp - Date.now() > JWT_REFRESH_BUFFER_MS) {
    return cachedJwt.jwt;
  }
  if (inflight) return (await inflight).jwt;

  cachedJwt = null;
  inflight = bootstrap();
  try {
    cachedJwt = await inflight;
    return cachedJwt.jwt;
  } finally {
    inflight = null;
  }
}

// --- Chat API ---
export interface MiMoFreeMessage {
  role: "system" | "user" | "assistant";
  content: string | null;
}

export interface MiMoFreeResponse {
  content: string | null;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface MiMoFreeStreamChunk {
  type: "text" | "done";
  content?: string;
}

async function chatRequest(
  messages: MiMoFreeMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  }
): Promise<Response> {
  const jwt = await getJwt();

  const body = {
    model: options?.model || "mimo-auto",
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4096,
    stream: options?.stream ?? false,
  };

  const res = await fetch(CHAT_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`,
      "X-Mimo-Source": "omagent-cli-free",
    },
    body: JSON.stringify(body),
  });

  // If 401/403, refresh JWT and retry
  if (res.status === 401 || res.status === 403) {
    cachedJwt = null;
    const retryJwt = await getJwt();
    return fetch(CHAT_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${retryJwt}`,
        "X-Mimo-Source": "omagent-cli-free",
      },
      body: JSON.stringify(body),
    });
  }

  return res;
}

// --- Public API ---
export const MiMoFree = {
  baseUrl: DEFAULT_BASE_URL,
  chatUrl: CHAT_BASE_URL,
  bootstrapUrl: BOOTSTRAP_URL,

  fingerprint: () => getClientFingerprint(),

  async verify() {
    cachedJwt = null;
    const result = await bootstrap();
    cachedJwt = result;
    return { jwt: result.jwt, exp: result.exp, fingerprint: getClientFingerprint() };
  },

  async chat(
    messages: MiMoFreeMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number }
  ): Promise<MiMoFreeResponse> {
    const res = await chatRequest(messages, { ...options, stream: false });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`MiMo Free chat failed: ${res.status} ${err.slice(0, 200)}`);
    }
    return res.json() as Promise<MiMoFreeResponse>;
  },

  async *stream(
    messages: MiMoFreeMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number }
  ): AsyncGenerator<string> {
    const res = await chatRequest(messages, { ...options, stream: true });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`MiMo Free stream failed: ${res.status} ${err.slice(0, 200)}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {}
      }
    }
  },
};
