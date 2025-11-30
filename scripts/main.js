/* ================================================================
   OnePage Monitoring v2.1
   Main JavaScript
   ----------------------------------------------------------------
   This file implements the entire application logic:
   - DB manager (local JSON simulation)
   - Status pages loader
   - Widget rendering engine
   - Dashboard controller
   - Admin panel
   - Analytics
   - Integrations
   - Notifications & history
   - Public link sharing
   - Settings manager
   - Role system
   - Environment manager
   - Feature flags
   - Utility functions
   ================================================================ */

/* ----------------------------------------------------------------
   GLOBAL STATE
------------------------------------------------------------------- */

const OPM = {
  env: "staging", // staging | production
  role: "public", // public | viewer | admin
  db: null,       // loaded from database/opm-db.json or localStorage
  statusConfigs: [],
  integrationConfigs: [],
  widgets: {}, // rendered widget instances
  history: [],
  notifications: [],
  autoRefreshTimer: null,
  analyticsCache: {},
  featureFlags: {},
  settings: {
    theme: "auto",
    compactMode: false,
    refreshInterval: 30,
    popupAlerts: true,
    alertSound: "beep"
  }
};

/* ----------------------------------------------------------------
   HELPER: ensure DB has all required arrays/objects
------------------------------------------------------------------- */

function ensureDBShape() {
  if (!OPM.db || typeof OPM.db !== "object") {
    OPM.db = {};
  }

  const db = OPM.db;

  if (!Array.isArray(db.statusPages)) db.statusPages = [];
  if (!Array.isArray(db.integrations)) db.integrations = [];
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.history)) db.history = [];
  if (!Array.isArray(db.notifications)) db.notifications = [];
  if (!Array.isArray(db.logs)) db.logs = [];
  if (!db.featureFlags || typeof db.featureFlags !== "object") db.featureFlags = {};
  if (!db.analyticsCache || typeof db.analyticsCache !== "object") db.analyticsCache = {};
  // support custom services feature
  if (!Array.isArray(db.customServices)) db.customServices = [];

  OPM.db = db;
}

/* ----------------------------------------------------------------
   INITIALIZATION SEQUENCE
------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadEnvironment();
    await loadDB();
    await loadConfigs();
    loadLocalSettings();
    applyTheme();
    applyCompactMode();
    applyRoleUI();
    applyEnvironmentBadge();

    bindGlobalUIEvents();
    bindTabEvents();
    bindSidebarEvents();
    bindCustomServiceEvents();
    bindSettingsEvents();
    bindProfileEvents();
    bindAdminEvents();
    bindNotificationEvents();
    bindHistoryEvents();
    bindPublicShareEvents();

    renderCustomServiceList();
    renderStatusTableAdmin();
    renderIntegrationsTableAdmin();
    renderFeatureFlags();

    renderAllWidgets();
    updateOverviewCounts();
    buildAnalyticsCharts();

    startAutoRefresh();

    logEvent("system", "Dashboard initialized");
  } catch (err) {
    console.error("Fatal initialization error:", err);
  }
});

/* ----------------------------------------------------------------
   LOADERS (DB, ENV, CONFIGS)
------------------------------------------------------------------- */

async function loadEnvironment() {
  const app = document.getElementById("app");
  OPM.env = app?.dataset.env ?? "staging";
}

async function loadDB() {
  // Load from localStorage or fallback to the JSON file
  const local = localStorage.getItem("opm-db");
  if (local) {
    try {
      OPM.db = JSON.parse(local);
      ensureDBShape();
      return;
    } catch (e) {
      console.warn("Local opm-db corrupt, ignoring:", e);
    }
  }

  try {
    // NOTE: path is relative to index.html root on GitHub Pages
    const res = await fetch("database/opm-db.json");
    if (!res.ok) throw new Error("DB file not found");
    OPM.db = await res.json();
    ensureDBShape();
  } catch (err) {
    console.error("Failed to load DB, using in-memory defaults:", err);
    // minimal safe fallback so app still runs
    OPM.db = {
      statusPages: [],
      integrations: [],
      users: [],
      history: [],
      notifications: [],
      logs: [],
      featureFlags: {},
      analyticsCache: {},
      customServices: []
    };
    ensureDBShape();
  }
  saveDB();
}

async function loadConfigs() {
  try {
    // Paths are relative to index.html
    const statusRes = await fetch("config/status-pages.json");
    const integRes  = await fetch("config/integrations.json");

    if (!statusRes.ok || !integRes.ok) throw new Error("Config fetch failed");

    const statusJson = await statusRes.json();
    const integJson  = await integRes.json();

    // Support both array and {statusPages:[…]} style configs
    OPM.statusConfigs      = Array.isArray(statusJson) ? statusJson : (statusJson.statusPages || []);
    OPM.integrationConfigs = Array.isArray(integJson)  ? integJson  : (integJson.integrations || []);
  } catch (err) {
    console.error("Failed to load configs:", err);
    OPM.statusConfigs = [];
    OPM.integrationConfigs = [];
  }
}

/* ----------------------------------------------------------------
   SAVE DB
------------------------------------------------------------------- */

function saveDB() {
  try {
    localStorage.setItem("opm-db", JSON.stringify(OPM.db));
  } catch (e) {
    console.warn("Failed to save DB to localStorage:", e);
  }
}

/* ----------------------------------------------------------------
   SETTINGS MANAGER
------------------------------------------------------------------- */

function loadLocalSettings() {
  const stored = localStorage.getItem("opm-settings");
  if (stored) {
    try {
      OPM.settings = { ...OPM.settings, ...JSON.parse(stored) };
    } catch (e) {
      console.warn("Invalid local settings, ignoring:", e);
    }
  }
}

function saveLocalSettings() {
  localStorage.setItem("opm-settings", JSON.stringify(OPM.settings));
}

function applyTheme() {
  const theme = OPM.settings.theme;

  if (theme === "dark") {
    document.body.dataset.theme = "dark";
  } else if (theme === "light") {
    document.body.dataset.theme = "light";
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.body.dataset.theme = prefersDark ? "dark" : "light";
  }
}

function applyCompactMode() {
  if (OPM.settings.compactMode) {
    document.body.classList.add("compact");
  } else {
    document.body.classList.remove("compact");
  }
}

function applyRoleUI() {
  const viewAdmin = document.getElementById("viewAdmin");
  const tabAdmin  = document.getElementById("tabAdmin");
  const roleLabel = document.querySelector("#roleLabel");

  if (viewAdmin) viewAdmin.hidden = OPM.role !== "admin";
  if (tabAdmin)  tabAdmin.style.display = OPM.role === "admin" ? "" : "none";
  if (roleLabel) {
    roleLabel.textContent =
      OPM.role === "admin" ? "Admin" :
      OPM.role === "viewer" ? "Viewer" : "Public";
  }
}

function applyEnvironmentBadge() {
  const badge = document.getElementById("envBadge");
  if (badge) badge.textContent = OPM.env.toUpperCase();
}

/* ----------------------------------------------------------------
   UI EVENT BINDINGS
------------------------------------------------------------------- */

function bindGlobalUIEvents() {
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const refreshAllBtn  = document.getElementById("refreshAllBtn");

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      OPM.settings.theme = document.body.dataset.theme === "dark" ? "light" : "dark";
      saveLocalSettings();
      applyTheme();
    });
  }

  if (refreshAllBtn) {
    refreshAllBtn.addEventListener("click", refreshAllWidgets);
  }
}

function bindTabEvents() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelector(".tab.active")?.classList.remove("active");
      tab.classList.add("active");

      document.querySelector(".view--active")?.classList.remove("view--active");

      const viewId = "view" + tab.dataset.view.charAt(0).toUpperCase() + tab.dataset.view.slice(1);
      const view = document.getElementById(viewId);
      if (view) view.classList.add("view--active");
    });
  });
}

function bindSidebarEvents() {
  const toggleBtn = document.getElementById("sidebarToggleBtn");
  const sidebar   = document.getElementById("sidebar");
  if (!toggleBtn || !sidebar) return;

  toggleBtn.addEventListener("click", () => sidebar.classList.toggle("open"));
}

/* ----------------------------------------------------------------
   CUSTOM SERVICES (NEW: events + renderer)
------------------------------------------------------------------- */

function bindCustomServiceEvents() {
  const nameInput = document.getElementById("customServiceName");
  const urlInput  = document.getElementById("customServiceUrl");
  const addBtn    = document.getElementById("addCustomServiceBtn");

  if (!addBtn || !nameInput || !urlInput) return;

  addBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const url  = urlInput.value.trim();

    if (!name || !url) {
      alert("Please enter both a name and status URL.");
      return;
    }

    ensureDBShape();
    OPM.db.customServices.push({
      id: uuid(),
      name,
      url,
      created: Date.now()
    });
    saveDB();
    nameInput.value = "";
    urlInput.value = "";
    renderCustomServiceList();
  });
}

function renderCustomServiceList() {
  const container = document.getElementById("customServicesList");
  if (!container) return;

  ensureDBShape();
  const services = OPM.db.customServices || [];

  container.innerHTML = "";

  if (!services.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No custom services added yet.";
    container.appendChild(empty);
    return;
  }

  services.forEach((svc, index) => {
    const row = document.createElement("div");
    row.className = "custom-service-item";
    row.innerHTML = `
      <span class="svc-name">${svc.name}</span>
      <span class="svc-url">${svc.url}</span>
      <button class="btn btn-ghost btn-compact" data-index="${index}">Remove</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      OPM.db.customServices.splice(index, 1);
      saveDB();
      renderCustomServiceList();
    });
    container.appendChild(row);
  });
}

/* ----------------------------------------------------------------
   SETTINGS EVENTS
------------------------------------------------------------------- */

function bindSettingsEvents() {
  const themeSelect  = document.getElementById("settingsThemeSelect");
  const compactCheck = document.getElementById("settingsCompactMode");
  const intervalSel  = document.getElementById("settingsRefreshInterval");
  const testSoundBtn = document.getElementById("testAlertSoundBtn");
  const resetBtn     = document.getElementById("resetLocalDataBtn");

  if (themeSelect) {
    themeSelect.value = OPM.settings.theme;
    themeSelect.addEventListener("change", e => {
      OPM.settings.theme = e.target.value;
      saveLocalSettings();
      applyTheme();
    });
  }

  if (compactCheck) {
    compactCheck.checked = OPM.settings.compactMode;
    compactCheck.addEventListener("change", e => {
      OPM.settings.compactMode = e.target.checked;
      saveLocalSettings();
      applyCompactMode();
    });
  }

  if (intervalSel) {
    intervalSel.value = String(OPM.settings.refreshInterval);
    intervalSel.addEventListener("change", e => {
      OPM.settings.refreshInterval = Number(e.target.value);
      saveLocalSettings();
      restartAutoRefresh();
    });
  }

  if (testSoundBtn) {
    testSoundBtn.addEventListener("click", () => {
      playAlertSound(OPM.settings.alertSound);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      localStorage.clear();
      alert("Local data reset. Reloading page.");
      location.reload();
    });
  }
}

/* ----------------------------------------------------------------
   PROFILE / ROLE EVENTS
------------------------------------------------------------------- */

function bindProfileEvents() {
  const adminBtn  = document.getElementById("loginAsAdminBtn");
  const viewerBtn = document.getElementById("loginAsViewerBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (adminBtn) {
    adminBtn.addEventListener("click", () => {
      OPM.role = "admin";
      applyRoleUI();
      logEvent("auth", "Logged in as admin");
    });
  }

  if (viewerBtn) {
    viewerBtn.addEventListener("click", () => {
      OPM.role = "viewer";
      applyRoleUI();
      logEvent("auth", "Switched to viewer");
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      OPM.role = "public";
      applyRoleUI();
      logEvent("auth", "Logged out");
    });
  }
}

/* ----------------------------------------------------------------
   ADMIN EVENTS
------------------------------------------------------------------- */

function bindAdminEvents() {
  const addStatusBtn = document.getElementById("adminAddStatusPageBtn");
  const clearLogsBtn = document.getElementById("clearLogsBtn");

  if (addStatusBtn) {
    addStatusBtn.addEventListener("click", () => {
      const name = prompt("Service name:");
      const url = prompt("API URL:");
      const page = prompt("Public status page URL:");

      if (name && url) {
        ensureDBShape();
        OPM.db.statusPages.push({
          id: uuid(),
          name,
          api: url,
          page,
          enabled: true,
          env: "staging"
        });
        saveDB();
        renderStatusTableAdmin();
        renderAllWidgets();
      }
    });
  }

  if (clearLogsBtn) {
    clearLogsBtn.addEventListener("click", () => {
      ensureDBShape();
      OPM.db.logs = [];
      saveDB();
      renderLogs();
    });
  }
}

/* ----------------------------------------------------------------
   NOTIFICATION EVENTS
------------------------------------------------------------------- */

function bindNotificationEvents() {
  const notifBtn = document.getElementById("notifBtn");
  const closeBtn = document.getElementById("closeNotifPanelBtn");
  const panel    = document.getElementById("notifPanel");

  if (notifBtn && panel) {
    notifBtn.addEventListener("click", () => {
      panel.hidden = false;
    });
  }

  if (closeBtn && panel) {
    closeBtn.addEventListener("click", () => {
      panel.hidden = true;
    });
  }
}

/* ----------------------------------------------------------------
   HISTORY EVENTS
------------------------------------------------------------------- */

function bindHistoryEvents() {
  const openBtn1 = document.getElementById("openHistoryBtn");
  const openBtn2 = document.getElementById("historyQuickBtn");
  const closeBtn1 = document.getElementById("closeHistoryModalBtn");
  const closeBtn2 = document.getElementById("closeHistoryModalBtn2");

  if (openBtn1) openBtn1.addEventListener("click", openHistoryModal);
  if (openBtn2) openBtn2.addEventListener("click", openHistoryModal);
  if (closeBtn1) closeBtn1.addEventListener("click", closeHistoryModal);
  if (closeBtn2) closeBtn2.addEventListener("click", closeHistoryModal);
}

/* ----------------------------------------------------------------
   PUBLIC SHARE EVENTS
------------------------------------------------------------------- */

function bindPublicShareEvents() {
  const btn = document.getElementById("createPublicLinkBtn");
  if (!btn) return;
  btn.addEventListener("click", createPublicSnapshot);
}

/* ----------------------------------------------------------------
   WIDGET RENDERING
------------------------------------------------------------------- */

function renderAllWidgets() {
  const grid = document.getElementById("statusWidgetsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  OPM.statusConfigs
    .filter(w => w.enabled !== false)
    .forEach(config => {
      const widget = renderWidget(config);
      OPM.widgets[config.id] = widget;
      grid.appendChild(widget.el);
      refreshWidget(config.id);
    });
}

function renderWidget(config) {
  const el = document.createElement("article");
  el.className = "widget-card";

  el.innerHTML = `
    <div class="widget-header">
      <div class="widget-name">${config.name}</div>
      <div class="widget-status-dot widget-status-unknown" id="dot-${config.id}"></div>
    </div>
    <div class="widget-desc" id="desc-${config.id}">Loading...</div>
    <div class="widget-actions">
      <button class="btn btn-ghost btn-compact" data-action="refresh">Refresh</button>
      <a class="btn btn-ghost btn-compact" href="${config.page}" target="_blank" rel="noopener noreferrer">Open</a>
    </div>
  `;

  el.querySelector("[data-action='refresh']").addEventListener("click", () => refreshWidget(config.id));

  return { config, el };
}

/* ----------------------------------------------------------------
   WIDGET REFRESHING
------------------------------------------------------------------- */

async function refreshAllWidgets() {
  for (const id of Object.keys(OPM.widgets)) {
    await refreshWidget(id);
  }
  updateOverviewCounts();
}

async function refreshWidget(id) {
  const widget = OPM.widgets[id];
  if (!widget) return;
  const config = widget.config;

  setStatus(id, "unknown", "Checking...");

  try {
    const status = await fetchStatus(config.api);
    setStatus(id, status.level, status.message);

    logEvent("status", `${config.name}: ${status.level}`);
    updateHistory(id, config.name, status.level, status.message);
    checkNotificationTrigger(config.name, status);
  } catch (err) {
    console.error("refreshWidget error:", err);
    setStatus(id, "unknown", "Unable to load");
  }
}

function setStatus(id, level, message) {
  const dot  = document.getElementById(`dot-${id}`);
  const desc = document.getElementById(`desc-${id}`);

  if (dot)  dot.className = `widget-status-dot widget-status-${mapStatusToColor(level)}`;
  if (desc) desc.textContent = message;
}

function mapStatusToColor(level) {
  if (["ok", "operational"].includes(level)) return "ok";
  if (["warning", "minor", "degraded"].includes(level)) return "warn";
  if (["major", "down", "critical"].includes(level)) return "down";
  return "unknown";
}

/* ----------------------------------------------------------------
   STATUS FETCHING ENGINE (JSON, RSS-basics, HTML fallback)
------------------------------------------------------------------- */

async function fetchStatus(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });

    clearTimeout(timeout);
    const ct = res.headers.get("content-type") || "";

    if (ct.includes("application/json")) {
      return normalizeJsonStatus(await res.json());
    }

    if (ct.includes("xml") || ct.includes("rss")) {
      const text = await res.text();
      return normalizeRssStatus(text);
    }

    const text = await res.text();
    return normalizeHtmlStatus(text);
  } catch {
    return { level: "unknown", message: "Unreachable / offline" };
  }
}

function normalizeJsonStatus(json) {
  if (json.status) {
    return {
      level: mapStatus(json.status),
      message: json.status_description || "Status received"
    };
  }
  return { level: "unknown", message: "Unknown JSON format" };
}

function normalizeRssStatus(xmlText) {
  if (xmlText.includes("<item>")) {
    return { level: "warning", message: "Recent RSS incident" };
  }
  return { level: "ok", message: "No recent incidents" };
}

function normalizeHtmlStatus(html) {
  if (/degrad|incident|partial/i.test(html)) {
    return { level: "warning", message: "Possible degradation" };
  }
  return { level: "ok", message: "Looks operational" };
}

function mapStatus(s) {
  s = s.toLowerCase();
  if (s.includes("operational") || s.includes("ok")) return "ok";
  if (s.includes("partial") || s.includes("minor") || s.includes("degrad")) return "warning";
  if (s.includes("major") || s.includes("down") || s.includes("critical")) return "major";
  return "unknown";
}

/* ----------------------------------------------------------------
   OVERVIEW COUNTS
------------------------------------------------------------------- */

function updateOverviewCounts() {
  const opEl = document.getElementById("countOperational");
  const warnEl = document.getElementById("countWarning");
  const downEl = document.getElementById("countDown");
  const unkEl = document.getElementById("countUnknown");

  if (!opEl || !warnEl || !downEl || !unkEl) return;

  let ok = 0, warn = 0, down = 0, unknown = 0;

  for (const id in OPM.widgets) {
    const descEl = document.getElementById(`desc-${id}`);
    const desc = (descEl?.textContent || "").toLowerCase();

    if (desc.includes("ok") || desc.includes("operational")) ok++;
    else if (desc.includes("warn") || desc.includes("degrad")) warn++;
    else if (desc.includes("major") || desc.includes("down")) down++;
    else unknown++;
  }

  opEl.textContent = ok;
  warnEl.textContent = warn;
  downEl.textContent = down;
  unkEl.textContent = unknown;
}

/* ----------------------------------------------------------------
   AUTO-REFRESH ENGINE
------------------------------------------------------------------- */

function startAutoRefresh() {
  if (OPM.settings.refreshInterval > 0) {
    OPM.autoRefreshTimer = setInterval(refreshAllWidgets, OPM.settings.refreshInterval * 1000);
  }
}

function restartAutoRefresh() {
  if (OPM.autoRefreshTimer) clearInterval(OPM.autoRefreshTimer);
  startAutoRefresh();
}

/* ----------------------------------------------------------------
   HISTORY SYSTEM
------------------------------------------------------------------- */

function updateHistory(id, name, level, message) {
  ensureDBShape();
  const entry = {
    id: uuid(),
    widgetId: id,
    name,
    level,
    message,
    ts: Date.now()
  };

  OPM.db.history.push(entry);
  saveDB();

  renderRecentAlerts();
}

function renderRecentAlerts() {
  const list = document.getElementById("recentAlertsList");
  if (!list) return;
  list.innerHTML = "";

  const recent = [...OPM.db.history].slice(-10).reverse();
  recent.forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.textContent = `[${formatTs(item.ts)}] ${item.name}: ${item.message}`;
    list.appendChild(div);
  });
}

function openHistoryModal() {
  const modal   = document.getElementById("historyModal");
  const overlay = document.getElementById("historyOverlay");
  if (modal)   modal.hidden = false;
  if (overlay) overlay.hidden = false;
  renderHistoryList();
}

function closeHistoryModal() {
  const modal   = document.getElementById("historyModal");
  const overlay = document.getElementById("historyOverlay");
  if (modal)   modal.hidden = true;
  if (overlay) overlay.hidden = true;
}

function renderHistoryList() {
  const list = document.getElementById("historyList");
  if (!list) return;

  list.innerHTML = "";

  OPM.db.history.slice().reverse().forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.textContent = `[${formatTs(item.ts)}] ${item.name}: ${item.message}`;
    list.appendChild(div);
  });
}

/* ----------------------------------------------------------------
   NOTIFICATIONS SYSTEM
------------------------------------------------------------------- */

function checkNotificationTrigger(name, status) {
  if (status.level === "major" || status.level === "down") {
    pushNotification(`${name} is DOWN`, status.message);
  }
}

function pushNotification(title, message) {
  ensureDBShape();
  const notif = { id: uuid(), title, message, ts: Date.now(), unread: true };
  OPM.db.notifications.push(notif);
  saveDB();
  renderNotificationList();
  showPopupAlert(`${title}: ${message}`);
  playAlertSound(OPM.settings.alertSound);
}

function renderNotificationList() {
  const list = document.getElementById("notifList");
  if (!list) return;
  list.innerHTML = "";
  OPM.db.notifications.slice().reverse().forEach(n => {
    const div = document.createElement("div");
    div.className = "notif-item";
    div.innerHTML = `<strong>${n.title}</strong><br>${n.message}<br><small>${formatTs(n.ts)}</small>`;
    list.appendChild(div);
  });
}

function showPopupAlert(text) {
  if (!OPM.settings.popupAlerts) return;

  const popup = document.getElementById("alertPopup");
  if (!popup) return;

  popup.textContent = text;
  popup.hidden = false;

  setTimeout(() => {
    popup.hidden = true;
  }, 4000);
}

function playAlertSound(type) {
  if (type === "none") return;
  // path relative to index.html on GitHub Pages
  new Audio(`assets/sounds/${type}.mp3`).play().catch(() => {});
}

/* ----------------------------------------------------------------
   PUBLIC SHARE SNAPSHOT
------------------------------------------------------------------- */

function createPublicSnapshot() {
  const snapshot = {
    created: Date.now(),
    widgets: OPM.statusConfigs.filter(w => w.enabled),
    history: [...OPM.db.history]
  };

  const json = btoa(JSON.stringify(snapshot));
  const url = `${location.origin}${location.pathname}#public=${json}`;

  const area = document.getElementById("publicLinkArea");
  if (area) {
    area.innerHTML = `<input class="input" value="${url}" readonly />`;
  }

  logEvent("public", "Created snapshot link");
}

/* ----------------------------------------------------------------
   ADMIN SECTION (Tables, Feature Flags)
------------------------------------------------------------------- */

function renderStatusTableAdmin() {
  const tbody = document.querySelector("#adminStatusTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  OPM.statusConfigs.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.name}</td>
      <td>${row.category || "-"}</td>
      <td>${row.api}</td>
      <td>${row.page}</td>
      <td>${row.enabled ? "Yes" : "No"}</td>
      <td>${row.env || "all"}</td>
      <td>
        <button class="btn btn-ghost btn-compact" data-id="${row.id}" data-act="toggle">Toggle</button>
      </td>
    `;
    tr.querySelector("[data-act='toggle']").addEventListener("click", () => {
      row.enabled = !row.enabled;
      saveDB();
      renderStatusTableAdmin();
      renderAllWidgets();
    });
    tbody.appendChild(tr);
  });
}

function renderIntegrationsTableAdmin() {
  const tbody = document.querySelector("#adminIntegrationsTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  OPM.integrationConfigs.forEach(i => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i.name}</td>
      <td>${i.type}</td>
      <td>${i.env}</td>
      <td>${i.enabled ? "Enabled" : "Disabled"}</td>
      <td><button class="btn btn-ghost btn-compact">Edit</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderFeatureFlags() {
  const list = document.getElementById("featureFlagsList");
  if (!list) return;

  list.innerHTML = "";

  const flags = OPM.db.featureFlags || {};
  for (const key in flags) {
    const div = document.createElement("div");
    div.className = "field field--inline";

    div.innerHTML = `
      <input type="checkbox" id="flag-${key}" ${flags[key] ? "checked" : ""} />
      <span class="field-label-inline">${key}</span>
    `;

    div.querySelector("input").addEventListener("change", e => {
      OPM.db.featureFlags[key] = e.target.checked;
      saveDB();
    });

    list.appendChild(div);
  }
}

/* ----------------------------------------------------------------
   ANALYTICS
------------------------------------------------------------------- */

function buildAnalyticsCharts() {
  const c1 = document.getElementById("chartUptime");
  const c2 = document.getElementById("chartIncidents");
  const c3 = document.getElementById("chartIntegrations");

  if (c1?.getContext) {
    c1.getContext("2d").fillText("Uptime chart placeholder", 20, 20);
  }
  if (c2?.getContext) {
    c2.getContext("2d").fillText("Incidents chart placeholder", 20, 20);
  }
  if (c3?.getContext) {
    c3.getContext("2d").fillText("Integrations chart placeholder", 20, 20);
  }
}

/* ----------------------------------------------------------------
   UTILITIES
------------------------------------------------------------------- */

function uuid() {
  return "xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function formatTs(ts) {
  return new Date(ts).toLocaleString();
}

function logEvent(type, text) {
  ensureDBShape();
  OPM.db.logs.push({
    id: uuid(),
    ts: Date.now(),
    type,
    text
  });
  saveDB();
  renderLogs();
}

function renderLogs() {
  const logList = document.getElementById("logList");
  if (!logList) return;
  logList.innerHTML = "";
  OPM.db.logs.slice().reverse().forEach(l => {
    const div = document.createElement("div");
    div.textContent = `[${formatTs(l.ts)}] (${l.type}) - ${l.text}`;
    logList.appendChild(div);
  });
}

/* End of main.js */
