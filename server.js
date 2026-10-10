/**
 * Research desk — local server.
 *
 * Zero dependencies. Node 18 or newer.
 *   node server.js
 *
 * Holds the API key server-side, serves the interface, proxies model
 * calls, and keeps conversations in ./data/conversations.json.
 */

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const STORE = path.join(DATA_DIR, "conversations.json");

/* ------------------------------------------------------------------
   Configuration
------------------------------------------------------------------ */

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 4173);

function modelFor(id, fallback) {
  return process.env[`MODEL_${id.toUpperCase()}`] || process.env.MODEL || fallback;
}

function buildProviders() {
  return {
    anthropic: {
      kind: "anthropic",
      url: "https://api.anthropic.com/v1/messages",
      key: process.env.ANTHROPIC_API_KEY,
      model: modelFor("anthropic", "claude-sonnet-4-6"),
      keyName: "ANTHROPIC_API_KEY",
      label: "Anthropic",
      supportsPdf: true,
      supportsSearch: true,
    },
    gemini: {
      kind: "openai",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: process.env.GEMINI_API_KEY,
      model: modelFor("gemini", "gemini-2.0-flash"),
      keyName: "GEMINI_API_KEY",
      label: "Google Gemini",
      supportsPdf: false,
      supportsSearch: false,
    },
    openrouter: {
      kind: "openai",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY,
      model: modelFor("openrouter", "google/gemma-3-27b-it:free"),
      keyName: "OPENROUTER_API_KEY",
      label: "OpenRouter",
      supportsPdf: false,
      supportsSearch: false,
    },
    ollama: {
      kind: "openai",
      url: (process.env.OLLAMA_URL || "http://127.0.0.1:11434") + "/v1/chat/completions",
      key: "ollama",
      model: modelFor("ollama", "qwen2.5:14b"),
      keyName: null,
      label: "Ollama (offline)",
      supportsPdf: false,
      supportsSearch: false,
    },
    custom: {
      kind: "openai",
      url: (process.env.CUSTOM_BASE_URL || "http://127.0.0.1:8000/v1").replace(/\/+$/, "") + "/chat/completions",
      key: process.env.CUSTOM_API_KEY || "none",
      model: modelFor("custom", "default"),
      keyName: "CUSTOM_API_KEY",
      label: "Other (OpenAI-compatible)",
      needsBaseUrl: true,
      supportsPdf: false,
      supportsSearch: false,
    },
  };
}

let PROVIDER = (process.env.PROVIDER || "anthropic").toLowerCase();
let PROVIDERS = buildProviders();
let CONFIG = PROVIDERS[PROVIDER];

if (!CONFIG) {
  console.error(`Unknown PROVIDER "${PROVIDER}". Use one of: ${Object.keys(PROVIDERS).join(", ")}`);
  process.exit(1);
}

/**
 * Saves the key she typed into .env and applies it without a restart.
 */
function applySettings({ provider, key, model, baseUrl, researcher }) {
  const table = buildProviders();
  if (!table[provider]) throw new Error("That isn't one of the available providers.");

  process.env.PROVIDER = provider;
  if (typeof researcher === "string") {
    RESEARCHER = researcher.trim().slice(0, 40);
    process.env.RESEARCHER_NAME = RESEARCHER;
  }
  delete process.env.MODEL;
  const slot = `MODEL_${provider.toUpperCase()}`;
  if (model && model.trim()) process.env[slot] = model.trim();
  else delete process.env[slot];
  if (baseUrl && baseUrl.trim()) process.env.CUSTOM_BASE_URL = baseUrl.trim();
  if (key && key.trim() && table[provider].keyName) process.env[table[provider].keyName] = key.trim();

  PROVIDER = provider;
  PROVIDERS = buildProviders();
  CONFIG = PROVIDERS[provider];

  const lines = [
    "# Written by the setup screen. Safe to edit by hand.",
    `PROVIDER=${provider}`,
  ];
  if (RESEARCHER) lines.push(`RESEARCHER_NAME=${RESEARCHER}`);
  for (const name of ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "CUSTOM_API_KEY", "CUSTOM_BASE_URL"]) {
    if (process.env[name]) lines.push(`${name}=${process.env[name]}`);
  }
  for (const id of ["ANTHROPIC", "GEMINI", "OPENROUTER", "OLLAMA", "CUSTOM"]) {
    if (process.env[`MODEL_${id}`]) lines.push(`MODEL_${id}=${process.env[`MODEL_${id}`]}`);
  }
  fs.writeFileSync(path.join(ROOT, ".env"), lines.join("\n") + "\n", { mode: 0o600 });
}

const MAX_TOKENS = Number(process.env.MAX_TOKENS || 4096);
let RESEARCHER = (process.env.RESEARCHER_NAME || "").trim();

/* ------------------------------------------------------------------
   Prompts
------------------------------------------------------------------ */

const basePrompt = () => `You are a research assistant for ${RESEARCHER ? RESEARCHER + ", a" : "a"} physics master's student doing original research and writing papers for publication.

Assume real competence: she knows undergraduate physics thoroughly and works at graduate level. Do not over-explain fundamentals unless asked, and never condescend.

Be honest about uncertainty. If you are unsure of a result, a citation, or a step in a derivation, say so explicitly rather than producing something that merely sounds authoritative. Fabricated references and confidently wrong algebra are the two worst failures you can commit here. Never invent a paper title, author list, DOI, or year.

Write mathematics in LaTeX: $...$ inline, $$...$$ for displayed equations. Keep answers as long as the physics requires and no longer.

If she writes in Bangla, reply in Bangla and keep technical terms in English.`;

const MODE_PROMPTS = {
  understand:
    "She wants to understand something. Begin from what a master's student already knows and build up. Give the physical picture before the formalism, state assumptions and limits of validity explicitly, and flag where textbook treatments commonly mislead. If a derivation is involved, show the steps rather than the result alone.",
  read:
    "She is working through a paper she has attached. Ground every claim in the actual text of the document, and point to the section, figure, or equation number. If she asks something the paper does not address, say so plainly instead of filling the gap with plausible-sounding physics. Distinguish what the authors claim from what they actually demonstrate.",
  write:
    "She is writing for publication. Match the register of a physics journal: precise, unhedged where the evidence is firm, hedged where it is not. Prefer active voice and concrete claims, and cut throat-clearing. When you revise her text, keep her voice and show the changed passage rather than silently rewriting the whole thing. Point out any claim the evidence she has described does not support.",
  check:
    "She wants a calculation checked. Redo it independently rather than confirming her steps one at a time. Check dimensions and limiting cases first, then the algebra. State clearly whether you found an error, where it is, and what the corrected result is. If you cannot verify a step, name the step and say why.",
  referee:
    "Act as a demanding but fair referee for a physics journal. Identify the central claim, then assess whether it is supported. Raise the objections a real referee would raise: unstated assumptions, missing error analysis, overreach in the conclusions, prior work not engaged with. Be specific and constructive. Do not soften the critique with praise.",
};

function systemPrompt(mode) {
  const extra = MODE_PROMPTS[mode] || MODE_PROMPTS.understand;
  return `${basePrompt()}\n\nCurrent task: ${extra}`;
}

/* ------------------------------------------------------------------
   Storage
------------------------------------------------------------------ */

let conversations = [];
let writeTimer = null;

function loadStore() {
  try {
    if (fs.existsSync(STORE)) {
      conversations = JSON.parse(fs.readFileSync(STORE, "utf8"));
    }
  } catch (err) {
    console.error("Could not read data/conversations.json, starting empty.", err.message);
    conversations = [];
  }
}

function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    try {
      await fsp.mkdir(DATA_DIR, { recursive: true });
      await fsp.writeFile(STORE, JSON.stringify(conversations, null, 2));
    } catch (err) {
      console.error("Could not save conversations:", err.message);
    }
  }, 200);
}

/** Strip base64 payloads out before sending the list to the browser. */
function slim(conv) {
  return {
    ...conv,
    papers: (conv.papers || []).map(({ id, name, pages }) => ({ id, name, pages })),
  };
}

loadStore();

/* ------------------------------------------------------------------
   Message building
------------------------------------------------------------------ */

function buildAnthropicMessages(conv) {
  const papers = conv.papers || [];
  return conv.messages.map((m, i) => {
    const isLastUser = i === conv.messages.length - 1 && m.role === "user";
    if (isLastUser && papers.length) {
      return {
        role: "user",
        content: [
          ...papers.map((p) => ({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: p.data },
          })),
          { type: "text", text: m.content },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

function buildOpenAiMessages(conv, mode) {
  const papers = conv.papers || [];
  const messages = [{ role: "system", content: systemPrompt(mode) }];

  if (papers.length) {
    const corpus = papers
      .map((p) => `--- ${p.name} ---\n${(p.text || "").slice(0, 120000)}`)
      .join("\n\n");
    messages.push({
      role: "system",
      content: `The researcher has attached the following paper text. Ground your answers in it.\n\n${corpus}`,
    });
  }

  for (const m of conv.messages) {
    messages.push({ role: m.role, content: m.content });
  }
  return messages;
}

/* ------------------------------------------------------------------
   Streaming to the browser: newline-delimited JSON
------------------------------------------------------------------ */

function openStream(res) {
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
}

function push(res, obj) {
  res.write(JSON.stringify(obj) + "\n");
}

async function streamAnthropic(conv, mode, useSearch, res) {
  const body = {
    model: CONFIG.model,
    max_tokens: MAX_TOKENS,
    stream: true,
    system: systemPrompt(mode),
    messages: buildAnthropicMessages(conv),
  };
  if (useSearch && CONFIG.supportsSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }];
  }

  const upstream = await fetch(CONFIG.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": CONFIG.key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    throw new Error(readableApiError(upstream.status, detail));
  }

  let full = "";
  const citations = [];
  await consumeSse(upstream, (event) => {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      full += event.delta.text;
      push(res, { type: "delta", text: event.delta.text });
    }
    if (event.type === "content_block_start" && event.content_block?.type === "server_tool_use") {
      push(res, { type: "status", text: "Searching the literature" });
    }
    if (event.type === "content_block_start" && event.content_block?.type === "web_search_tool_result") {
      for (const r of event.content_block.content || []) {
        if (r.url && !citations.some((c) => c.url === r.url)) {
          citations.push({ url: r.url, title: r.title || r.url });
        }
      }
    }
    if (event.type === "error") {
      throw new Error(event.error?.message || "The model stream reported an error.");
    }
  });

  return { text: full, citations };
}

async function streamOpenAi(conv, mode, res) {
  const headers = { "content-type": "application/json" };
  if (CONFIG.key && CONFIG.keyName) headers.authorization = `Bearer ${CONFIG.key}`;
  if (PROVIDER === "openrouter") {
    headers["HTTP-Referer"] = "http://localhost";
    headers["X-Title"] = "Research desk";
  }

  // Gemma and a few other open models reject a system role outright.
  const noSystem = /gemma|mistral-7b|phi-/i.test(CONFIG.model);

  async function attempt(mergeSystem) {
    let messages = buildOpenAiMessages(conv, mode);
    if (mergeSystem) {
      const preamble = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const rest = messages.filter((m) => m.role !== "system");
      if (rest.length && preamble) {
        rest[0] = { role: "user", content: `${preamble}\n\n---\n\n${rest[0].content}` };
      }
      messages = rest;
    }

    const upstream = await fetch(CONFIG.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: CONFIG.model,
        max_tokens: MAX_TOKENS,
        stream: true,
        messages,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      const err = new Error(readableApiError(upstream.status, detail));
      err.status = upstream.status;
      err.raw = detail;
      throw err;
    }
    return upstream;
  }

  let upstream;
  try {
    upstream = await attempt(noSystem);
  } catch (err) {
    const looksLikeSystemProblem =
      !noSystem &&
      (err.status === 400 || err.status === 422) &&
      /system|developer instruction|role/i.test(err.raw || "");
    if (!looksLikeSystemProblem) throw err;
    console.error("  retrying without a system message (the model rejected it)");
    upstream = await attempt(true);
  }

  let full = "";
  await consumeSse(upstream, (event) => {
    if (event.error) throw new Error(event.error.message || "The model reported an error.");
    const piece = event.choices?.[0]?.delta?.content;
    if (piece) {
      full += piece;
      push(res, { type: "delta", text: piece });
    }
  });

  if (!full.trim()) {
    throw new Error(
      `${CONFIG.model} accepted the request but returned nothing. Try a different model in "Change model or key".`
    );
  }

  return { text: full, citations: [] };
}

/** Reads an SSE body and hands each parsed `data:` payload to onEvent. */
async function consumeSse(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        onEvent(JSON.parse(payload));
      } catch {
        /* ignore malformed keep-alive frames */
      }
    }
  }
}

function readableApiError(status, detail) {
  let message = detail;
  try {
    const parsed = JSON.parse(detail);
    message = parsed.error?.message || parsed.message || detail;
  } catch {
    /* leave as raw text */
  }
  if (status === 401 || status === 403) {
    return `The API key was rejected by ${CONFIG.label}. Open "Change model or key" and paste it again.`;
  }
  if (status === 404) {
    return `${CONFIG.label} has no model called "${CONFIG.model}". Open "Change model or key" and use the exact name from the provider's model list.`;
  }
  if (status === 429) {
    return "Rate limit reached. Wait a moment and send again.";
  }
  if (status === 400 && /credit|balance/i.test(message)) {
    return "The account has no credit left for this API key.";
  }
  return message.slice(0, 400);
}

/* ------------------------------------------------------------------
   Routes
------------------------------------------------------------------ */

function json(res, code, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

function readBody(req, limitBytes = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error("That upload is too large. Try a PDF under 40 MB."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (err) {
        reject(new Error("The request body was not valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  const route = url.pathname;

  if (route === "/api/config" && req.method === "GET") {
    return json(res, 200, {
      provider: PROVIDER,
      label: CONFIG.label,
      model: CONFIG.model,
      supportsPdf: CONFIG.supportsPdf,
      supportsSearch: CONFIG.supportsSearch,
      keyPresent: Boolean(CONFIG.key),
      keyName: CONFIG.keyName,
      researcher: RESEARCHER,
      options: Object.entries(PROVIDERS).map(([id, p]) => ({
        id,
        label: p.label,
        model: p.model,
        needsKey: Boolean(p.keyName),
        needsBaseUrl: Boolean(p.needsBaseUrl),
        hasKey: Boolean(p.key),
      })),
    });
  }

  if (route === "/api/settings" && req.method === "POST") {
    const body = await readBody(req);
    try {
      applySettings(body);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
    return json(res, 200, {
      provider: PROVIDER,
      label: CONFIG.label,
      model: CONFIG.model,
      supportsPdf: CONFIG.supportsPdf,
      supportsSearch: CONFIG.supportsSearch,
      keyPresent: Boolean(CONFIG.key),
      keyName: CONFIG.keyName,
    });
  }

  if (route === "/api/conversations" && req.method === "GET") {
    return json(res, 200, conversations.map(slim));
  }

  if (route === "/api/conversations" && req.method === "POST") {
    const conv = {
      id: crypto.randomUUID(),
      title: "New thread",
      mode: "understand",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      papers: [],
    };
    conversations.unshift(conv);
    persist();
    return json(res, 200, slim(conv));
  }

  const match = route.match(/^\/api\/conversations\/([\w-]+)$/);
  if (match) {
    const conv = conversations.find((c) => c.id === match[1]);
    if (!conv) return json(res, 404, { error: "That thread no longer exists." });

    if (req.method === "GET") return json(res, 200, slim(conv));

    if (req.method === "DELETE") {
      conversations = conversations.filter((c) => c.id !== conv.id);
      persist();
      return json(res, 200, { ok: true });
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      if (typeof body.title === "string") conv.title = body.title.slice(0, 120);
      if (typeof body.mode === "string") conv.mode = body.mode;

      if (body.addPaper) {
        const { name, data, text, pages } = body.addPaper;
        conv.papers.push({
          id: crypto.randomUUID(),
          name: String(name || "paper.pdf").slice(0, 200),
          data: data || "",
          text: text || "",
          pages: pages || null,
        });
      }
      if (body.removePaper) {
        conv.papers = conv.papers.filter((p) => p.id !== body.removePaper);
      }
      conv.updatedAt = Date.now();
      persist();
      return json(res, 200, slim(conv));
    }
  }

  if (route === "/api/chat" && req.method === "POST") {
    const body = await readBody(req);
    const conv = conversations.find((c) => c.id === body.conversationId);
    if (!conv) return json(res, 404, { error: "That thread no longer exists." });
    if (!CONFIG.key) {
      return json(res, 400, {
        error: `No API key found. Put ${CONFIG.keyName} in the .env file and restart the server.`,
      });
    }

    const text = String(body.text || "").trim();
    if (!text) return json(res, 400, { error: "The message was empty." });

    const mode = body.mode || conv.mode || "understand";
    conv.mode = mode;
    conv.messages.push({ role: "user", content: text, at: Date.now() });
    if (conv.title === "New thread") {
      conv.title = text.replace(/\s+/g, " ").slice(0, 60) + (text.length > 60 ? "…" : "");
    }
    persist();

    openStream(res);
    push(res, { type: "title", title: conv.title });

    try {
      const result =
        CONFIG.kind === "anthropic"
          ? await streamAnthropic(conv, mode, Boolean(body.search), res)
          : await streamOpenAi(conv, mode, res);

      conv.messages.push({
        role: "assistant",
        content: result.text,
        mode,
        citations: result.citations,
        at: Date.now(),
      });
      conv.updatedAt = Date.now();
      persist();
      push(res, { type: "done", citations: result.citations });
    } catch (err) {
      // Drop the unanswered question so she can edit and resend it.
      conv.messages.pop();
      persist();
      console.error(
        `\n  Request failed\n` +
          `  provider  ${PROVIDER}\n` +
          `  model     ${CONFIG.model}\n` +
          `  reason    ${err.message}\n` +
          (err.raw ? `  detail    ${String(err.raw).slice(0, 500)}\n` : "")
      );
      push(res, { type: "error", error: err.message || "The request failed." });
    }
    return res.end();
  }

  return json(res, 404, { error: "No such endpoint." });
}

/* ------------------------------------------------------------------
   Static files
------------------------------------------------------------------ */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function serveStatic(req, res, url) {
  const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const content = await fsp.readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

/* ------------------------------------------------------------------
   Server
------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (err) {
    if (!res.headersSent) json(res, 500, { error: err.message || "Something went wrong." });
    else res.end();
  }
});

/**
 * If there's no key yet, ask for one right here in the terminal.
 * Avoids any need to edit files or fight with a browser panel.
 */
async function askForKey() {
  const readline = require("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const menu = [
    ["gemini", "Google Gemini", "free, easiest to start with"],
    ["openrouter", "OpenRouter", "many models, some free"],
    ["anthropic", "Anthropic", "best at physics, paid"],
    ["ollama", "Ollama", "runs offline, no key needed"],
  ];

  console.log("\n  Let's set this up — it only happens once.\n");
  const who = (await rl.question("  Who is this for? (a name, or Enter to skip): ")).trim();
  console.log("");
  menu.forEach(([, label, note], i) => {
    console.log(`    ${i + 1}  ${label.padEnd(16)} ${note}`);
  });
  console.log("");

  let pick = (await rl.question("  Which one? (1-4, Enter for 1): ")).trim();
  const chosen = menu[(Number(pick) || 1) - 1] || menu[0];
  const [provider, label] = chosen;

  let key = "";
  if (provider !== "ollama") {
    const where = {
      gemini: "aistudio.google.com/apikey",
      openrouter: "openrouter.ai/keys",
      anthropic: "console.anthropic.com",
    }[provider];
    console.log(`\n  Get a key at ${where}`);
    key = (await rl.question("  Paste it here and press Enter: ")).trim();
    if (!key) {
      console.log("\n  Nothing pasted. Run this again when you have a key.\n");
      rl.close();
      process.exit(1);
    }
  }

  const fallback = buildProviders()[provider].model;
  const model = (await rl.question(`\n  Model (Enter for ${fallback}): `)).trim();

  rl.close();
  applySettings({ provider, key, model, researcher: who });
  console.log(
    `\n  Saved.${RESEARCHER ? ` Set up for ${RESEARCHER}.` : ""} Using ${label} with ${CONFIG.model}.`
  );
}

async function start() {
  if (!CONFIG.key && process.stdin.isTTY) {
    try {
      await askForKey();
    } catch (err) {
      console.error(`\n  Could not save that: ${err.message}\n`);
    }
  }

  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://localhost:${PORT}`;
    console.log(
      `\n  Research desk is running\n` +
        `  ${url}\n\n` +
        `  provider  ${PROVIDER}\n` +
        `  model     ${CONFIG.model}\n` +
        (CONFIG.key ? "" : "  no key yet — the browser will ask for one\n") +
        `\n  Leave this window open while you work. Ctrl+C to stop.\n`
    );

    if (process.env.NO_OPEN) return;
    const command =
      process.platform === "darwin"
        ? `open "${url}"`
        : process.platform === "win32"
          ? `cmd /c start "" "${url}"`
          : `xdg-open "${url}"`;
    require("node:child_process").exec(command, () => {});
  });
}

start();
