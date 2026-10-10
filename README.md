# Research desk

A private AI research assistant for physics students and researchers. It runs
on your own computer: your conversations and your papers stay on your machine.

**No dependencies. No build step. No account.** Just Node.js and one command.

Built for physics, but the modes and prompts are plain text in `server.js`, so
adapting it to another field takes a few minutes.

---

## What it does

Five working modes. Each one changes how the assistant approaches your question,
not just its tone.

| Mode | Use it to |
|---|---|
| **Understand** | work through a concept, a derivation, a result |
| **Read a paper** | question a PDF you've attached, grounded in its actual text |
| **Write** | draft and tighten abstracts, introductions, referee replies |
| **Check the maths** | redo a calculation independently, dimensions and limits first |
| **Referee** | get a hard, honest critique before you submit |

Also:

- **LaTeX rendering** with KaTeX, falling back to readable Unicode when offline
- **Saved threads** on your own disk, with Markdown export for pasting into drafts
- **PDF attachments** that stay with the thread, so follow-ups keep their context
- **Literature search** with cited sources (Anthropic provider only)
- **Streaming answers**, a responsive layout, and a keyboard-friendly composer
- The assistant is instructed never to invent a citation and to say when it is unsure

---

## Quick start

**1. Install Node.js 18 or newer** from https://nodejs.org (the LTS button).

**2. Get the code**

```bash
git clone https://github.com/Fayaz-Ali56/research-desk.git
cd research-desk
```

or download the ZIP from the green **Code** button and unzip it.

**3. Run it**

```bash
node server.js
```

The first time, the terminal asks for your name, which provider to use, and
your API key. It saves them to a local `.env` file and never asks again. Your
browser opens at **http://localhost:4173**.

Prefer double-clicking? Use `Start on Windows.bat`, `Start on Mac.command`, or
`start-on-linux.sh`.

To stop, press `Ctrl+C` or close the terminal window.

---

## Choosing a provider

| Provider | Cost | Key from | PDFs | Literature search |
|---|---|---|---|---|
| **Google Gemini** | free tier | aistudio.google.com/apikey | text extracted in browser | no |
| **OpenRouter** | many models, some free | openrouter.ai/keys | text extracted in browser | no |
| **Anthropic** | paid | console.anthropic.com | read natively | yes |
| **Ollama** | free, offline | none, install ollama.com | text extracted in browser | no |
| **Other** | varies | any OpenAI-compatible endpoint | text extracted in browser | no |

Gemini's free tier is the easiest place to start. Switch any time from
**Change model or key** in the sidebar. Each provider remembers its own model.

On OpenRouter the model name must match exactly what's listed at
openrouter.ai/models, for example `google/gemma-3-27b-it:free`. A wrong name is
the usual reason messages get sent but nothing comes back.

Model quality matters here. Small models are fluent but make more subtle
mistakes in multi-step derivations. For anything that matters, use a stronger
model and check the maths yourself.

---

## Configuration

Everything can be set through the first-run prompt or the in-app settings. To
configure by hand, copy `.env.example` to `.env`:

| Variable | Meaning |
|---|---|
| `RESEARCHER_NAME` | shown at the top and used by the assistant |
| `PROVIDER` | `gemini`, `openrouter`, `anthropic`, `ollama`, or `custom` |
| `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` | keys, all can coexist |
| `MODEL_GEMINI`, `MODEL_OPENROUTER`, ... | pin a model per provider |
| `CUSTOM_BASE_URL`, `CUSTOM_API_KEY` | any OpenAI-compatible service |
| `MAX_TOKENS`, `PORT` | defaults `4096` and `4173` |

Not sure whether a key works? Run `node check-key.js`. It tests each key
directly and prints the provider's real error.

---

## Privacy

- The server listens on `127.0.0.1` only, so it is unreachable from other devices.
- Your key lives in `.env` on your machine and is never sent to the browser.
- Conversations are stored in `data/conversations.json`. Delete it for a clean start.
- Messages and attached papers are sent to whichever provider you choose, under
  that provider's terms. Use Ollama if nothing may leave your machine.
- `.env` and `data/` are git-ignored. Don't commit them.

---

## Adapting it

The assistant's behaviour lives in `server.js`: `basePrompt` and `MODE_PROMPTS`.
Edit the text, restart, done. The modes, colours, and starter questions are in
`public/app.js`. The design is in `public/styles.css`; its accent colours are
hydrogen's Balmer emission lines.

```
server.js        local server, provider adapters, streaming, storage
check-key.js     tests your API keys
public/          the interface (plain HTML, CSS, JavaScript)
```

---

## Troubleshooting

**The window flashes and closes.** Node.js isn't installed. Do step 1.

**Messages send but nothing replies.** Check the terminal: failed requests print
the provider, model, and the real error there. The model name is the usual cause.

**"The API key was rejected."** Wrong key for the selected provider, or no credit.

**Port already in use.** Set `PORT=4174` in `.env`.

**Equations look like plain text.** KaTeX loads from a CDN. Offline you get the
readable fallback.

**macOS blocks the `.command` file.** Right-click it, choose Open, then Open again.

---

## A note on accuracy

This is a tool, not an authority. It can be confidently wrong, and it can
misremember a reference. Verify every derivation and every citation before it
goes near a manuscript.

---

## License

MIT. See [LICENSE](LICENSE).
