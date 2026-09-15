const FALLBACK_MODELS = [
  { model_id: "Qwen3-0.6B-q4f16_1-MLC", vram_required_MB: 1403 },
  { model_id: "Qwen3-1.7B-q4f16_1-MLC", vram_required_MB: 2037 },
  { model_id: "Qwen3-4B-q4f16_1-MLC", vram_required_MB: 3432 },
  { model_id: "Qwen3-8B-q4f16_1-MLC", vram_required_MB: 5696 },
  { model_id: "Qwen3.5-0.8B-q4f16_1-MLC", vram_required_MB: 1629 },
  { model_id: "Qwen3.5-2B-q4f16_1-MLC", vram_required_MB: 2245 },
  { model_id: "Qwen3.5-4B-q4f16_1-MLC", vram_required_MB: 3868 },
  { model_id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", vram_required_MB: 945 },
  { model_id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", vram_required_MB: 1630 },
  { model_id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", vram_required_MB: 2505 },
  { model_id: "Qwen2.5-7B-Instruct-q4f16_1-MLC", vram_required_MB: 5107 },
  { model_id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC", vram_required_MB: 1630 },
  { model_id: "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC", vram_required_MB: 5107 },
  { model_id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", vram_required_MB: 879 },
  { model_id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", vram_required_MB: 2264 },
  { model_id: "Llama-3.1-8B-Instruct-q4f16_1-MLC", vram_required_MB: 5001 },
  { model_id: "Phi-3.5-mini-instruct-q4f16_1-MLC", vram_required_MB: 3672 },
  { model_id: "Phi-4-mini-instruct-q4f16_1-MLC", vram_required_MB: 3438 },
  { model_id: "gemma-2-2b-it-q4f16_1-MLC", vram_required_MB: 1895 },
  { model_id: "gemma-2-9b-it-q4f16_1-MLC", vram_required_MB: 6422 },
  { model_id: "gemma3-1b-it-q4f16_1-MLC", vram_required_MB: 711 },
  { model_id: "SmolLM2-360M-Instruct-q4f16_1-MLC", vram_required_MB: 376 },
  { model_id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC", vram_required_MB: 1774 },
  { model_id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC", vram_required_MB: 697 },
  { model_id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC", vram_required_MB: 4573 },
  { model_id: "Hermes-3-Llama-3.2-3B-q4f16_1-MLC", vram_required_MB: 2264 },
  { model_id: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC", vram_required_MB: 4876 },
  { model_id: "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC", vram_required_MB: 5107 },
  { model_id: "OLMo-2-0425-1B-Instruct-q4f16_1-MLC", vram_required_MB: 1777 },
  { model_id: "OLMo-2-1124-7B-Instruct-q4f16_1-MLC", vram_required_MB: 6479 },
];

let webllm = null;

async function loadWebllm() {
  if (!webllm) {
    webllm = await import("https://esm.run/@mlc-ai/web-llm");
  }
  return webllm;
}

const COOKIE_PREFIX = "wlc";
const COOKIE_COUNT = "wlcn";
const CHUNK = 3200;
const MAX_CHUNKS = 18;
const MAX_CHATS = 24;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 4000;

const ui = {
  sidebar: document.getElementById("sidebar"),
  backdrop: document.getElementById("sidebar-backdrop"),
  menuBtn: document.getElementById("menu-btn"),
  modelSelect: document.getElementById("model-select"),
  temperature: document.getElementById("temperature"),
  temperatureValue: document.getElementById("temperature-value"),
  maxTokens: document.getElementById("max-tokens"),
  status: document.getElementById("status-text"),
  progressBar: document.getElementById("progress-bar"),
  messages: document.getElementById("messages"),
  form: document.getElementById("composer"),
  prompt: document.getElementById("prompt"),
  send: document.getElementById("send"),
  newChat: document.getElementById("new-chat"),
  chatList: document.getElementById("chat-list"),
  chatTitle: document.getElementById("chat-title"),
  skillMemory: document.getElementById("skill-memory"),
  skillSearch: document.getElementById("skill-search"),
  memoryPanel: document.getElementById("memory-panel"),
  memoryList: document.getElementById("memory-list"),
  memoryEmpty: document.getElementById("memory-empty"),
  clearMemories: document.getElementById("clear-memories"),
};

const params = new URLSearchParams(location.search);
const demoShot = params.has("shot");
const openMenu = params.has("menu") || params.get("shot") === "menu";

const state = {
  engine: null,
  loadedModel: null,
  loading: false,
  generating: false,
  loadToken: 0,
  model: "",
  temperature: 0.7,
  maxTokens: 512,
  memoryOn: false,
  searchOn: false,
  memories: [],
  chats: [],
  activeId: null,
};

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function supportsWebGpu() {
  return Boolean(navigator.gpu);
}

function cookieMap() {
  return Object.fromEntries(
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const i = part.indexOf("=");
        return [part.slice(0, i), part.slice(i + 1)];
      }),
  );
}

function writeCookie(name, value, maxAge = 31536000) {
  document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
}

function toCookieText(payload) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function fromCookieText(text) {
  return JSON.parse(decodeURIComponent(escape(atob(text))));
}

function persist(payload) {
  const encoded = toCookieText(payload);
  const chunks = Math.ceil(encoded.length / CHUNK);
  if (chunks > MAX_CHUNKS) return false;
  for (let i = 0; i < chunks; i += 1) {
    writeCookie(`${COOKIE_PREFIX}${i}`, encoded.slice(i * CHUNK, (i + 1) * CHUNK));
  }
  writeCookie(COOKIE_COUNT, String(chunks));
  for (let i = chunks; i < MAX_CHUNKS; i += 1) {
    writeCookie(`${COOKIE_PREFIX}${i}`, "", 0);
  }
  return true;
}

function loadPersisted() {
  const cookies = cookieMap();
  const n = Number(cookies[COOKIE_COUNT] || 0);
  if (!n) return null;
  let encoded = "";
  for (let i = 0; i < n; i += 1) {
    encoded += cookies[`${COOKIE_PREFIX}${i}`] || "";
  }
  try {
    return fromCookieText(encoded);
  } catch {
    return null;
  }
}

function snapshot() {
  return {
    v: 1,
    model: state.model,
    temperature: state.temperature,
    maxTokens: state.maxTokens,
    memoryOn: state.memoryOn,
    searchOn: state.searchOn,
    memories: state.memories,
    activeId: state.activeId,
    chats: state.chats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
      messages: chat.messages.slice(-MAX_MESSAGES).map((msg) => ({
        role: msg.role,
        content: String(msg.content || "").slice(0, MAX_MESSAGE_CHARS),
        kind: msg.kind,
      })),
    })),
  };
}

function save() {
  let data = snapshot();
  while (!persist(data) && data.chats.length) {
    data.chats = data.chats.slice(1);
    if (data.activeId && !data.chats.some((chat) => chat.id === data.activeId)) {
      data.activeId = data.chats.at(-1)?.id || null;
    }
  }
}

function setStatus(text, progress = null) {
  ui.status.textContent = text;
  if (typeof progress === "number") {
    ui.progressBar.style.width = `${Math.round(progress * 100)}%`;
  }
}

function setBusy(isBusy) {
  ui.send.disabled = isBusy;
  ui.prompt.disabled = isBusy;
  ui.modelSelect.disabled = isBusy;
  ui.maxTokens.disabled = isBusy;
  ui.temperature.disabled = isBusy;
}

function activeChat() {
  return state.chats.find((chat) => chat.id === state.activeId) || null;
}

function familyOf(id) {
  if (/qwen3\.5/i.test(id)) return "Qwen 3.5";
  if (/qwen3/i.test(id)) return "Qwen 3";
  if (/qwen2\.5-coder/i.test(id)) return "Qwen 2.5 Coder";
  if (/qwen2\.5-math/i.test(id)) return "Qwen 2.5 Math";
  if (/qwen2/i.test(id)) return "Qwen 2.5";
  if (/llama-3\.2/i.test(id)) return "Llama 3.2";
  if (/llama-3\.1/i.test(id)) return "Llama 3.1";
  if (/hermes-3/i.test(id)) return "Hermes 3";
  if (/hermes-2/i.test(id)) return "Hermes 2";
  if (/phi-4/i.test(id)) return "Phi 4";
  if (/phi-3/i.test(id)) return "Phi 3.5";
  if (/gemma3/i.test(id)) return "Gemma 3";
  if (/gemma-2/i.test(id)) return "Gemma 2";
  if (/smollm/i.test(id)) return "SmolLM2";
  if (/mistral|openhermes|neuralhermes|wizardmath/i.test(id)) return "Mistral";
  if (/deepseek.*qwen/i.test(id)) return "DeepSeek Qwen";
  if (/deepseek.*llama/i.test(id)) return "DeepSeek Llama";
  if (/olmo/i.test(id)) return "OLMo 2";
  if (/tinyllama/i.test(id)) return "TinyLlama";
  if (/stablelm/i.test(id)) return "StableLM";
  if (/redpajama/i.test(id)) return "RedPajama";
  return "Other";
}

function modelLabel(record) {
  const id = record.model_id.replace(/-MLC$/, "");
  const gb = record.vram_required_MB
    ? ` · ${(record.vram_required_MB / 1024).toFixed(1)} GB`
    : "";
  return `${id}${gb}`;
}

function isChatModel(record) {
  const type = record.model_type;
  return type === undefined || type === 0 || type === "LLM";
}

function getModelRecords() {
  const source = webllm?.prebuiltAppConfig?.model_list || FALLBACK_MODELS;
  const seen = new Set();
  const records = [];
  for (const record of source) {
    if (!isChatModel(record)) continue;
    if (/-1k$/i.test(record.model_id)) continue;
    if (seen.has(record.model_id)) continue;
    seen.add(record.model_id);
    records.push(record);
  }
  return records;
}

function populateModels() {
  const records = getModelRecords();
  const groups = new Map();
  for (const record of records) {
    const family = familyOf(record.model_id);
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push(record);
  }

  ui.modelSelect.innerHTML = "";
  for (const [family, items] of groups) {
    const group = document.createElement("optgroup");
    group.label = family;
    for (const record of items) {
      const opt = document.createElement("option");
      opt.value = record.model_id;
      opt.textContent = modelLabel(record);
      group.appendChild(opt);
    }
    ui.modelSelect.appendChild(group);
  }

  const preferred = [
    "Qwen3-0.6B-q4f16_1-MLC",
    "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  ];
  const available = new Set(records.map((r) => r.model_id));
  const initial =
    (state.model && available.has(state.model) && state.model) ||
    preferred.find((id) => available.has(id)) ||
    records[0]?.model_id ||
    "";
  ui.modelSelect.value = initial;
  state.model = initial;
}

function renderChats() {
  ui.chatList.innerHTML = "";
  const chats = [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const chat of chats) {
    const row = document.createElement("div");
    row.className = `chat-item${chat.id === state.activeId ? " active" : ""}`;

    const open = document.createElement("button");
    open.type = "button";
    open.className = "chat-open";
    open.textContent = chat.title || "New chat";
    open.addEventListener("click", () => selectChat(chat.id));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "x";
    del.setAttribute("aria-label", "Delete chat");
    del.textContent = "×";
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteChat(chat.id);
    });

    row.append(open, del);
    ui.chatList.appendChild(row);
  }
}

function renderMemories() {
  ui.skillMemory.classList.toggle("on", state.memoryOn);
  ui.skillMemory.setAttribute("aria-pressed", String(state.memoryOn));
  ui.skillSearch.classList.toggle("on", state.searchOn);
  ui.skillSearch.setAttribute("aria-pressed", String(state.searchOn));
  ui.memoryPanel.hidden = !state.memoryOn;
  ui.memoryList.innerHTML = "";
  ui.memoryEmpty.hidden = state.memories.length > 0;
  for (const [index, fact] of state.memories.entries()) {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = fact;
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      state.memories.splice(index, 1);
      save();
      renderMemories();
    });
    item.append(text, del);
    ui.memoryList.appendChild(item);
  }
}

function renderMessages() {
  const chat = activeChat();
  ui.messages.innerHTML = "";
  ui.chatTitle.textContent = chat?.title || "New chat";
  const messages = chat?.messages || [];
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML =
      "<h2>Chat locally</h2><p>Pick a model to download it. Memory and web search stay on this device, saved in cookies.</p>";
    ui.messages.appendChild(empty);
    return;
  }
  for (const msg of messages) {
    const bubble = document.createElement("div");
    if (msg.kind === "event") {
      bubble.className = "event";
    } else {
      bubble.className = `msg ${msg.role}`;
    }
    bubble.textContent = msg.content;
    ui.messages.appendChild(bubble);
  }
  ui.messages.scrollTop = ui.messages.scrollHeight;
}

function appendBubble(role, content, kind) {
  const empty = ui.messages.querySelector(".empty");
  if (empty) empty.remove();
  const bubble = document.createElement("div");
  bubble.className = kind === "event" ? "event" : `msg ${role}`;
  bubble.textContent = content;
  ui.messages.appendChild(bubble);
  ui.messages.scrollTop = ui.messages.scrollHeight;
  return bubble;
}

function pushMessage(role, content, kind) {
  const chat = activeChat();
  if (!chat) return;
  chat.messages.push({ role, content, kind });
  chat.updatedAt = Date.now();
  if (role === "user" && chat.title === "New chat") {
    chat.title = content.trim().slice(0, 42) || "New chat";
    ui.chatTitle.textContent = chat.title;
    renderChats();
  }
  save();
}

function createChat(title = "New chat") {
  const chat = {
    id: uid(),
    title,
    updatedAt: Date.now(),
    messages: [],
  };
  state.chats.push(chat);
  if (state.chats.length > MAX_CHATS) state.chats = state.chats.slice(-MAX_CHATS);
  state.activeId = chat.id;
  save();
  renderChats();
  renderMessages();
  return chat;
}

function selectChat(id) {
  state.activeId = id;
  save();
  renderChats();
  renderMessages();
  closeSidebar();
}

function deleteChat(id) {
  state.chats = state.chats.filter((chat) => chat.id !== id);
  if (state.activeId === id) {
    state.activeId = state.chats.at(-1)?.id || null;
    if (!state.activeId) createChat();
  }
  save();
  renderChats();
  renderMessages();
}

function closeSidebar() {
  ui.sidebar.classList.remove("open");
  ui.backdrop.hidden = true;
}

function systemPrompt() {
  const parts = [
    "You are a helpful on-device assistant. Keep answers clear and concise.",
  ];
  if (state.memoryOn && state.memories.length) {
    parts.push(`Known facts about the user:\n- ${state.memories.join("\n- ")}`);
  }
  const tools = [];
  if (state.searchOn) {
    tools.push(
      'web_search: look up current or factual information. Args JSON: {"query":"search terms"}',
    );
  }
  if (state.memoryOn) {
    tools.push('remember: save a durable fact about the user. Args JSON: {"fact":"..."}');
    tools.push(
      'forget: remove a saved memory matching text. Args JSON: {"query":"..."}',
    );
  }
  if (tools.length) {
    parts.push(
      "You can use tools. When a tool is needed, output one or more blocks and nothing else in that turn:",
    );
    parts.push('<tool name="TOOL_NAME">{"arg":"value"}</tool>');
    parts.push(`Tools:\n${tools.map((t) => `- ${t}`).join("\n")}`);
    parts.push("After you receive a tool result, answer the user. Do not invent tool results.");
  }
  return parts.join("\n\n");
}

function parseTools(text) {
  const found = [];
  const re = /<tool\s+name=["']([a-zA-Z0-9_]+)["']>\s*([\s\S]*?)<\/tool>/g;
  let match;
  while ((match = re.exec(text))) {
    let args = {};
    try {
      args = JSON.parse(match[2].trim() || "{}");
    } catch {
      args = { raw: match[2].trim() };
    }
    found.push({ name: match[1], args, raw: match[0] });
  }
  return found;
}

async function wikipediaSearch(query) {
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("origin", "*");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", query);
  searchUrl.searchParams.set("srlimit", "5");
  searchUrl.searchParams.set("format", "json");
  const search = await fetch(searchUrl).then((r) => r.json());
  const hits = search?.query?.search || [];
  if (!hits.length) return `No web results for "${query}".`;

  const titles = hits.map((hit) => hit.title).join("|");
  const extractUrl = new URL("https://en.wikipedia.org/w/api.php");
  extractUrl.searchParams.set("origin", "*");
  extractUrl.searchParams.set("action", "query");
  extractUrl.searchParams.set("prop", "extracts|info");
  extractUrl.searchParams.set("exintro", "1");
  extractUrl.searchParams.set("explaintext", "1");
  extractUrl.searchParams.set("inprop", "url");
  extractUrl.searchParams.set("titles", titles);
  extractUrl.searchParams.set("format", "json");
  const extracts = await fetch(extractUrl).then((r) => r.json());
  const pages = Object.values(extracts?.query?.pages || {});
  return pages
    .map((page) => {
      const body = String(page.extract || hits.find((h) => h.title === page.title)?.snippet || "")
        .replace(/<[^>]+>/g, "")
        .slice(0, 700);
      return `# ${page.title}\n${body}\n${page.fullurl || ""}`;
    })
    .join("\n\n");
}

async function runTool(name, args) {
  if (name === "web_search") {
    if (!state.searchOn) return "Web search is turned off.";
    const query = String(args.query || args.raw || "").trim();
    if (!query) return "Missing search query.";
    appendBubble("assistant", `Searched the web for “${query}”`, "event");
    pushMessage("assistant", `Searched the web for “${query}”`, "event");
    try {
      return await wikipediaSearch(query);
    } catch (err) {
      return `Search failed: ${err?.message || err}`;
    }
  }
  if (name === "remember") {
    if (!state.memoryOn) return "Memory is turned off.";
    const fact = String(args.fact || args.raw || "").trim();
    if (!fact) return "Missing fact.";
    if (!state.memories.includes(fact)) state.memories.push(fact);
    save();
    renderMemories();
    appendBubble("assistant", `Remembered: ${fact}`, "event");
    pushMessage("assistant", `Remembered: ${fact}`, "event");
    return `Saved memory: ${fact}`;
  }
  if (name === "forget") {
    if (!state.memoryOn) return "Memory is turned off.";
    const query = String(args.query || args.raw || "").trim().toLowerCase();
    const before = state.memories.length;
    state.memories = state.memories.filter((item) => !item.toLowerCase().includes(query));
    save();
    renderMemories();
    return before === state.memories.length
      ? "No matching memory."
      : "Removed matching memories.";
  }
  return `Unknown tool: ${name}`;
}

async function ensureEngine() {
  const wanted = ui.modelSelect.value;
  if (!wanted) throw new Error("No model selected.");
  if (state.engine && state.loadedModel === wanted) return;
  if (demoShot) {
    state.loadedModel = wanted;
    setStatus(`Ready: ${wanted}`, 1);
    return;
  }

  const token = ++state.loadToken;
  state.loading = true;
  setBusy(true);
  setStatus(`Loading ${wanted}…`, 0);

  const initProgressCallback = (report) => {
    if (token !== state.loadToken) return;
    setStatus(report?.text || "Loading model…", report?.progress ?? null);
  };

  const { CreateMLCEngine, prebuiltAppConfig } = await loadWebllm();
  if (state.engine) {
    await state.engine.reload(wanted);
  } else {
    state.engine = await CreateMLCEngine(wanted, {
      initProgressCallback,
      appConfig: prebuiltAppConfig,
    });
  }

  if (token !== state.loadToken) return;
  state.loadedModel = wanted;
  state.model = wanted;
  state.loading = false;
  setBusy(false);
  setStatus(`Ready: ${wanted}`, 1);
  save();
}

function historyForModel(chat) {
  return chat.messages
    .filter((msg) => msg.kind !== "event" && (msg.role === "user" || msg.role === "assistant"))
    .map((msg) => ({ role: msg.role, content: msg.content }));
}

async function complete(messages, streamTarget) {
  const request = {
    messages,
    temperature: Number(ui.temperature.value),
    max_tokens: Number(ui.maxTokens.value),
    stream: true,
    enable_thinking: false,
  };
  const stream = await state.engine.chat.completions.create(request);
  let reply = "";
  for await (const chunk of stream) {
    reply += chunk.choices?.[0]?.delta?.content || "";
    if (streamTarget) {
      streamTarget.textContent = reply || "…";
      ui.messages.scrollTop = ui.messages.scrollHeight;
    }
  }
  return reply.trim();
}

async function sendPrompt(prompt) {
  const chat = activeChat() || createChat();
  state.generating = true;
  setBusy(true);
  setStatus("Generating…");

  appendBubble("user", prompt);
  pushMessage("user", prompt);

  const turn = [
    { role: "system", content: systemPrompt() },
    ...historyForModel(chat),
  ];

  let bubble = appendBubble("assistant", "");
  let reply = "";
  for (let round = 0; round < 3; round += 1) {
    reply = await complete(turn, bubble);
    const tools = parseTools(reply);
    if (!tools.length) break;
    bubble.textContent = "Using tools…";
    const toolNotes = [];
    for (const tool of tools) {
      const result = await runTool(tool.name, tool.args);
      toolNotes.push(`Tool ${tool.name} result:\n${result}`);
    }
    turn.push({ role: "assistant", content: reply });
    turn.push({ role: "user", content: toolNotes.join("\n\n") });
    bubble.textContent = "";
  }

  bubble.textContent = reply || "(no response)";
  pushMessage("assistant", bubble.textContent);
  setStatus(`Ready: ${state.loadedModel}`, 1);
  state.generating = false;
  setBusy(false);
}

function resizePrompt() {
  ui.prompt.style.height = "auto";
  ui.prompt.style.height = `${Math.min(ui.prompt.scrollHeight, 180)}px`;
}

function bindEvents() {
  ui.temperature.addEventListener("input", () => {
    ui.temperatureValue.textContent = ui.temperature.value;
    state.temperature = Number(ui.temperature.value);
    save();
  });

  ui.maxTokens.addEventListener("change", () => {
    state.maxTokens = Number(ui.maxTokens.value);
    save();
  });

  ui.prompt.addEventListener("input", resizePrompt);
  ui.prompt.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!state.generating && !state.loading) ui.form.requestSubmit();
    }
  });

  ui.modelSelect.addEventListener("change", async () => {
    state.model = ui.modelSelect.value;
    state.loadedModel = null;
    save();
    try {
      await ensureEngine();
    } catch (err) {
      console.error(err);
      setStatus(`Could not load model: ${err?.message || err}`, 0);
      state.loading = false;
      setBusy(false);
    }
  });

  ui.newChat.addEventListener("click", () => {
    createChat();
    closeSidebar();
    ui.prompt.focus();
  });

  ui.skillMemory.addEventListener("click", () => {
    state.memoryOn = !state.memoryOn;
    save();
    renderMemories();
  });

  ui.skillSearch.addEventListener("click", () => {
    state.searchOn = !state.searchOn;
    save();
    renderMemories();
  });

  ui.clearMemories.addEventListener("click", () => {
    state.memories = [];
    save();
    renderMemories();
  });

  ui.menuBtn.addEventListener("click", () => {
    ui.sidebar.classList.add("open");
    ui.backdrop.hidden = false;
  });
  ui.backdrop.addEventListener("click", closeSidebar);

  ui.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.generating || state.loading) return;
    const prompt = ui.prompt.value.trim();
    if (!prompt) return;
    ui.prompt.value = "";
    resizePrompt();
    try {
      await ensureEngine();
      await sendPrompt(prompt);
    } catch (err) {
      console.error(err);
      appendBubble("assistant", `Error: ${err?.message || err}`);
      setStatus("Error. Check the console for details.", 0);
      state.generating = false;
      state.loading = false;
      setBusy(false);
    }
  });
}

function hydrate() {
  const saved = loadPersisted();
  if (!saved) {
    createChat();
    return;
  }
  state.model = saved.model || "";
  state.temperature = saved.temperature ?? 0.7;
  state.maxTokens = saved.maxTokens ?? 512;
  state.memoryOn = Boolean(saved.memoryOn);
  state.searchOn = Boolean(saved.searchOn);
  state.memories = Array.isArray(saved.memories) ? saved.memories : [];
  state.chats = Array.isArray(saved.chats) ? saved.chats : [];
  state.activeId = saved.activeId || state.chats[0]?.id || null;
  ui.temperature.value = String(state.temperature);
  ui.temperatureValue.textContent = String(state.temperature);
  ui.maxTokens.value = String(state.maxTokens);
  if (!state.chats.length || !state.activeId) createChat();
}

function seedShot() {
  state.memoryOn = true;
  state.searchOn = true;
  state.memories = ["Prefers concise answers", "Works on local-first tools"];
  state.chats = [
    {
      id: "shot-1",
      title: "On-device chat",
      updatedAt: Date.now(),
      messages: [
        { role: "user", content: "What can this app do without a server?" },
        {
          role: "assistant",
          content:
            "It downloads a WebLLM model into your browser, chats locally, and keeps threads plus memories in cookies. Web search is an optional skill when you need a lookup.",
        },
        { role: "assistant", content: "Searched the web for “WebLLM”", kind: "event" },
      ],
    },
    {
      id: "shot-2",
      title: "Qwen vs Llama",
      updatedAt: Date.now() - 5000,
      messages: [{ role: "user", content: "Compare tiny instruct models." }],
    },
  ];
  state.activeId = "shot-1";
  setStatus("Ready: Qwen3-0.6B-q4f16_1-MLC", 1);
}

function init() {
  hydrate();
  populateModels();
  if (demoShot) seedShot();
  renderChats();
  renderMessages();
  renderMemories();
  bindEvents();
  resizePrompt();
  if (openMenu) {
    ui.sidebar.classList.add("open");
    ui.backdrop.hidden = false;
  }

  if (demoShot) return;

  loadWebllm()
    .then(() => {
      const current = ui.modelSelect.value;
      populateModels();
      if (current) ui.modelSelect.value = current;
    })
    .catch((err) => console.warn("Could not refresh model catalog", err));

  if (!supportsWebGpu()) {
    setStatus("WebGPU is unavailable. Use a recent Chrome or Edge with hardware acceleration.", 0);
    setBusy(true);
    return;
  }

  if (loadPersisted()?.model) {
    ensureEngine().catch((err) => {
      console.error(err);
      setStatus(`Could not load model: ${err?.message || err}`, 0);
      state.loading = false;
      setBusy(false);
    });
  } else {
    setStatus("Select a model to download it locally.", 0);
  }
}

init();
