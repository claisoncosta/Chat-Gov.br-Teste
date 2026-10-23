const API_URL = "/";
const TOKEN_KEY = "audita-token";
const USER_KEY = "audita-user";
const STORAGE_KEY = "audita-chats";
const SUGGESTIONS = [
  "Explique o que é o Padrão Digital de Governo.",
  "Resuma as regras de um chat seguro para o cidadão.",
  "Como posso organizar uma conversa longa?",
  "Dê um exemplo de resposta objetiva e clara.",
];

const form = document.getElementById("form");
const messageEl = document.getElementById("message");
const sendEl = document.getElementById("send");
const messagesEl = document.getElementById("messages");
const historyEl = document.getElementById("history");
const sidebar = document.getElementById("sidebar");
const backdrop = document.getElementById("backdrop");
const loginScreen = document.getElementById("login-screen");
const app = document.getElementById("app");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userLabel = document.getElementById("user-label");

let chats = [];
let currentId = null;

try {
  const header = document.querySelector(".br-header");
  if (window.core?.BRHeader && header) {
    new core.BRHeader("br-header", header);
  }
} catch {
  /* Header do DS é opcional se o JS oficial falhar. */
}

document.getElementById("new-chat").addEventListener("click", () => {
  currentId = createChat().id;
  render();
  closeSidebar();
  messageEl.focus();
});

document.getElementById("menu-toggle").addEventListener("click", () => {
  sidebar.classList.toggle("open");
  backdrop.hidden = !sidebar.classList.contains("open");
});

backdrop.addEventListener("click", closeSidebar);

messageEl.addEventListener("input", () => {
  messageEl.style.height = "auto";
  messageEl.style.height = `${Math.min(messageEl.scrollHeight, 160)}px`;
});

messageEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageEl.value.trim();
  if (!text || sendEl.disabled) return;

  const chat = getCurrent();
  chat.messages.push({ role: "user", content: text });
  if (chat.title === "Nova conversa") {
    chat.title = text.slice(0, 42);
  }
  messageEl.value = "";
  messageEl.style.height = "auto";
  save();
  render();
  await askBackend(text);
});

function closeSidebar() {
  sidebar.classList.remove("open");
  backdrop.hidden = true;
}

function loadChats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) || "[]");
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    /* ignore */
  }
  return [];
}

function save() {
  localStorage.setItem(storageKey(), JSON.stringify(chats));
}

function createChat() {
  const chat = { id: crypto.randomUUID(), title: "Nova conversa", messages: [] };
  chats.unshift(chat);
  save();
  return chat;
}

function getCurrent() {
  return chats.find((chat) => chat.id === currentId) || chats[0];
}

function render() {
  const chat = getCurrent();
  historyEl.replaceChildren(
    ...chats.map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `history-item${item.id === currentId ? " active" : ""}`;
      button.textContent = item.title;
      button.addEventListener("click", () => {
        currentId = item.id;
        render();
        closeSidebar();
      });
      return button;
    }),
  );

  messagesEl.replaceChildren();
  if (!chat.messages.length) {
    messagesEl.append(welcome());
    return;
  }

  for (const msg of chat.messages) {
    messagesEl.append(turn(msg.role, msg.content));
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function welcome() {
  const wrap = document.createElement("div");
  wrap.className = "welcome";
  wrap.innerHTML = `
    <div class="avatar" aria-hidden="true"><i class="fas fa-comments"></i></div>
    <h1>Como posso ajudar?</h1>
    <p>Envie uma mensagem. A resposta vem do backend OpenRouter.</p>
  `;
  const grid = document.createElement("div");
  grid.className = "suggestions";
  for (const text of SUGGESTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    button.textContent = text;
    button.addEventListener("click", () => {
      messageEl.value = text;
      form.requestSubmit();
    });
    grid.append(button);
  }
  wrap.append(grid);
  return wrap;
}

function turn(role, content) {
  const row = document.createElement("article");
  row.className = `turn ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerHTML = role === "user" ? '<i class="fas fa-user"></i>' : '<i class="fas fa-landmark"></i>';
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;
  row.append(avatar, bubble);
  return row;
}

async function askBackend(message) {
  sendEl.disabled = true;
  const pending = turn("assistant", "Pensando...");
  messagesEl.append(pending);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}`,
      },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    if (res.status === 401) {
      logout();
      throw new Error("Faça login novamente.");
    }
    if (!res.ok) throw new Error(formatDetail(data.detail) || res.statusText);
    pending.querySelector(".bubble").textContent = data.response;
    getCurrent().messages.push({ role: "assistant", content: data.response });
  } catch (err) {
    pending.classList.add("error");
    pending.querySelector(".bubble").textContent = `Não foi possível obter a resposta: ${err.message}`;
    getCurrent().messages.push({
      role: "error",
      content: pending.querySelector(".bubble").textContent,
    });
  } finally {
    save();
    sendEl.disabled = false;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function formatDetail(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  return JSON.stringify(detail);
}

function storageKey() {
  return `${STORAGE_KEY}:${sessionStorage.getItem(USER_KEY) || "anon"}`;
}

const confirmWrap = document.getElementById("confirm-wrap");
const confirmPassword = document.getElementById("confirm-password");
const registerSubmit = document.getElementById("register-submit");

async function postAuth(path, extraCheck) {
  loginError.hidden = true;
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  extraCheck?.(username, password);
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(formatDetail(data.detail) || "Falha na autenticação.");
  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(USER_KEY, data.username);
  showApp(data.username);
}

async function doLogin(event) {
  event.preventDefault();
  confirmWrap.hidden = true;
  const submit = document.getElementById("login-submit");
  submit.disabled = true;
  registerSubmit.disabled = true;
  try {
    await postAuth("login");
  } catch (err) {
    showAuthError(err);
  } finally {
    submit.disabled = false;
    registerSubmit.disabled = false;
  }
}

async function doRegister(event) {
  event.preventDefault();
  if (confirmWrap.hidden) {
    confirmWrap.hidden = false;
    confirmPassword.focus();
    return;
  }
  const submit = document.getElementById("login-submit");
  submit.disabled = true;
  registerSubmit.disabled = true;
  try {
    await postAuth("register", (_username, password) => {
      if (password !== confirmPassword.value) {
        throw new Error("As senhas não coincidem.");
      }
    });
  } catch (err) {
    showAuthError(err);
  } finally {
    submit.disabled = false;
    registerSubmit.disabled = false;
  }
}

function showAuthError(err) {
  const message =
    err.message === "Failed to fetch"
      ? "Não foi possível conectar ao servidor. Recarregue a página."
      : err.message;
  loginError.textContent = message;
  loginError.hidden = false;
}

loginForm.addEventListener("submit", doLogin);
document.getElementById("login-submit").addEventListener("click", doLogin);
registerSubmit.addEventListener("click", doRegister);
document.getElementById("username").addEventListener("keydown", (event) => {
  if (event.key === "Enter") doLogin(event);
});
document.getElementById("password").addEventListener("keydown", (event) => {
  if (event.key === "Enter") doLogin(event);
});
confirmPassword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") doRegister(event);
});

document.getElementById("logout").addEventListener("click", logout);

function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  loginScreen.hidden = false;
  app.hidden = true;
}

function showApp(username) {
  loginScreen.hidden = true;
  app.hidden = false;
  userLabel.textContent = username;
  chats = loadChats();
  currentId = chats[0]?.id || createChat().id;
  render();
}

const savedToken = sessionStorage.getItem(TOKEN_KEY);
const savedUser = sessionStorage.getItem(USER_KEY);
if (savedToken && savedUser) {
  showApp(savedUser);
} else {
  logout();
}
