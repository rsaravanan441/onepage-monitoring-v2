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
   INITIALIZATION SEQUENCE
------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
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
    OPM.db = JSON.parse(local);
    return;
  }
  const res = await fetch("../database/opm-db.json");
  OPM.db = await res.json();
  saveDB();
}

async function loadConfigs() {
  const statusRes = await fetch("../config/status-pages.json");
  const integRes = await fetch("../config/integrations.json");

  OPM.statusConfigs = await statusRes.json();
  OPM.integrationConfigs = await integRes.json();
}

/* ----------------------------------------------------------------
   SAVE DB
------------------------------------------------------------------- */

function saveDB() {
  localStorage.setItem("opm-db", JSON.stringify(OPM.db));
}

/* ----------------------------------------------------------------
   SETTINGS MANAGER
------------------------------------------------------------------- */

function loadLocalSettings() {
  const stored = localStorage.getItem("opm-settings");
  if (stored) OPM.settings = { ...OPM.settings, ...JSON.parse(stored) };
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
  // Hide admin tab if not admin
  document.getElementById("viewAdmin").hidden = OPM.role !== "admin";
  document.getElementById("tabAdmin").style.display = OPM.role === "admin" ? "" : "none";
  document.querySelector("#roleLabel").textContent =
    OPM.role === "admin" ? "Admin" :
    OPM.role === "viewer" ? "Viewer" : "Public";
}

function applyEnvironmentBadge() {
  const badge = document.getElementById("envBadge");
  badge.textContent = OPM.env.toUpperCase();
}

/* ----------------------------------------------------------------
   UI EVENT BINDINGS
------------------------------------------------------------------- */

function bindGlobalUIEvents() {
  document.getElementById("themeToggleBtn").addEventListener("click", () => {
    OPM.settings.theme = document.body.dataset.theme === "dark" ? "light" : "dark";
    saveLocalSettings();
    applyTheme();
  });

  document.getElementById("refreshAllBtn").addEventListener("click", refreshAllWidgets);
}

function bindTabEvents() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelector(".tab.active")?.classList.remove("active");
      tab.classList.add("active");

      document.querySelector(".view--active")?.classList.remove("view--active");

      const viewId = "view" + tab.dataset.view.charAt(0).toUpperCase() + tab.dataset.view.slice(1);
      document.getElementById(viewId).classList.add("view--active");
    });
  });
}

function bindSidebarEvents() {
  const toggleBtn = document.getElementById("sidebarToggleBtn");
  const sidebar = document.getElementById("sidebar");
  toggleBtn.addEventListener("click", () => sidebar.classList.toggle("open"));
}

function bindSettingsEvents() {
  document.getElementById("settingsThemeSelect").addEventListener("change", e => {
    OPM.settings.theme = e.target.value;
    saveLocalSettings();
    applyTheme();
  });

  document.getElementById("settingsCompactMode").addEventListener("change", e => {
    OPM.settings.compactMode = e.target.checked;
    saveLocalSettings();
    applyCompactMode();
  });

  document.getElementById("settingsRefreshInterval").addEventListener("change", e => {
    OPM.settings.refreshInterval = Number(e.target.value);
    saveLocalSettings();
    restartAutoRefresh();
  });

  document.getElementById("testAlertSoundBtn").addEventListener("click", () => {
    playAlertSound(OPM.settings.alertSound);
  });

  document.getElementById("resetLocalDataBtn").addEventListener("click", () => {
    localStorage.clear();
    alert("Local data reset. Reloading page.");
    location.reload();
  });
}

function bindProfileEvents() {
  document.getElementById("loginAsAdminBtn").addEventListener("click", () => {
    OPM.role = "admin";
    applyRoleUI();
    logEvent("auth", "Logged in as admin");
  });

  document.getElementById("loginAsViewerBtn").addEventListener("click", () => {
    OPM.role = "viewer";
    applyRoleUI();
    logEvent("auth", "Switched to viewer");
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    OPM.role = "public";
    applyRoleUI();
    logEvent("auth", "Logged out");
  });
}

function bindAdminEvents() {
  document.getElementById("adminAddStatusPageBtn").addEventListener("click", () => {
    const name = prompt("Service name:");
    const url = prompt("API URL:");
    const page = prompt("Public status page URL:");

    if (name && url) {
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

  document.getElementById("clearLogsBtn").addEventListener("click", () => {
    OPM.db.logs = [];
    saveDB();
    renderLogs();
  });
}

function bindNotificationEvents() {
  document.getElementById("notifBtn").addEventListener("click", () => {
    document.getElementById("notifPanel").hidden = false;
  });
  document.getElementById("closeNotifPanelBtn").addEventListener("click", () => {
    document.getElementById("notifPanel").hidden = true;
  });
}

function bindHistoryEvents() {
  document.getElementById("openHistoryBtn").addEventListener("click", openHistoryModal);
  document.getElementById("historyQuickBtn").addEventListener("click", openHistoryModal);

  document.getElementById("closeHistoryModalBtn").addEventListener("click", closeHistoryModal);
  document.getElementById("closeHistoryModalBtn2").addEventListener("click", closeHistoryModal);
}

function bindPublicShareEvents() {
  document.getElementById("createPublicLinkBtn").addEventListener("click", createPublicSnapshot);
}

/* ----------------------------------------------------------------
   WIDGET RENDERING
------------------------------------------------------------------- */

function renderAllWidgets() {
  const grid = document.getElementById("statusWidgetsGrid");
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
      <a class="btn btn-ghost btn-compact" href="${config.page}" target="_blank">Open</a>
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
  const config = widget.config;

  setStatus(id, "unknown", "Checking...");

  try {
    const status = await fetchStatus(config.api);
    setStatus(id, status.level, status.message);

    logEvent("status", `${config.name}: ${status.level}`);
    updateHistory(id, config.name, status.level, status.message);
    checkNotificationTrigger(config.name, status);
  } catch (err) {
    setStatus(id, "unknown", "Unable to load");
  }
}

function setStatus(id, level, message) {
  const dot = document.getElementById(`dot-${id}`);
  const desc = document.getElementById(`desc-${id}`);

  dot.className = `widget-status-dot widget-status-${mapStatusToColor(level)}`;
  desc.textContent = message;
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
  if (s.includes("partial") || s.includes("minor")) return "warning";
  if (s.includes("major") || s.includes("down") || s.includes("critical")) return "major";
  return "unknown";
}

/* ----------------------------------------------------------------
   OVERVIEW COUNTS
------------------------------------------------------------------- */

function updateOverviewCounts() {
  let ok = 0, warn = 0, down = 0, unknown = 0;

  for (const id in OPM.widgets) {
    const desc = document.getElementById(`desc-${id}`).textContent.toLowerCase();

    if (desc.includes("ok") || desc.includes("operational")) ok++;
    else if (desc.includes("warn") || desc.includes("degrad")) warn++;
    else if (desc.includes("major") || desc.includes("down")) down++;
    else unknown++;
  }

  document.getElementById("countOperational").textContent = ok;
  document.getElementById("countWarning").textContent = warn;
  document.getElementById("countDown").textContent = down;
  document.getElementById("countUnknown").textContent = unknown;
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
  document.getElementById("historyModal").hidden = false;
  document.getElementById("historyOverlay").hidden = false;
  renderHistoryList();
}

function closeHistoryModal() {
  document.getElementById("historyModal").hidden = true;
  document.getElementById("historyOverlay").hidden = true;
}

function renderHistoryList() {
  const list = document.getElementById("historyList");
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
  const notif = { id: uuid(), title, message, ts: Date.now(), unread: true };
  OPM.db.notifications.push(notif);
  saveDB();
  renderNotificationList();
  showPopupAlert(`${title}: ${message}`);
  playAlertSound(OPM.settings.alertSound);
}

function renderNotificationList() {
  const list = document.getElementById("notifList");
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
  popup.textContent = text;
  popup.hidden = false;

  setTimeout(() => {
    popup.hidden = true;
  }, 4000);
}

function playAlertSound(type) {
  if (type === "none") return;
  new Audio(`../assets/sounds/${type}.mp3`).play().catch(() => {});
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
  area.innerHTML = `<input class="input" value="${url}" readonly />`;

  logEvent("public", "Created snapshot link");
}

/* ----------------------------------------------------------------
   ADMIN SECTION (Tables, Feature Flags)
------------------------------------------------------------------- */

function renderStatusTableAdmin() {
  const tbody = document.querySelector("#adminStatusTable tbody");
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
  // Placeholder — charts can be integrated using Chart.js if desired
  // For now we create simple textual placeholders
  document.getElementById("chartUptime").getContext("2d").fillText("Uptime chart placeholder", 20, 20);
  document.getElementById("chartIncidents").getContext("2d").fillText("Incidents chart placeholder", 20, 20);
  document.getElementById("chartIntegrations").getContext("2d").fillText("Integrations chart placeholder", 20, 20);
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
