/**
 * Tests each key in .env directly against its provider.
 *   node check-key.js
 * Tells you which keys work before you blame the app.
 */
const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, ".env");
if (!fs.existsSync(file)) {
  console.log("\n  No .env file here. Start the server and save a key on the first screen.\n");
  process.exit(1);
}
for (const line of fs.readFileSync(file, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const pick = (id, fallback) =>
  process.env[`MODEL_${id.toUpperCase()}`] || process.env.MODEL || fallback;

const tests = [
  {
    name: "Anthropic",
    key: process.env.ANTHROPIC_API_KEY,
    async run(key) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: pick("anthropic", "claude-sonnet-4-6"),
          max_tokens: 16,
          messages: [{ role: "user", content: "say ok" }],
        }),
      });
      return [r.status, await r.text()];
    },
  },
  {
    name: "Gemini",
    key: process.env.GEMINI_API_KEY,
    async run(key) {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: pick("gemini", "gemini-2.0-flash"),
          max_tokens: 16,
          messages: [{ role: "user", content: "say ok" }],
        }),
      });
      return [r.status, await r.text()];
    },
  },
  {
    name: "OpenRouter",
    key: process.env.OPENROUTER_API_KEY,
    async run(key) {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: pick("openrouter", "google/gemma-3-27b-it:free"),
          max_tokens: 16,
          messages: [{ role: "user", content: "say ok" }],
        }),
      });
      return [r.status, await r.text()];
    },
  },
];

(async () => {
  console.log("");
  for (const t of tests) {
    if (!t.key) {
      console.log(`  ${t.name.padEnd(12)} no key in .env`);
      continue;
    }
    try {
      const [status, body] = await t.run(t.key);
      if (status === 200) {
        console.log(`  ${t.name.padEnd(12)} works`);
      } else {
        let msg = body;
        try { msg = JSON.parse(body).error?.message || body; } catch {}
        console.log(`  ${t.name.padEnd(12)} HTTP ${status} — ${String(msg).slice(0, 160)}`);
      }
    } catch (err) {
      console.log(`  ${t.name.padEnd(12)} could not connect — ${err.message}`);
    }
  }
  console.log("");
})();
