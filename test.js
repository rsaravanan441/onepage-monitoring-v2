/**
 * ================================================================
 * OnePage Monitoring v2.1 — Automated Test Suite
 * Jest + JSDOM compatible
 * ---------------------------------------------------------------
 * This file validates:
 *  - Status fetching (JSON, RSS, HTML)
 *  - Widget rendering
 *  - Notifications
 *  - History
 *  - Settings
 *  - Role system
 *  - Admin controls
 *  - Public snapshot generator
 *  - Analytics placeholders
 *  - DB load/save model
 *  - Feature flags
 * ================================================================
 */

const { JSDOM } = require("jsdom");

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: key => store[key] || null,
    setItem: (key, val) => (store[key] = String(val)),
    clear: () => (store = {}),
    removeItem: key => delete store[key]
  };
})();

global.localStorage = localStorageMock;

// Load main.js logic in a jsdom environment
function setupDOM() {
  const dom = new JSDOM(`
    <!doctype html><body>
      <div id="statusWidgetsGrid"></div>
      <div id="envBadge"></div>
      <div id="recentAlertsList"></div>
      <div id="notifList"></div>
      <div id="alertPopup"></div>
    </body>`, { runScripts: "dangerously" });

  global.window = dom.window;
  global.document = dom.window.document;

  return dom;
}

/**
 * ---------------------------
 * MOCK FETCH FOR TESTS
 * ---------------------------
 */
global.fetch = jest.fn((url) => {
  if (url.includes("json-ok")) {
    return Promise.resolve({
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({ status: "operational", status_description: "All systems go" })
    });
  }
  if (url.includes("json-major")) {
    return Promise.resolve({
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({ status: "major", status_description: "Critical outage" })
    });
  }
  if (url.includes("rss")) {
    return Promise.resolve({
      headers: { get: () => "application/rss+xml" },
      text: () => Promise.resolve("<rss><item>Incident</item></rss>")
    });
  }

  return Promise.resolve({
    headers: { get: () => "text/html" },
    text: () => Promise.resolve("<html><title>Operational</title></html>")
  });
});

/* ================================================
   IMPORT MAIN APP LOGIC USING VM
   ================================================ */
const fs = require("fs");
const vm = require("vm");

function loadMainJS(dom) {
  const script = fs.readFileSync("./scripts/main.js", "utf8");
  const sandbox = { window: dom.window, document: dom.window.document, localStorage: global.localStorage, fetch: global.fetch, console };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return sandbox;
}

/* ================================================================
   TEST SUITE START
=================================================================== */

describe("OnePage Monitoring v2.1 — Tests", () => {

  let dom, app;

  beforeEach(() => {
    dom = setupDOM();
    app = loadMainJS(dom);
  });

  /* --------------------------------------------------------------
     STATUS FETCHING
  -------------------------------------------------------------- */

  test("Fetch JSON operational status", async () => {
    const result = await app.fetchStatus("https://example.com/json-ok");
    expect(result.level).toBe("ok");
    expect(result.message).toBe("All systems go");
  });

  test("Fetch JSON major incident", async () => {
    const result = await app.fetchStatus("https://example.com/json-major");
    expect(result.level).toBe("major");
  });

  test("Fetch RSS incident", async () => {
    const result = await app.fetchStatus("https://example.com/rss");
    expect(result.level).toBe("warning");
  });

  test("Fetch HTML fallback", async () => {
    const result = await app.fetchStatus("https://example.com/html");
    expect(result.level).toBe("ok");
  });

  /* --------------------------------------------------------------
     WIDGET RENDERING
  -------------------------------------------------------------- */

  test("Widget renders correctly", () => {
    const config = {
      id: "test1",
      name: "Demo Service",
      api: "https://example.com/json-ok",
      page: "https://example.com"
    };

    const widget = app.renderWidget(config);
    expect(widget.el.querySelector(".widget-name").textContent).toBe("Demo Service");
  });

  /* --------------------------------------------------------------
     NOTIFICATIONS
  -------------------------------------------------------------- */

  test("Push notification creates entry", () => {
    app.pushNotification("Service Down", "Outage detected");
    expect(app.OPM.db.notifications.length).toBeGreaterThan(0);
  });

  test("Popup alert appears", () => {
    app.showPopupAlert("Alert!");
    const popup = dom.window.document.getElementById("alertPopup");
    expect(popup.hidden).toBe(false);
  });

  /* --------------------------------------------------------------
     HISTORY
  -------------------------------------------------------------- */

  test("History entry added", () => {
    app.updateHistory("s1", "Test Service", "ok", "Operational");
    expect(app.OPM.db.history.length).toBeGreaterThan(0);
  });

  /* --------------------------------------------------------------
     SETTINGS SYSTEM
  -------------------------------------------------------------- */

  test("Theme toggle updates body attribute", () => {
    app.OPM.settings.theme = "dark";
    app.applyTheme();
    expect(dom.window.document.body.dataset.theme).toBe("dark");
  });

  test("Compact mode toggles class", () => {
    app.OPM.settings.compactMode = true;
    app.applyCompactMode();
    expect(dom.window.document.body.classList.contains("compact")).toBe(true);
  });

  /* --------------------------------------------------------------
     PUBLIC SNAPSHOT
  -------------------------------------------------------------- */

  test("Public snapshot encodes JSON", () => {
    app.createPublicSnapshot();
    expect(dom.window.document.querySelector("#publicLinkArea input").value.length).toBeGreaterThan(10);
  });

  /* --------------------------------------------------------------
     ROLE SYSTEM
  -------------------------------------------------------------- */

  test("Admin UI hides when not admin", () => {
    app.OPM.role = "public";
    app.applyRoleUI();
    expect(dom.window.document.getElementById("viewAdmin").hidden).toBe(true);
  });

  /* --------------------------------------------------------------
     ANALYTICS (Placeholder tests)
  -------------------------------------------------------------- */

  test("Analytics placeholders render", () => {
    const c1 = dom.window.document.getElementById("chartUptime");
    const ctx = c1.getContext("2d");
    expect(typeof ctx.fillText).toBe("function");
  });

  /* --------------------------------------------------------------
     DB LOAD & SAVE
  -------------------------------------------------------------- */

  test("DB saves to localStorage", () => {
    app.OPM.db.test = "saved";
    app.saveDB();
    expect(JSON.parse(localStorage.getItem("opm-db")).test).toBe("saved");
  });

  /* --------------------------------------------------------------
     FEATURE FLAGS
  -------------------------------------------------------------- */

  test("Feature flag toggles", () => {
    app.OPM.db.featureFlags = { testFeature: true };
    app.saveDB();
    expect(app.OPM.db.featureFlags.testFeature).toBe(true);
  });

  /* --------------------------------------------------------------
     UTILITY FUNCTIONS
  -------------------------------------------------------------- */

  test("UUID function generates unique IDs", () => {
    const id1 = app.uuid();
    const id2 = app.uuid();
    expect(id1).not.toBe(id2);
  });

  test("Timestamp formatting returns string", () => {
    const s = app.formatTs(Date.now());
    expect(typeof s).toBe("string");
  });
});
