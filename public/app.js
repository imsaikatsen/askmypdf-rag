// Keep one small client state object for the library, selected scope, and pending request.
const state = { docs: [], busy: false, answerNumber: 0, theme: localStorage.getItem("askmypdf-theme") || "auto" };
const $ = (selector) => document.querySelector(selector);
const ui = {
  list: $("#documentList"), count: $("#docCount"), libraryMeta: $("#libraryMeta"), select: $("#docSelect"),
  input: $("#questionInput"), form: $("#askForm"), send: $("#sendButton"), convo: $("#conversation"),
  welcome: $("#welcome"), scroll: $("#chatScroll"), file: $("#fileInput"), drop: $("#dropzone"),
  progress: $("#uploadProgress"), toast: $("#toastRegion"),
};

// Build DOM nodes through textContent and createElement so API and file text stays escaped.
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Show temporary, readable feedback for upload, search, and network errors.
function toast(message, success = false) {
  const item = node("div", `toast${success ? " success" : ""}`, message);
  ui.toast.append(item);
  window.setTimeout(() => item.remove(), 5000);
}

// Refresh both the document list and search scope from the API.
async function loadDocs() {
  const response = await fetch("/docs");
  if (!response.ok) throw new Error("Couldn't load your documents. Refresh the page to try again.");
  state.docs = await response.json();
  renderDocs();
}

// Render file rows and the scope selector without inserting untrusted markup.
function renderDocs() {
  ui.list.replaceChildren();
  ui.count.textContent = String(state.docs.length);
  ui.libraryMeta.textContent = `${state.docs.length} ${state.docs.length === 1 ? "file" : "files"}`;
  const current = ui.select.value;
  const options = [new Option("All documents", "")];
  state.docs.forEach((doc) => options.push(new Option(doc.file, doc.docId)));
  ui.select.replaceChildren(...options);
  if (state.docs.some((doc) => doc.docId === current)) ui.select.value = current;
  state.docs.forEach((doc) => {
    const row = node("li", "doc-row");
    row.append(node("span", "pdf-icon", "PDF"));
    const meta = node("span", "doc-meta");
    meta.append(node("span", "doc-name", doc.file), node("span", "doc-chunks", `${doc.chunks} text chunks`));
    row.append(meta);
    const remove = node("button", "icon-button delete-doc", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${doc.file}`);
    remove.addEventListener("click", () => deleteDoc(doc));
    row.append(remove);
    ui.list.append(row);
  });
  ui.input.disabled = state.docs.length === 0 || state.busy;
  ui.send.disabled = state.docs.length === 0 || state.busy;
  if (state.docs.length) ui.welcome.classList.add("has-docs");
  else ui.welcome.classList.remove("has-docs");
  $(".welcome-hint").hidden = state.docs.length > 0;
}

// Upload a selected or dropped PDF and refresh the visible library when indexing finishes.
async function uploadFile(file) {
  if (!file) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    toast("Please choose a PDF file. Other file types cannot be indexed.");
    return;
  }
  ui.progress.hidden = false;
  $("#uploadTitle").textContent = "Indexing PDF";
  $("#uploadHint").textContent = "Large documents can take a little while";
  const form = new FormData();
  form.append("file", file);
  try {
    const response = await fetch("/upload", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Upload failed (${response.status}). Please try again.`);
    await loadDocs();
    toast(`${data.file} is ready to search (${data.chunks} chunks).`, true);
  } catch (error) {
    toast(error.message || "Upload failed. Check your connection and try again.");
  } finally {
    ui.progress.hidden = true;
    $("#uploadTitle").textContent = "Add a PDF";
    const hint = $("#uploadHint");
    hint.replaceChildren(document.createTextNode("Drop it here or "));
    hint.append(node("u", "", "browse files"));
    ui.file.value = "";
  }
}

// Delete a selected document after the API confirms its chunks have been removed.
async function deleteDoc(doc) {
  try {
    const response = await fetch(`/docs/${encodeURIComponent(doc.docId)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Couldn't remove this document.");
    await loadDocs();
    toast(`${doc.file} removed from your library.`, true);
  } catch (error) {
    toast(error.message || "Couldn't remove this document.");
  }
}

// Add user messages and assistant responses with citation controls and source cards.
function appendAnswer(data) {
  const group = `answer-${++state.answerNumber}`;
  const assistant = node("article", "message assistant");
  assistant.append(node("div", "message-avatar", "A"));
  const bubble = node("div", "bubble assistant-bubble");
  addCitedText(bubble, data.answer || "I couldn't find an answer in the selected passages.", data.sources || [], group);
  assistant.append(bubble);
  ui.convo.append(assistant);

  if (data.sources?.length) {
    const cards = node("section", "sources");
    cards.setAttribute("aria-label", "Sources for this answer");
    cards.append(node("div", "sources-heading", "SOURCES"));
    data.sources.forEach((source) => cards.append(sourceCard(source, group)));
    ui.convo.append(cards);
  }
  ui.scroll.scrollTop = ui.scroll.scrollHeight;
}

// Convert citation markers into safe text nodes and clickable badges.
function addCitedText(container, text, sources, group) {
  const known = new Set(sources.map((source) => String(source.n)));
  const pattern = /\[(\d+)\]/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text))) {
    container.append(document.createTextNode(text.slice(cursor, match.index)));
    if (known.has(match[1])) {
      const badge = node("button", "citation-badge", `[${match[1]}]`);
      badge.type = "button";
      badge.setAttribute("aria-label", `Highlight source ${match[1]}`);
      badge.dataset.source = `${group}-${match[1]}`;
      badge.addEventListener("click", () => highlightSource(`${group}-${match[1]}`));
      container.append(badge);
    } else container.append(document.createTextNode(match[0]));
    cursor = pattern.lastIndex;
  }
  container.append(document.createTextNode(text.slice(cursor)));
}

// Build one source card and map it to the citation number used in the answer.
function sourceCard(source, group) {
  const card = node("article", "source-card");
  card.dataset.source = `${group}-${source.n}`;
  const top = node("div", "source-top");
  top.append(node("span", "source-number", `[${source.n}]`), node("span", "source-file", source.file), node("span", "source-page", `Page ${source.page}`));
  card.append(top);
  const score = Math.max(0, Math.min(1, Number(source.score) || 0));
  const scoreLine = node("div", "score-line");
  const track = node("span", "score-track");
  const fill = node("span", "score-fill");
  fill.style.width = `${score * 100}%`;
  track.append(fill);
  scoreLine.append(track, node("span", "score-text", `${Math.round(score * 100)}% match`));
  card.append(scoreLine, node("p", "source-snippet", source.snippet || "No passage preview was returned."));
  return card;
}

// Highlight and scroll to the source card matching a clicked citation badge.
function highlightSource(key) {
  document.querySelectorAll(".source-card.highlight,.citation-badge.active").forEach((el) => el.classList.remove("highlight", "active"));
  const card = [...document.querySelectorAll(".source-card")].find((el) => el.dataset.source === key);
  const badge = [...document.querySelectorAll(".citation-badge")].find((el) => el.dataset.source === key);
  if (card) { card.classList.add("highlight"); card.scrollIntoView({ behavior: "smooth", block: "center" }); }
  if (badge) badge.classList.add("active");
}

// Send a question, keep the composer locked during retrieval, and expose API failures as toasts.
async function ask(question) {
  const clean = question.trim();
  if (!clean || state.busy || state.docs.length === 0) return;
  state.busy = true;
  ui.input.disabled = true;
  ui.send.disabled = true;
  ui.welcome.hidden = true;
  const user = node("article", "message user");
  user.append(node("div", "bubble user-bubble", clean));
  ui.convo.append(user);
  const loading = node("div", "loading-line");
  const dots = node("span", "typing-dots");
  dots.append(node("i"), node("i"), node("i"));
  loading.append(dots, node("span", "loading-copy", "Searching your PDFs…"));
  ui.convo.append(loading);
  ui.scroll.scrollTop = ui.scroll.scrollHeight;
  try {
    const body = { question: clean };
    if (ui.select.value) body.docId = ui.select.value;
    const response = await fetch("/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Search failed (${response.status}). Please try again.`);
    // Replace the temporary loading row with the answer while keeping the user's question.
    loading.remove();
    appendAnswer(data);
  } catch (error) {
    loading.remove();
    toast(error.message || "Search failed. Check your connection and try again.");
  } finally {
    state.busy = false;
    ui.input.disabled = state.docs.length === 0;
    ui.send.disabled = state.docs.length === 0;
    ui.input.value = "";
    ui.input.focus();
    ui.scroll.scrollTop = ui.scroll.scrollHeight;
  }
}

// Wire upload, chat, theme, example prompts, and mobile navigation interactions.
$("#browseButton").addEventListener("click", () => ui.file.click());
ui.drop.addEventListener("click", (event) => { if (event.target !== ui.file) ui.file.click(); });
ui.drop.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); ui.file.click(); } });
ui.file.addEventListener("change", () => uploadFile(ui.file.files[0]));
["dragenter", "dragover"].forEach((type) => ui.drop.addEventListener(type, (event) => { event.preventDefault(); ui.drop.classList.add("dragover"); }));
["dragleave", "drop"].forEach((type) => ui.drop.addEventListener(type, (event) => { event.preventDefault(); ui.drop.classList.remove("dragover"); }));
ui.drop.addEventListener("drop", (event) => uploadFile(event.dataTransfer.files[0]));
ui.form.addEventListener("submit", (event) => { event.preventDefault(); ask(ui.input.value); });
ui.input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ui.form.requestSubmit(); } });
ui.input.addEventListener("input", () => { ui.input.style.height = "auto"; ui.input.style.height = `${Math.min(ui.input.scrollHeight, 160)}px`; });
document.querySelectorAll(".question-chip").forEach((chip) => chip.addEventListener("click", () => {
  if (!state.docs.length) { toast("Add a PDF first, then try one of these questions."); return; }
  ask(chip.textContent);
}));
$("#themeToggle").addEventListener("click", () => {
  const currentlyDark = state.theme === "auto"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : state.theme === "dark";
  state.theme = currentlyDark ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem("askmypdf-theme", state.theme);
  $("#themeIcon").textContent = state.theme === "dark" ? "☀" : "☾";
});
$("#openSidebar").addEventListener("click", () => document.body.classList.add("sidebar-open"));
$("#closeSidebar").addEventListener("click", () => document.body.classList.remove("sidebar-open"));
$("#sidebarScrim").addEventListener("click", () => document.body.classList.remove("sidebar-open"));

// Apply the saved theme (or follow the operating system) and load the initial library.
if (state.theme !== "auto") document.documentElement.dataset.theme = state.theme;
$("#themeIcon").textContent = state.theme === "dark" ? "☀" : "☾";
loadDocs().catch((error) => toast(error.message));
