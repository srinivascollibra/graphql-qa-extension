/**
 * Routes SPA path changes to open DevTools panel ports for the same tab.
 * Full document navigations are still handled via chrome.devtools.network.onNavigated in the panel.
 */

const PORT_NAME = "gql-qa-panel";

/** @type {Map<number, chrome.runtime.Port[]>} */
const portsByTab = new Map();

/** @type {Map<number, string>} last pathname per tab (dedupe + detect change) */
const lastPathByTab = new Map();

/**
 * @param {number} tabId
 */
function notifyPanels(tabId) {
  const list = portsByTab.get(tabId);
  if (!list?.length) {
    return;
  }
  const msg = { type: "spa-navigation", tabId };
  for (const port of [...list]) {
    try {
      port.postMessage(msg);
    } catch {
      /* port may be dead */
    }
  }
}

/**
 * @param {number} tabId
 * @param {string} pathname
 */
function onPathMaybeChanged(tabId, pathname) {
  const prev = lastPathByTab.get(tabId);
  lastPathByTab.set(tabId, pathname);
  if (prev !== undefined && prev !== pathname) {
    notifyPanels(tabId);
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) {
    return;
  }

  /** @type {number|undefined} */
  let boundTabId;

  port.onMessage.addListener((msg) => {
    if (
      msg?.type === "register" &&
      typeof msg.tabId === "number" &&
      msg.tabId >= 0
    ) {
      boundTabId = msg.tabId;
      let list = portsByTab.get(boundTabId);
      if (!list) {
        list = [];
        portsByTab.set(boundTabId, list);
      }
      list.push(port);

      chrome.tabs.get(boundTabId, (tab) => {
        if (chrome.runtime.lastError || !tab?.url) {
          return;
        }
        try {
          const pathname = new URL(tab.url).pathname;
          lastPathByTab.set(boundTabId, pathname);
        } catch {
          /* ignore */
        }
      });
    }
  });

  port.onDisconnect.addListener(() => {
    if (boundTabId === undefined) {
      return;
    }
    const list = portsByTab.get(boundTabId);
    if (!list) {
      return;
    }
    const i = list.indexOf(port);
    if (i >= 0) {
      list.splice(i, 1);
    }
    if (list.length === 0) {
      portsByTab.delete(boundTabId);
    }
  });
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) {
    return;
  }
  try {
    const pathname = new URL(details.url).pathname;
    onPathMaybeChanged(details.tabId, pathname);
  } catch {
    /* invalid url */
  }
});
