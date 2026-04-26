import { CreateMLCEngine, prebuiltAppConfig } from "https://esm.run/@mlc-ai/web-llm";

const ui = {
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
  clearChat: document.getElementById("clear-chat"),
};

const state = {
  engine: null,
  loadedModel: null,
  loading: false,
  generating: false,
  messages: [
    {
      role: "system",
      content: "You are a helpful local AI assistant. Keep answers concise and clear.",
    },
  ],
};

function supportsWebGpu() {
  return Boolean(navigator.gpu);
}

function setStatus(text, progress = null) {
  ui.status.textContent = text;
  if (typeof progress === "number") {
    ui.progressBar.style.width = `${Math.round(progress * 100)}%`;
  }
}

function setBusy(isBusy) {
  ui.send.disabled = isBusy;
  ui.modelSelect.disabled = isBusy;
  ui.prompt.disabled = isBusy;
  ui.maxTokens.disabled = isBusy;
  ui.temperature.disabled = isBusy;
}

function addMessage(role, content) {
  const bubble = document.createElement("div");
  bubble.className = `msg ${role}`;
  bubble.textContent = content;
  ui.messages.appendChild(bubble);
  ui.messages.scrollTop = ui.messages.scrollHeight;
  return bubble;
}

function getSmallModelChoices() {
  const listed = prebuiltAppConfig.model_list
    .map((m) => m.model_id)
    .filter((id) => /(?:^|[-_])(0\.5|1|1\.5|2|3|4)B(?:[-_]|$)/i.test(id));

  const curated = [
    "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    "Phi-3.5-mini-instruct-q4f16_1-MLC",
    "Gemma-2-2b-it-q4f16_1-MLC",
  ];

  const all = [...new Set([...curated.filter((id) => listed.includes(id)), ...listed])];
  return all.length ? all : prebuiltAppConfig.model_list.slice(0, 8).map((m) => m.model_id);
}

function populateModels() {
  const options = getSmallModelChoices();
  for (const id of options) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id;
    ui.modelSelect.appendChild(opt);
  }
}

async function ensureEngine() {
  const wanted = ui.modelSelect.value;
  if (state.engine && state.loadedModel === wanted) return;

  state.loading = true;
  setBusy(true);
  setStatus(`Loading ${wanted}...`, 0);

  const initProgressCallback = (report) => {
    const text = report?.text || "Loading model...";
    const progress = typeof report?.progress === "number" ? report.progress : null;
    setStatus(text, progress);
  };

  state.engine = await CreateMLCEngine(wanted, {
    initProgressCallback,
    appConfig: prebuiltAppConfig,
  });

  state.loadedModel = wanted;
  state.loading = false;
  setBusy(false);
  setStatus(`Ready: ${wanted}`, 1);
}

async function sendPrompt(prompt) {
  state.generating = true;
  setBusy(true);
  setStatus("Generating...");

  addMessage("user", prompt);
  state.messages.push({ role: "user", content: prompt });
  const assistantBubble = addMessage("assistant", "");

  const temperature = Number(ui.temperature.value);
  const max_tokens = Number(ui.maxTokens.value);

  const stream = await state.engine.chat.completions.create({
    messages: state.messages,
    temperature,
    max_tokens,
    stream: true,
  });

  let reply = "";
  for await (const chunk of stream) {
    reply += chunk.choices?.[0]?.delta?.content || "";
    assistantBubble.textContent = reply || "...";
    ui.messages.scrollTop = ui.messages.scrollHeight;
  }

  state.messages.push({ role: "assistant", content: reply });
  setStatus(`Ready: ${state.loadedModel}`, 1);
  state.generating = false;
  setBusy(false);
}

function resetChat() {
  state.messages = [state.messages[0]];
  ui.messages.innerHTML = "";
  addMessage("assistant", "Hi! Choose a model, ask a question, and I will answer locally.");
}

function bindEvents() {
  ui.temperature.addEventListener("input", () => {
    ui.temperatureValue.textContent = ui.temperature.value;
  });

  ui.modelSelect.addEventListener("change", () => {
    state.engine = null;
    state.loadedModel = null;
    setStatus("Model changed. Send a prompt to load it.", 0);
  });

  ui.clearChat.addEventListener("click", resetChat);

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
      console.error(err);
      addMessage("assistant", `Error: ${err?.message || err}`);
      setStatus("Error. Check console for details.", 0);
      state.generating = false;
      state.loading = false;
      setBusy(false);
    }
  });
}

function init() {
  populateModels();
  bindEvents();
  resetChat();

  if (!supportsWebGpu()) {
    setStatus("WebGPU not available. Use a recent Chrome/Edge and enable hardware acceleration.", 0);
    setBusy(true);
    return;
  }

  setStatus("Ready. Type a prompt to download and load the selected model.", 0);
}

init();
