const FALLBACK_MODELS = [
  "Qwen3-0.6B-q4f16_1-MLC",
  "Qwen3-1.7B-q4f16_1-MLC",
  "Qwen3-4B-q4f16_1-MLC",
  "Qwen3-8B-q4f16_1-MLC",
  "Qwen3.5-0.8B-q4f16_1-MLC",
  "Qwen3.5-2B-q4f16_1-MLC",
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-3B-Instruct-q4f16_1-MLC",
  "Qwen2.5-7B-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
  "Llama-3.1-8B-Instruct-q4f16_1-MLC",
  "Phi-3.5-mini-instruct-q4f16_1-MLC",
  "Phi-4-mini-instruct-q4f16_1-MLC",
  "gemma-2-2b-it-q4f16_1-MLC",
  "gemma3-1b-it-q4f16_1-MLC",
  "SmolLM2-1.7B-Instruct-q4f16_1-MLC",
  "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC",
  "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
  "Hermes-3-Llama-3.2-3B-q4f16_1-MLC",
  "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC",
];

const $ = (id) => document.getElementById(id);
const ui = {
  model: $("model"),
  memory: $("memory"),
  status: $("status"),
  progress: $("progress"),
  log: $("log"),
  form: $("form"),
  prompt: $("prompt"),
  send: $("send"),
  clear: $("clear"),
};

let webllm = null;
const state = {
  engine: null,
  loadedModel: null,
  loading: false,
  generating: false,
  turn: 0,
  loadToken: 0,
  model: "",
  messages: [],
};

function writeCookie(name, value, maxAge = 31536000) {
  document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
}

function cookieValue(name) {
  const hit = document.cookie.split("; ").find((row) => row.startsWith(name + "="));
  return hit ? hit.slice(name.length + 1) : "";
}

function save() {
  const payload = {
    model: state.model,
    memory: ui.memory.value,
    messages: state.messages.slice(-40).map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, 4000),
    })),
  };
  const raw = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const size = 3200;
  const n = Math.ceil(raw.length / size);
  if (n > 18) {
    if (state.messages.length <= 2) return;
    state.messages = state.messages.slice(2);
    return save();
  }
  writeCookie("wlcn", String(n));
  for (let i = 0; i < n; i += 1) writeCookie("wlc" + i, raw.slice(i * size, (i + 1) * size));
  for (let i = n; i < 18; i += 1) writeCookie("wlc" + i, "", 0);
}

function loadSaved() {
  const n = Number(cookieValue("wlcn") || 0);
  if (!n) return null;
  let raw = "";
  for (let i = 0; i < n; i += 1) raw += cookieValue("wlc" + i);
  try {
    return JSON.parse(decodeURIComponent(escape(atob(raw))));
  } catch {
    return null;
  }
}

function setStatus(text, progress) {
  ui.status.textContent = text;
  ui.status.classList.toggle("ok", /^Ready:/.test(text));
  if (typeof progress === "number") ui.progress.value = progress;
}

function setBusy(busy) {
  ui.send.disabled = busy;
  ui.prompt.disabled = busy;
  ui.model.disabled = busy;
}

function modelIds() {
  const listed = webllm?.prebuiltAppConfig?.model_list || [];
  const fromLib = listed
    .filter((m) => m.model_type === undefined || m.model_type === 0)
    .map((m) => m.model_id)
    .filter((id) => !/-1k$/i.test(id));
  return [...new Set(fromLib.length ? fromLib : FALLBACK_MODELS)];
}

function populateModels() {
  const ids = modelIds();
  const current = ui.model.value || state.model;
  ui.model.innerHTML = "";
  for (const id of ids) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id.replace(/-MLC$/, "");
    ui.model.appendChild(opt);
  }
  const pick =
    (current && ids.includes(current) && current) ||
    ids.find((id) => id.startsWith("Qwen3-0.6B")) ||
    ids[0];
  ui.model.value = pick;
  state.model = pick;
}

function visibleAnswer(text) {
  const close = text.lastIndexOf("</think>");
  if (close !== -1) return text.slice(close + 8).replace(/<\/?think>/g, "").trim();
  return text.replace(/<think>[\s\S]*$/g, "").replace(/<\/?think>/g, "").trim();
}

function expectsThink() {
  return /qwen3|deepseek-r1|r1-distill|qwq/i.test(state.loadedModel || state.model || "");
}

function stillThinking(text, done) {
  if (text.includes("</think>")) return false;
  if (text.includes("<think>")) return true;
  return !done && expectsThink();
}

function renderLog() {
  ui.log.innerHTML = "";
  for (const msg of state.messages) {
    addLine(msg.role, visibleAnswer(msg.content) || msg.content, false);
  }
}

function addLine(role, content, persist = true) {
  const p = document.createElement("p");
  const who = document.createElement("b");
  who.textContent = role === "user" ? "You" : "Assistant";
  p.append(who, document.createTextNode("\n" + content));
  ui.log.appendChild(p);
  if (persist) {
    state.messages.push({ role, content });
    save();
  }
  ui.log.scrollTop = ui.log.scrollHeight;
  return p;
}

function addAssistantShell() {
  const p = document.createElement("p");
  const who = document.createElement("b");
  who.textContent = "Assistant";
  const think = document.createElement("div");
  think.className = "thinking";
  think.hidden = true;
  const label = document.createElement("span");
  label.className = "thinking-label";
  label.textContent = "Thinking";
  const dots = document.createElement("span");
  dots.className = "dots";
  const bar = document.createElement("span");
  bar.className = "bar";
  think.append(label, dots, bar);
  const answer = document.createElement("span");
  answer.className = "answer";
  p.append(who, think, answer);
  ui.log.appendChild(p);
  return { think, answer };
}

function memories() {
  return ui.memory.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function looksLikeQuestion(text) {
  const t = text.trim();
  if (t.length < 8) return false;
  if (/^(hi|hey|hello|thanks|thank you|ok|okay|yo)\b/i.test(t)) return false;
  return true;
}

async function webSearch(query) {
  const search = new URL("https://en.wikipedia.org/w/api.php");
  search.searchParams.set("origin", "*");
  search.searchParams.set("action", "query");
  search.searchParams.set("list", "search");
  search.searchParams.set("srsearch", query);
  search.searchParams.set("srlimit", "5");
  search.searchParams.set("format", "json");
  const data = await fetch(search).then((r) => r.json());
  const hits = data?.query?.search || [];
  if (!hits.length) return `No search results for: ${query}`;

  const titles = hits.map((h) => h.title).join("|");
  const extract = new URL("https://en.wikipedia.org/w/api.php");
  extract.searchParams.set("origin", "*");
  extract.searchParams.set("action", "query");
  extract.searchParams.set("prop", "extracts|info");
  extract.searchParams.set("exintro", "1");
  extract.searchParams.set("explaintext", "1");
  extract.searchParams.set("inprop", "url");
  extract.searchParams.set("titles", titles);
  extract.searchParams.set("format", "json");
  const pages = Object.values((await fetch(extract).then((r) => r.json()))?.query?.pages || {});
  return pages
    .map((page) => {
      const body = String(page.extract || "").slice(0, 500);
      return `${page.title}: ${body} ${page.fullurl || ""}`.trim();
    })
    .join("\n\n");
}

async function loadWebllm() {
  if (!webllm) webllm = await import("https://esm.run/@mlc-ai/web-llm");
  return webllm;
}

async function ensureEngine() {
  const wanted = ui.model.value;
  if (state.engine && state.loadedModel === wanted) return;
  const token = ++state.loadToken;
  state.loading = true;
  setBusy(true);
  setStatus("Loading " + wanted, 0);

  const { CreateMLCEngine, prebuiltAppConfig } = await loadWebllm();
  const onProgress = (report) => {
    if (token !== state.loadToken) return;
    setStatus(report?.text || "Loading…", report?.progress || 0);
  };

  if (state.engine) await state.engine.reload(wanted);
  else {
    state.engine = await CreateMLCEngine(wanted, {
      initProgressCallback: onProgress,
      appConfig: prebuiltAppConfig,
    });
  }

  if (token !== state.loadToken) return;
  state.loadedModel = wanted;
  state.model = wanted;
  state.loading = false;
  setBusy(false);
  setStatus("Ready: " + wanted, 1);
  save();
}

function systemPrompt(searchText) {
  const facts = memories();
  let text =
    "You are a helpful local assistant. Keep answers short. " +
    "You CAN use the web: search results for the user's question are included below. " +
    "Use them. Never say you cannot search or browse the web.";
  if (facts.length) text += "\n\nFacts about the user:\n- " + facts.join("\n- ");
  if (searchText) text += "\n\nWeb search results:\n" + searchText;
  return text;
}

function paintAssistant(shell, raw, done = false) {
  const thinking = stillThinking(raw, done);
  const closed = raw.includes("</think>") || raw.includes("<think>");
  const answer = visibleAnswer(raw);
  const showAnswer = thinking ? "" : answer || raw.trim();
  shell.think.hidden = !thinking && !closed;
  shell.think.classList.toggle("done", !thinking && closed);
  shell.think.querySelector(".thinking-label").textContent = thinking ? "Thinking" : "Thought";
  shell.answer.textContent = showAnswer ? "\n" + showAnswer : "";
}

function clearHistory() {
  state.turn += 1;
  state.generating = false;
  state.messages = [];
  ui.memory.value = "";
  ui.log.innerHTML = "";
  if (!state.loading) {
    setBusy(false);
    if (state.loadedModel) setStatus("Ready: " + state.loadedModel, 1);
  }
  save();
  state.engine?.interruptGenerate?.();
  state.engine?.resetChat?.();
}

async function sendPrompt(prompt) {
  const turnId = ++state.turn;
  state.generating = true;
  setBusy(true);
  addLine("user", prompt);

  let searchText = "";
  if (looksLikeQuestion(prompt)) {
    setStatus("Searching…");
    try {
      searchText = await webSearch(prompt);
    } catch (err) {
      if (turnId !== state.turn) return;
      searchText = "Search failed: " + (err?.message || err);
    }
  }
  if (turnId !== state.turn) return;

  setStatus("Generating…");
  const messages = [
    { role: "system", content: systemPrompt(searchText) },
    ...state.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  let stream;
  try {
    stream = await state.engine.chat.completions.create({
      messages,
      temperature: 0.7,
      max_tokens: 512,
      stream: true,
      enable_thinking: true,
    });
  } catch (err) {
    if (turnId !== state.turn) return;
    throw err;
  }
  if (turnId !== state.turn) return;

  const shell = addAssistantShell();
  let raw = "";
  try {
    for await (const chunk of stream) {
      if (turnId !== state.turn) return;
      raw += chunk.choices?.[0]?.delta?.content || "";
      paintAssistant(shell, raw, false);
      ui.log.scrollTop = ui.log.scrollHeight;
    }
  } catch (err) {
    if (turnId !== state.turn) return;
    throw err;
  }
  if (turnId !== state.turn) return;

  const answer = visibleAnswer(raw) || raw.trim() || "(no response)";
  paintAssistant(shell, raw, true);
  if (!shell.answer.textContent.trim()) shell.answer.textContent = "\n" + answer;
  state.messages.push({ role: "assistant", content: answer });
  save();
  setStatus("Ready: " + state.loadedModel, 1);
  state.generating = false;
  setBusy(false);
}

function bind() {
  ui.model.addEventListener("change", async () => {
    state.model = ui.model.value;
    state.loadedModel = null;
    save();
    try {
      await ensureEngine();
    } catch (err) {
      setStatus("Could not load model: " + (err?.message || err), 0);
      state.loading = false;
      setBusy(false);
    }
  });

  ui.memory.addEventListener("change", save);
  ui.clear.addEventListener("click", clearHistory);

  ui.prompt.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!state.generating && !state.loading) ui.form.requestSubmit();
    }
  });

  ui.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.generating || state.loading) return;
    const prompt = ui.prompt.value.trim();
    if (!prompt) return;
    ui.prompt.value = "";
    try {
      await ensureEngine();
      await sendPrompt(prompt);
    } catch (err) {
      addLine("assistant", "Error: " + (err?.message || err));
      setStatus("Error. See the last message.", 0);
      state.generating = false;
      state.loading = false;
      setBusy(false);
    }
  });
}

function init() {
  const saved = loadSaved();
  if (saved) {
    state.model = saved.model || "";
    ui.memory.value = saved.memory || "";
    if (Array.isArray(saved.messages)) state.messages = saved.messages;
    else if (Array.isArray(saved.chats)) {
      const chat =
        saved.chats.find((c) => c.id === saved.activeId) || saved.chats.at(-1) || { messages: [] };
      state.messages = chat.messages || [];
    }
  }
  populateModels();
  renderLog();
  bind();

  loadWebllm()
    .then(() => {
      const current = ui.model.value;
      populateModels();
      if (current) ui.model.value = current;
    })
    .catch((err) => console.warn(err));

  if (!navigator.gpu) {
    setStatus("WebGPU is missing. Use Chrome or Edge with hardware acceleration.");
    setBusy(true);
    return;
  }

  if (saved?.model) {
    ensureEngine().catch((err) => {
      setStatus("Could not load model: " + (err?.message || err), 0);
      state.loading = false;
      setBusy(false);
    });
  } else {
    setStatus("Pick a model to download it.");
  }
}

init();
