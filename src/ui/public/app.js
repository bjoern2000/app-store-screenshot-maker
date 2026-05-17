const CARD_WIDTH = 280;

const grid = document.getElementById("grid");
const localeSelect = document.getElementById("locale-select");
const refreshBtn = document.getElementById("refresh");
const renderAllBtn = document.getElementById("render-all");
const statusEl = document.getElementById("status");
const projectRootEl = document.getElementById("project-root");

let manifest = null;
let currentLocale = null;

async function fetchManifest() {
  const res = await fetch("/api/manifest");
  if (!res.ok) throw new Error(`manifest fetch ${res.status}`);
  return res.json();
}

async function fetchProjectRoot() {
  const res = await fetch("/api/project-root");
  if (!res.ok) return null;
  const data = await res.json();
  return data.root;
}

function setStatus(text, kind = "info") {
  if (!text) {
    statusEl.hidden = true;
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = text;
  statusEl.className = "status" + (kind === "error" ? " error" : "");
}

function groupCanvases(canvases) {
  const groups = new Map();
  for (const c of canvases) {
    const key = `${c.platform}__${c.device}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  for (const arr of groups.values()) arr.sort((a, b) => a.order - b.order);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function dimensionsFor(platform, device) {
  const overrides = manifest?.dimensions?.[platform]?.[device];
  if (overrides) return overrides;
  if (platform === "app_store") return { width: 1320, height: 2868 };
  return { width: 1080, height: 1920 };
}

function makeCard(canvas) {
  const dim = dimensionsFor(canvas.platform, canvas.device);
  const scale = CARD_WIDTH / dim.width;
  const cardHeight = Math.round(dim.height * scale);

  const item = document.createElement("div");
  item.className = "card-item";
  item.style.width = CARD_WIDTH + "px";

  const card = document.createElement("div");
  card.className = "card";
  card.style.width = CARD_WIDTH + "px";
  card.style.height = cardHeight + "px";

  const iframe = document.createElement("iframe");
  iframe.width = dim.width;
  iframe.height = dim.height;
  iframe.style.width = dim.width + "px";
  iframe.style.height = dim.height + "px";
  iframe.style.transform = `scale(${scale})`;
  iframe.src = `/preview/${encodeURIComponent(canvas.id)}/${encodeURIComponent(currentLocale)}`;
  iframe.dataset.canvasId = canvas.id;
  card.appendChild(iframe);

  const caption = document.createElement("div");
  caption.className = "caption";
  const idSpan = document.createElement("span");
  idSpan.className = "id";
  idSpan.textContent = canvas.id;
  const orderSpan = document.createElement("span");
  orderSpan.className = "order";
  orderSpan.textContent = `#${canvas.order}`;
  caption.appendChild(idSpan);
  caption.appendChild(orderSpan);

  item.appendChild(card);
  item.appendChild(caption);
  return item;
}

function render() {
  grid.innerHTML = "";
  if (!manifest || manifest.canvases.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No canvases yet. Ask the agent to add some.";
    grid.appendChild(empty);
    return;
  }
  for (const [key, canvases] of groupCanvases(manifest.canvases)) {
    const [platform, device] = key.split("__");
    const group = document.createElement("section");
    group.className = "group";
    const h2 = document.createElement("h2");
    h2.textContent = `${platform.replace("_", " ")} · ${device.replace("_", " ")}`;
    group.appendChild(h2);
    const row = document.createElement("div");
    row.className = "row";
    for (const c of canvases) row.appendChild(makeCard(c));
    group.appendChild(row);
    grid.appendChild(group);
  }
}

function syncLocaleOptions() {
  const previous = currentLocale;
  localeSelect.innerHTML = "";
  for (const locale of manifest.locales) {
    const opt = document.createElement("option");
    opt.value = locale;
    opt.textContent = locale;
    localeSelect.appendChild(opt);
  }
  currentLocale =
    previous && manifest.locales.includes(previous)
      ? previous
      : manifest.defaultLocale;
  localeSelect.value = currentLocale;
}

async function refresh() {
  try {
    const [m, root] = await Promise.all([fetchManifest(), fetchProjectRoot()]);
    manifest = m;
    if (root && projectRootEl) projectRootEl.textContent = root;
    syncLocaleOptions();
    render();
    setStatus(null);
  } catch (e) {
    setStatus(`Failed to load: ${e.message}`, "error");
  }
}

localeSelect.addEventListener("change", () => {
  currentLocale = localeSelect.value;
  render();
});
refreshBtn.addEventListener("click", refresh);
renderAllBtn.addEventListener("click", async () => {
  renderAllBtn.disabled = true;
  setStatus("Rendering all…");
  try {
    const res = await fetch("/api/render-all", { method: "POST" });
    const data = await res.json();
    if (data.errors?.length) {
      setStatus(`Wrote ${data.wrote}, ${data.errors.length} errors`, "error");
    } else {
      setStatus(`Wrote ${data.wrote} PNGs to output/`);
    }
  } catch (e) {
    setStatus(`Render failed: ${e.message}`, "error");
  } finally {
    renderAllBtn.disabled = false;
  }
});

refresh();

// Hot reload: subscribe to file change events from the server.
// Any reload event triggers a manifest refetch and an iframe reload.
function connectWs() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.addEventListener("message", () => {
    refresh();
  });
  ws.addEventListener("close", () => {
    // Reconnect after a short backoff so the UI keeps working across server restarts.
    setTimeout(connectWs, 1000);
  });
  ws.addEventListener("error", () => ws.close());
}
connectWs();
