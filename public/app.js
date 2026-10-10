/* ------------------------------------------------------------------
   Research desk — client
------------------------------------------------------------------ */

const MODES = [
  {
    id: "understand",
    name: "Understand",
    hint: "A concept, a derivation, a result",
    color: "var(--violet)",
    starters: [
      "Explain the difference between the Berry phase and the Aharonov–Bohm phase",
      "Why does renormalisation group flow have fixed points?",
      "Walk me through the Landau free energy expansion near a second-order transition",
    ],
  },
  {
    id: "read",
    name: "Read a paper",
    hint: "Question a PDF you've attached",
    color: "var(--indigo)",
    starters: [
      "Summarise the method and the central result",
      "Which assumptions in this paper are the weakest?",
      "Explain equation 4 and where it comes from",
    ],
  },
  {
    id: "write",
    name: "Write",
    hint: "Abstracts, introductions, replies",
    color: "var(--cyan)",
    starters: [
      "Tighten this abstract to 150 words",
      "Draft an outline for my introduction",
      "Help me answer this referee comment",
    ],
  },
  {
    id: "check",
    name: "Check the maths",
    hint: "Verify a derivation or an estimate",
    color: "var(--amber)",
    starters: [
      "Check the dimensions of this expression",
      "Verify this integral and its limits",
      "Estimate the order of magnitude of this effect",
    ],
  },
  {
    id: "referee",
    name: "Referee",
    hint: "Hard critique before you submit",
    color: "var(--red)",
    starters: [
      "Referee my abstract and central claim",
      "What would a reviewer attack first here?",
      "Is my error analysis adequate?",
    ],
  },
];

const el = (id) => document.getElementById(id);
const state = {
  config: null,
  conversations: [],
  current: null,
  mode: MODES[0],
  search: false,
  busy: false,
  pinned: true,
};

/* ------------------------------------------------------------------
   Maths: KaTeX when it loaded, a Unicode transcription when it didn't
------------------------------------------------------------------ */

const GREEK = { alpha:"α",beta:"β",gamma:"γ",delta:"δ",epsilon:"ε",varepsilon:"ε",zeta:"ζ",eta:"η",theta:"θ",vartheta:"ϑ",iota:"ι",kappa:"κ",lambda:"λ",mu:"μ",nu:"ν",xi:"ξ",pi:"π",rho:"ρ",sigma:"σ",tau:"τ",upsilon:"υ",phi:"φ",varphi:"φ",chi:"χ",psi:"ψ",omega:"ω",Gamma:"Γ",Delta:"Δ",Theta:"Θ",Lambda:"Λ",Xi:"Ξ",Pi:"Π",Sigma:"Σ",Upsilon:"Υ",Phi:"Φ",Psi:"Ψ",Omega:"Ω" };
const SYMBOL = { hbar:"ℏ",nabla:"∇",partial:"∂",infty:"∞",int:"∫",iint:"∬",oint:"∮",sum:"∑",prod:"∏",sqrt:"√",pm:"±",mp:"∓",times:"×",cdot:"·",cdots:"⋯",ldots:"…",approx:"≈",simeq:"≃",sim:"∼",neq:"≠",leq:"≤",geq:"≥",ll:"≪",gg:"≫",equiv:"≡",propto:"∝",rightarrow:"→",leftarrow:"←",Rightarrow:"⇒",leftrightarrow:"↔",to:"→",mapsto:"↦",in:"∈",notin:"∉",subset:"⊂",cup:"∪",cap:"∩",forall:"∀",exists:"∃",langle:"⟨",rangle:"⟩",dagger:"†",otimes:"⊗",oplus:"⊕",perp:"⊥",parallel:"∥",angle:"∠",ell:"ℓ",emptyset:"∅",prime:"′" };
const SUP = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ" };
const SUB = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋","(":"₍",")":"₎","a":"ₐ","e":"ₑ","i":"ᵢ","j":"ⱼ","k":"ₖ","m":"ₘ","n":"ₙ","p":"ₚ","s":"ₛ","t":"ₜ","x":"ₓ" };

function toScript(chars, table) {
  let out = "";
  for (const ch of chars) {
    if (!table[ch]) return null;
    out += table[ch];
  }
  return out;
}

function unicodeMath(src) {
  let s = src;
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `(${a})/(${b})`);
  s = s.replace(/\\(?:left|right|big|Big|mathrm|mathbf|mathcal|text|displaystyle|,|;|!|quad|qquad)\b/g, " ");
  s = s.replace(/\\([a-zA-Z]+)/g, (m, n) => GREEK[n] || SYMBOL[n] || m);
  s = s.replace(/\^\{([^{}]+)\}|\^(\w)/g, (m, a, b) => toScript(a ?? b, SUP) ?? m);
  s = s.replace(/_\{([^{}]+)\}|_(\w)/g, (m, a, b) => toScript(a ?? b, SUB) ?? m);
  return s.replace(/[{}]/g, "").replace(/\s{2,}/g, " ").trim();
}

function renderMath(tex, display) {
  if (window.katex) {
    try {
      return window.katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: false,
      });
    } catch {
      /* fall through */
    }
  }
  const body = escapeHtml(unicodeMath(tex));
  return display
    ? `<span class="math-fallback math-block">${body}</span>`
    : `<span class="math-fallback">${body}</span>`;
}

/* ------------------------------------------------------------------
   Markdown — small on purpose, no dependencies
------------------------------------------------------------------ */

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function inline(text) {
  const slots = [];
  const stash = (html) => `\u0000${slots.push(html) - 1}\u0000`;

  let s = text;
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => stash(renderMath(tex, true)));
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => stash(renderMath(tex, true)));
  s = s.replace(/\$([^$\n]+?)\$/g, (_, tex) => stash(renderMath(tex, false)));
  s = s.replace(/\\\(([^\n]+?)\\\)/g, (_, tex) => stash(renderMath(tex, false)));
  s = s.replace(/`([^`]+)`/g, (_, code) => stash(`<code>${escapeHtml(code)}</code>`));

  s = escapeHtml(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)]);
}

function markdown(src) {
  const lines = src.split("\n");
  const out = [];
  let list = null;
  let fence = null;
  let block = null;

  const closeList = () => {
    if (list) { out.push(`</${list}>`); list = null; }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    // Displayed equations, including the multi-line form models prefer.
    if (block !== null) {
      if (/^\s*(\$\$|\\\])\s*$/.test(line)) {
        out.push(renderMath(block.join("\n"), true));
        block = null;
      } else {
        block.push(raw);
      }
      continue;
    }
    if (fence === null && /^\s*(\$\$|\\\[)\s*$/.test(line)) {
      closeList();
      block = [];
      continue;
    }
    if (fence === null && /^\s*\$\$[\s\S]+\$\$\s*$/.test(line)) {
      closeList();
      out.push(renderMath(line.trim().slice(2, -2), true));
      continue;
    }

    const fenceMatch = line.match(/^```(\w*)/);
    if (fenceMatch) {
      if (fence === null) { closeList(); fence = []; }
      else { out.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`); fence = null; }
      continue;
    }
    if (fence !== null) { fence.push(raw); continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);

    if (heading) { closeList(); out.push(`<h3>${inline(heading[2])}</h3>`); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { closeList(); out.push("<hr>"); continue; }

    if (bullet) {
      if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    if (numbered) {
      if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
      out.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }
    closeList();

    if (quote) { out.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue; }
    if (line.trim() === "") continue;
    out.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  if (fence !== null) out.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`);
  if (block !== null && block.length) out.push(renderMath(block.join("\n"), true));
  return out.join("");
}

/* ------------------------------------------------------------------
   API helpers
------------------------------------------------------------------ */

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "The server did not respond properly.");
  return data;
}

function notice(message, kind = "error") {
  const box = el("notice");
  if (!message) { box.hidden = true; return; }
  box.textContent = message;
  box.className = kind === "info" ? "notice info" : "notice";
  box.hidden = false;
}

/* ------------------------------------------------------------------
   Rendering the rail
------------------------------------------------------------------ */

function paintModes() {
  const nav = el("modes");
  nav.innerHTML = "";
  for (const mode of MODES) {
    const btn = document.createElement("button");
    btn.className = "mode";
    btn.setAttribute("aria-current", String(mode.id === state.mode.id));
    btn.innerHTML = `
      <span class="bar" style="--line:${mode.color}"></span>
      <span>
        <span class="name">${mode.name}</span>
        <span class="hint" style="display:block">${mode.hint}</span>
      </span>`;
    btn.onclick = () => selectMode(mode);
    nav.appendChild(btn);
  }
  document.documentElement.style.setProperty("--accent", state.mode.color);
  el("mode-caption").textContent = state.mode.name;
  el("input").placeholder =
    state.mode.id === "read" ? "Ask about the attached paper" : "Ask a question";
  paintStarters();
}

function paintStarters() {
  const box = el("starters");
  box.innerHTML = "";
  for (const s of state.mode.starters) {
    const b = document.createElement("button");
    b.className = "starter";
    b.textContent = s;
    b.onclick = () => send(s);
    box.appendChild(b);
  }
}

function paintThreads() {
  const list = el("thread-list");
  list.innerHTML = "";
  for (const conv of state.conversations) {
    const li = document.createElement("li");
    li.className = "thread-item";
    li.setAttribute("aria-current", String(conv.id === state.current?.id));

    const open = document.createElement("button");
    open.textContent = conv.title;
    open.title = conv.title;
    open.onclick = () => openThread(conv.id);

    const kill = document.createElement("button");
    kill.className = "kill";
    kill.textContent = "×";
    kill.setAttribute("aria-label", `Delete ${conv.title}`);
    kill.onclick = async (e) => {
      e.stopPropagation();
      await api(`/api/conversations/${conv.id}`, { method: "DELETE" });
      state.conversations = state.conversations.filter((c) => c.id !== conv.id);
      if (state.current?.id === conv.id) await newThread();
      else paintThreads();
    };

    li.append(open, kill);
    list.appendChild(li);
  }
}

function paintPapers() {
  const block = el("papers-block");
  const list = el("papers-list");
  const papers = state.current?.papers || [];
  block.hidden = papers.length === 0;
  list.innerHTML = "";

  for (const p of papers) {
    const li = document.createElement("li");
    li.className = "paper";
    li.innerHTML = `<span class="name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
      ${p.pages ? `<span class="pages">${p.pages}p</span>` : ""}`;
    const kill = document.createElement("button");
    kill.textContent = "×";
    kill.setAttribute("aria-label", `Remove ${p.name}`);
    kill.onclick = async () => {
      state.current = await api(`/api/conversations/${state.current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ removePaper: p.id }),
      });
      paintPapers();
    };
    li.appendChild(kill);
    list.appendChild(li);
  }
}

/* ------------------------------------------------------------------
   Rendering the thread
------------------------------------------------------------------ */

function colorFor(modeId) {
  return (MODES.find((m) => m.id === modeId) || state.mode).color;
}

function askedNode(text) {
  const wrap = document.createElement("div");
  wrap.className = "turn asked";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  wrap.appendChild(bubble);
  return wrap;
}

function answerNode(text, modeId, citations) {
  const wrap = document.createElement("div");
  wrap.className = "turn answer";
  wrap.style.setProperty("--line", colorFor(modeId));

  const body = document.createElement("div");
  body.className = "body";
  body.innerHTML = markdown(text);
  wrap.appendChild(body);

  if (citations?.length) wrap.appendChild(sourcesNode(citations));

  const tools = document.createElement("div");
  tools.className = "turn-tools";
  const copy = document.createElement("button");
  copy.textContent = "Copy";
  copy.onclick = async () => {
    await navigator.clipboard.writeText(text);
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy"), 1500);
  };
  tools.appendChild(copy);
  wrap.appendChild(tools);

  return wrap;
}

function sourcesNode(citations) {
  const box = document.createElement("div");
  box.className = "sources";
  box.innerHTML = "<h4>Sources it looked at</h4>";
  for (const c of citations) {
    const a = document.createElement("a");
    a.href = c.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = c.title || c.url;
    box.appendChild(a);
  }
  return box;
}

function paintThread() {
  const box = el("thread");
  box.innerHTML = "";
  const messages = state.current?.messages || [];
  el("welcome").hidden = messages.length > 0;

  for (const m of messages) {
    box.appendChild(
      m.role === "user" ? askedNode(m.content) : answerNode(m.content, m.mode, m.citations)
    );
  }
  scrollDown();
}

function scrollDown() {
  const s = el("scroll");
  s.scrollTop = s.scrollHeight;
}

/* ------------------------------------------------------------------
   Threads
------------------------------------------------------------------ */

async function newThread() {
  const conv = await api("/api/conversations", { method: "POST" });
  conv.messages = conv.messages || [];
  state.conversations.unshift(conv);
  state.current = conv;
  paintThreads();
  paintPapers();
  paintThread();
  closeRail();
  el("input").focus();
}

async function openThread(id) {
  state.current = await api(`/api/conversations/${id}`);
  const mode = MODES.find((m) => m.id === state.current.mode);
  if (mode) state.mode = mode;
  paintModes();
  paintThreads();
  paintPapers();
  paintThread();
  closeRail();
}

async function selectMode(mode) {
  state.mode = mode;
  paintModes();
  if (state.current) {
    await api(`/api/conversations/${state.current.id}`, {
      method: "PATCH",
      body: JSON.stringify({ mode: mode.id }),
    });
    state.current.mode = mode.id;
  }
  el("input").focus();
}

/* ------------------------------------------------------------------
   Sending
------------------------------------------------------------------ */

async function send(overrideText) {
  const input = el("input");
  const text = (overrideText ?? input.value).trim();
  if (!text || state.busy) return;
  if (!state.current) await newThread();

  notice(null);
  input.value = "";
  autosize();
  setBusy(true);

  const box = el("thread");
  el("welcome").hidden = true;
  box.appendChild(askedNode(text));

  const wrap = document.createElement("div");
  wrap.className = "turn answer";
  wrap.style.setProperty("--line", state.mode.color);
  const body = document.createElement("div");
  body.className = "body";
  body.innerHTML = `<div class="working"><span class="pulse"></span>Thinking it through</div>`;
  wrap.appendChild(body);
  box.appendChild(wrap);
  scrollDown();

  let full = "";
  let citations = [];

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: state.current.id,
        mode: state.mode.id,
        text,
        search: state.search,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "The server refused the request.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    state.pinned = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        const event = JSON.parse(line);

        if (event.type === "delta") {
          full += event.text;
          body.innerHTML = markdown(full) + '<span class="caret"></span>';
          if (state.pinned) scrollDown();
        } else if (event.type === "status") {
          if (!full) body.innerHTML = `<div class="working"><span class="pulse"></span>${escapeHtml(event.text)}</div>`;
        } else if (event.type === "title") {
          if (state.current.title !== event.title) {
            state.current.title = event.title;
            const listed = state.conversations.find((c) => c.id === state.current.id);
            if (listed) listed.title = event.title;
            paintThreads();
          }
        } else if (event.type === "error") {
          throw new Error(event.error);
        } else if (event.type === "done") {
          citations = event.citations || [];
        }
      }
    }

    body.innerHTML = markdown(full);
    if (citations.length) wrap.insertBefore(sourcesNode(citations), null);

    const tools = document.createElement("div");
    tools.className = "turn-tools";
    const copy = document.createElement("button");
    copy.textContent = "Copy";
    copy.onclick = async () => {
      await navigator.clipboard.writeText(full);
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    };
    tools.appendChild(copy);
    wrap.appendChild(tools);

    state.current.messages.push({ role: "user", content: text });
    state.current.messages.push({ role: "assistant", content: full, mode: state.mode.id, citations });
  } catch (err) {
    wrap.remove();
    box.lastChild?.remove();
    input.value = text;
    autosize();
    notice(err.message);
    el("welcome").hidden = (state.current?.messages || []).length > 0;
  } finally {
    setBusy(false);
    scrollDown();
  }
}

function setBusy(value) {
  state.busy = value;
  el("send").disabled = value || !el("input").value.trim();
  el("input").disabled = value;
  if (!value) el("input").focus();
}

/* ------------------------------------------------------------------
   PDFs
------------------------------------------------------------------ */

async function extractText(file) {
  if (!window.pdfjsLib) return { text: "", pages: null };
  try {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    const buffer = await file.arrayBuffer();
    const doc = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    const chunks = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      chunks.push(content.items.map((it) => it.str).join(" "));
    }
    return { text: chunks.join("\n\n"), pages: doc.numPages };
  } catch {
    return { text: "", pages: null };
  }
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    r.readAsDataURL(file);
  });
}

async function attachFiles(files) {
  if (!state.current) await newThread();
  notice(null);

  for (const file of files) {
    if (file.type !== "application/pdf") {
      notice(`${file.name} is not a PDF. Attach the paper as a PDF.`);
      continue;
    }
    if (file.size > 40 * 1024 * 1024) {
      notice(`${file.name} is over 40 MB. Split it or export a smaller version.`);
      continue;
    }
    if ((state.current.papers || []).some((p) => p.name === file.name)) {
      notice(`${file.name} is already attached to this thread.`, "info");
      continue;
    }
    notice(`Reading ${file.name}…`, "info");
    try {
      const [data, extracted] = await Promise.all([toBase64(file), extractText(file)]);
      state.current = await api(`/api/conversations/${state.current.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          addPaper: {
            name: file.name,
            data: state.config?.supportsPdf ? data : "",
            text: extracted.text,
            pages: extracted.pages,
          },
        }),
      });
      notice(null);
      paintPapers();
      selectMode(MODES[1]);
    } catch (err) {
      notice(err.message);
    }
  }
}

/* ------------------------------------------------------------------
   Export
------------------------------------------------------------------ */

function exportThread() {
  const conv = state.current;
  if (!conv || !conv.messages.length) {
    notice("There's nothing in this thread yet.", "info");
    return;
  }
  const lines = [`# ${conv.title}`, ""];
  for (const m of conv.messages) {
    lines.push(m.role === "user" ? `## Question\n\n${m.content}` : `## Answer\n\n${m.content}`);
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = conv.title.replace(/[^\w\s-]/g, "").slice(0, 50).trim() + ".md";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ------------------------------------------------------------------
   Composer behaviour
------------------------------------------------------------------ */

function autosize() {
  const t = el("input");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 200) + "px";
  el("send").disabled = state.busy || !t.value.trim();
}

function openRail() { el("rail").classList.add("open"); el("scrim").hidden = false; }
function closeRail() { el("rail").classList.remove("open"); el("scrim").hidden = true; }

/* ------------------------------------------------------------------
   Setup screen
------------------------------------------------------------------ */

const KEY_HELP = {
  anthropic: {
    note: "best at physics · paid",
    hint: 'Make a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. Needs credit on the account. Reads PDFs directly and can search for papers.',
  },
  gemini: {
    note: "free tier",
    hint: 'Make a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com</a>. Free to use within generous daily limits — a good place to start.',
  },
  openrouter: {
    note: "many models",
    hint: 'Make a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai</a>. Copy the exact model slug from <a href="https://openrouter.ai/models" target="_blank" rel="noopener">openrouter.ai/models</a> into the Model box — e.g. <code>google/gemma-3-27b-it:free</code>. A wrong slug is the usual reason nothing replies.',
  },
  custom: {
    note: "any endpoint",
    hint: 'For any service that speaks the OpenAI format. Give its base address ending in <code>/v1</code>, the key if it needs one, and the model name it expects.',
  },
  ollama: {
    note: "offline · free",
    hint: 'Runs a model on this computer with no internet and no key. Install <a href="https://ollama.com" target="_blank" rel="noopener">Ollama</a> first, then run <code>ollama pull qwen2.5:14b</code>. Weaker at derivations than the others.',
  },
};

let setupChoice = "anthropic";

function paintSetup(config, firstRun) {
  const box = el("setup-choices");
  box.innerHTML = "";

  for (const option of config.options || []) {
    const help = KEY_HELP[option.id] || {};
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.setAttribute("aria-pressed", String(option.id === setupChoice));
    btn.innerHTML = `<span class="who">${option.label}</span>
      <span class="note">${option.hasKey ? "key saved · " : ""}${help.note || ""}</span>`;
    btn.onclick = () => { setupChoice = option.id; paintSetup(config, firstRun); };
    box.appendChild(btn);
  }

  const chosen = (config.options || []).find((o) => o.id === setupChoice);
  const needsKey = setupChoice !== "ollama";
  el("key-field").hidden = !needsKey;
  el("base-field").hidden = !chosen?.needsBaseUrl;
  el("model-input").value = chosen?.model || "";
  el("name-input").value = config.researcher || "";
  el("key-input").value = "";
  el("key-input").placeholder = chosen?.hasKey
    ? "a key is already saved — leave blank to keep it"
    : "paste it here";
  el("key-hint").innerHTML = (KEY_HELP[setupChoice] || {}).hint || "";

  el("setup-title").textContent = firstRun ? "One thing before you start" : "Where answers come from";
  el("setup-close").hidden = firstRun;
  el("setup-error").hidden = true;
}

function openSetup(firstRun) {
  setupChoice = state.config?.provider || "anthropic";
  paintSetup(state.config || {}, firstRun);
  el("setup").hidden = false;
  el("key-input").focus();
}

async function saveSetup() {
  const key = el("key-input").value.trim();
  const saved = state.config?.options?.find((o) => o.id === setupChoice)?.hasKey;

  if (setupChoice !== "ollama" && !key && !saved) {
    const box = el("setup-error");
    box.textContent = "Paste a key first, or choose Ollama to run offline without one.";
    box.hidden = false;
    return;
  }

  const btn = el("setup-save");
  btn.disabled = true;
  try {
    const updated = await api("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        provider: setupChoice,
        key,
        model: el("model-input").value,
        baseUrl: el("base-input").value,
        researcher: el("name-input").value,
      }),
    });
    state.config = { ...state.config, ...updated };
    const refreshed = await api("/api/config");
    state.config = refreshed;
    applyConfig();
    el("setup").hidden = true;
    notice(null);
  } catch (err) {
    const box = el("setup-error");
    box.textContent = err.message;
    box.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

function applyConfig() {
  const c = state.config;
  el("provider-line").textContent = `${c.label || c.provider} · ${c.model}`;
  const head = document.querySelector(".rail-head h1");
  const hello = el("welcome").querySelector("h2");
  if (c.researcher) {
    const first = c.researcher.split(/\s+/)[0];
    head.textContent = c.researcher;
    head.title = `${c.researcher}'s research desk`;
    document.title = `${first}'s research desk`;
    hello.textContent = `What are you working on today, ${first}?`;
  } else {
    head.textContent = "Research desk";
    document.title = "Research desk";
    hello.textContent = "What are you working on today?";
  }
  const toggle = el("search-toggle");
  toggle.disabled = !c.supportsSearch;
  toggle.title = c.supportsSearch ? "" : "Literature search needs the Anthropic provider";
  if (!c.supportsSearch) {
    state.search = false;
    toggle.setAttribute("aria-pressed", "false");
  }
}

/* ------------------------------------------------------------------
   Boot
------------------------------------------------------------------ */

async function boot() {
  paintModes();

  el("input").addEventListener("input", autosize);
  el("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  el("send").onclick = () => send();
  el("new-thread").onclick = newThread;
  el("new-thread-mobile").onclick = newThread;
  el("attach").onclick = () => el("file").click();
  el("file").onchange = (e) => { attachFiles(Array.from(e.target.files || [])); e.target.value = ""; };
  el("export").onclick = exportThread;
  el("rail-open").onclick = openRail;
  el("scrim").onclick = closeRail;

  // Follow the answer as it streams, unless she has scrolled up to read.
  el("scroll").addEventListener("scroll", () => {
    const s = el("scroll");
    state.pinned = s.scrollHeight - s.scrollTop - s.clientHeight < 80;
  }, { passive: true });

  el("search-toggle").onclick = () => {
    state.search = !state.search;
    el("search-toggle").setAttribute("aria-pressed", String(state.search));
  };

  el("open-setup").onclick = () => openSetup(false);
  el("setup-save").onclick = saveSetup;
  el("setup-close").onclick = () => { el("setup").hidden = true; };
  el("key-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); saveSetup(); }
  });

  const composer = el("composer");
  composer.addEventListener("dragover", (e) => { e.preventDefault(); composer.classList.add("dropping"); });
  composer.addEventListener("dragleave", () => composer.classList.remove("dropping"));
  composer.addEventListener("drop", (e) => {
    e.preventDefault();
    composer.classList.remove("dropping");
    attachFiles(Array.from(e.dataTransfer.files || []));
  });

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); newThread(); }
  });

  try {
    state.config = await api("/api/config");
    applyConfig();

    state.conversations = await api("/api/conversations");
    if (state.conversations.length) await openThread(state.conversations[0].id);
    else await newThread();

    if (!state.config.keyPresent) openSetup(true);
  } catch (err) {
    notice(err.message);
  }

  autosize();
}

boot();
