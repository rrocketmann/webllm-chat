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
  chats: $("chats"),
  memory: $("memory"),
  status: $("status"),
  progress: $("progress"),
  log: $("log"),
  form: $("form"),
  prompt: $("prompt"),
  send: $("send"),
  newChat: $("new-chat"),
  deleteChat: $("delete-chat"),
};

let webllm = null;
const state = {
  engine: null,
  loadedModel: null,
  loading: false,
  generating: false,
  loadToken: 0,
  model: "",
  chats: [],
  activeId: null,
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

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
    activeId: state.activeId,
    memory: ui.memory.value,
    chats: state.chats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      messages: chat.messages.slice(-40).map((m) => ({
        role: m.role,
        content: String(m.content).slice(0, 4000),
      })),
    })),
  };
  const raw = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const size = 3200;
  const n = Math.ceil(raw.length / size);
  if (n > 18) {
    if (state.chats.length <= 1) return;
    state.chats = state.chats.slice(-Math.max(1, state.chats.length - 1));
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
  if (typeof progress === "number") ui.progress.value = progress;
}

function setBusy(busy) {
  ui.send.disabled = busy;
  ui.prompt.disabled = busy;
  ui.model.disabled = busy;
}

function activeChat() {
  return state.chats.find((c) => c.id === state.activeId) || null;
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

function renderChats() {
  ui.chats.innerHTML = "";
  for (const chat of state.chats) {
    const opt = document.createElement("option");
    opt.value = chat.id;
    opt.textContent = chat.title || "Chat";
    ui.chats.appendChild(opt);
  }
  if (state.activeId) ui.chats.value = state.activeId;
}

function renderLog() {
  const chat = activeChat();
  ui.log.innerHTML = "";
  for (const msg of chat?.messages || []) {
    const p = document.createElement("p");
    const who = document.createElement("b");
    who.textContent = msg.role === "user" ? "You" : "Assistant";
    p.append(who, document.createTextNode("\n" + msg.content));
    ui.log.appendChild(p);
  }
  ui.log.scrollTop = ui.log.scrollHeight;
}

function addLine(role, content) {
  const chat = activeChat();
  if (!chat) return;
  chat.messages.push({ role, content });
  if (role === "user" && chat.title === "Chat") {
    chat.title = content.slice(0, 40);
    renderChats();
  }
  const p = document.createElement("p");
  const who = document.createElement("b");
  who.textContent = role === "user" ? "You" : "Assistant";
  p.append(who, document.createTextNode("\n" + content));
  ui.log.appendChild(p);
  ui.log.scrollTop = ui.log.scrollHeight;
  save();
  return p;
}

function createChat() {
  const chat = { id: uid(), title: "Chat", messages: [] };
  state.chats.push(chat);
  state.activeId = chat.id;
  save();
  renderChats();
  renderLog();
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

async function sendPrompt(prompt) {
  const chat = activeChat() || (createChat(), activeChat());
  state.generating = true;
  setBusy(true);
  addLine("user", prompt);

  let searchText = "";
  if (looksLikeQuestion(prompt)) {
    setStatus("Searching…");
    try {
      searchText = await webSearch(prompt);
    } catch (err) {
      searchText = "Search failed: " + (err?.message || err);
    }
  }

  setStatus("Generating…");
  const messages = [
    { role: "system", content: systemPrompt(searchText) },
    ...chat.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content })),
  ];

  const stream = await state.engine.chat.completions.create({
    messages,
    temperature: 0.7,
    max_tokens: 512,
    stream: true,
    enable_thinking: false,
  });

  const line = addLine("assistant", "");
  let reply = "";
  for await (const chunk of stream) {
    reply += chunk.choices?.[0]?.delta?.content || "";
    line.lastChild.textContent = "\n" + (reply || "…");
  }
  reply = reply.trim() || "(no response)";
  line.lastChild.textContent = "\n" + reply;
  chat.messages[chat.messages.length - 1].content = reply;
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

  ui.chats.addEventListener("change", () => {
    state.activeId = ui.chats.value;
    save();
    renderLog();
  });

  ui.newChat.addEventListener("click", () => {
    createChat();
    ui.prompt.focus();
  });

  ui.deleteChat.addEventListener("click", () => {
    state.chats = state.chats.filter((c) => c.id !== state.activeId);
    if (!state.chats.length) createChat();
    else state.activeId = state.chats.at(-1).id;
    save();
    renderChats();
    renderLog();
  });

  ui.memory.addEventListener("change", save);

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
    state.chats = Array.isArray(saved.chats) ? saved.chats : [];
    state.activeId = saved.activeId || state.chats[0]?.id || null;
    ui.memory.value = saved.memory || "";
  }
  if (!state.chats.length) createChat();
  populateModels();
  renderChats();
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
