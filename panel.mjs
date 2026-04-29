import {
  CLIP_MAX_LEN,
  analyzeGraphQLResponse,
  formatHeadersForDisplay,
  inferOperationNameFromQuery,
  parseGraphQLRequestPayload,
  splitBatchedResponse,
} from "./parsers.mjs";

/** @typedef {'query'|'mutation'|'subscription'|'persisted'|'unknown'} GqlOperationKind */
/** Max captured GraphQL operations (oldest dropped first). */
const MAX_ITEMS = 500;

const ROW_HEIGHT = 74;
const VIRTUAL_OVERSCAN = 6;

const STORAGE = {
  filterText: "gqlQA_filterText",
  filterErrors: "gqlQA_filterErrors",
  clearOnNav: "gqlQA_clearOnNav",
  theme: "gqlQA_theme",
  listPanePct: "gqlQA_listPanePct",
};

const BG_PORT_NAME = "gql-qa-panel";
let nextId = 1;
/** @type {Array<GraphQLCapture>} */
let items = [];
let selectedId = null;

/** @type {number|null} */
let listScrollRaf = null;

/**
 * @typedef {Object} GraphQLCapture
 * @property {number} id
 * @property {string} url
 * @property {string} method
 * @property {string} operationName
 * @property {number} httpStatus
 * @property {number} timeMs
 * @property {string} queryText
 * @property {string} variablesText
 * @property {string} [responseRaw]
 * @property {boolean|null} hasGqlErrors
 * @property {string|null} gqlErrorsSummary
 * @property {string} requestHeadersText
 * @property {string} responseHeadersText
 * @property {boolean} hasHttpError
 * @property {number} [batchIndex]
 * @property {number} [batchSize]
 * @property {GqlOperationKind} operationKind
 */

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} s
 * @param {number} max
 */
function trunc(s, max) {
  if (!s) {
    return "";
  }
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}…`;
}

const KIND_SUMMARY_LABEL =
  /** @type {Record<GqlOperationKind, string>} */ ({
    query: "Query",
    mutation: "Mutation",
    subscription: "Subscription",
    persisted: "Persisted query",
    unknown: "Unknown",
  });

/**
 * @param {GqlOperationKind|undefined|null} kind
 */
function summaryLabelForKind(kind) {
  const k = kind ?? "unknown";
  return KIND_SUMMARY_LABEL[k] ?? KIND_SUMMARY_LABEL.unknown;
}

/**
 * @param {GqlOperationKind|undefined|null} kind
 */
function svgForOperationKind(kind) {
  const k = kind ?? "unknown";
  const sClass = `op-kind-svg`;
  switch (k) {
    case "query":
      return `<svg class="${sClass}" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M9.7 9.7L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
    case "mutation":
      return `<svg class="${sClass}" viewBox="0 0 16 16"><path d="M9 2L5 10h4l-1 6 8-13H10L9 2z" fill="currentColor"/></svg>`;
    case "subscription":
      return `<svg class="${sClass}" viewBox="0 0 16 16" fill="none"><path d="M1 6c4 0 4-5 8-5M1 11c5 0 5-8 14-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
    case "persisted":
      return `<svg class="${sClass}" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M5 6h6M5 9h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    default:
      return `<svg class="${sClass}" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M7 6h1.2l.2 4.5H7" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="12" r="0.7" fill="currentColor"/></svg>`;
  }
}

/**
 * @param {GqlOperationKind|undefined|null} kind
 */
function opKindMarkup(kind) {
  const k = kind ?? "unknown";
  const label = summaryLabelForKind(/** @type {GqlOperationKind} */ (k));
  return (
    `<span class="op-kind op-kind-${k}" title="${escapeHtml(label)}" aria-hidden="true">` +
    `${svgForOperationKind(/** @type {GqlOperationKind} */ (k))}</span>`
  );
}

/**
 * @param {GqlOperationKind} kind
 * @param {string} name
 */
function ariaLabelForOpRow(kind, name) {
  return `${summaryLabelForKind(kind)}: ${String(name ?? "")}`;
}

function getFilterText() {
  return (
    document.getElementById("filterText")?.value?.trim().toLowerCase() || ""
  );
}

function errorsFilterOn() {
  return document.getElementById("filterErrors")?.checked ?? false;
}

function clearOnNavOn() {
  const clear = /** @type {HTMLInputElement|null} */ (
    document.getElementById("navClearRadio")
  );
  return clear?.checked ?? true;
}

/**
 * Clear the captured list when the user chose "Clear logs on navigation"
 * (both full navigations from DevTools API and SPA path changes via background.js).
 */
function clearLogsPerNavSettings() {
  if (!clearOnNavOn()) {
    return;
  }
  items = [];
  selectedId = null;
  renderList();
  showEmptyDetail();
}

/**
 * @param {GraphQLCapture} item
 */
function passesFilters(item) {
  if (errorsFilterOn() && item.hasGqlErrors !== true) {
    return false;
  }
  const q = getFilterText();
  if (!q) {
    return true;
  }
  const hay = `${item.operationName} ${item.url}`.toLowerCase();
  return hay.includes(q);
}

function saveUiPrefs() {
  const theme = document.getElementById("themeSelect")?.value ?? "system";
  const pane = document.getElementById("listPane");
  let listPct = 42;
  if (pane?.style.flexBasis) {
    listPct = parseFloat(pane.style.flexBasis) || 42;
  }
  chrome.storage.local.set({
    [STORAGE.filterText]: document.getElementById("filterText")?.value ?? "",
    [STORAGE.filterErrors]:
      document.getElementById("filterErrors")?.checked ?? false,
    [STORAGE.clearOnNav]:
      /** @type {HTMLInputElement|null} */ (document.getElementById("navClearRadio"))
        ?.checked ?? true,
    [STORAGE.theme]: theme,
    [STORAGE.listPanePct]: Number.isFinite(listPct) ? listPct : 42,
  });
}

let filterDebounce = 0;
function scheduleSaveUiPrefs() {
  window.clearTimeout(filterDebounce);
  filterDebounce = window.setTimeout(saveUiPrefs, 250);
}

function applyTheme(value) {
  const root = document.documentElement;
  if (value === "light" || value === "dark") {
    root.setAttribute("data-theme", value);
    return;
  }
  root.removeAttribute("data-theme");
}

/**
 * @param {GraphQLCapture} item
 */
function rowClasses(item) {
  const errClass =
    item.hasGqlErrors === true
      ? "has-gql-error"
      : item.hasGqlErrors === null
        ? "pending-response"
        : "";
  const httpClass = item.hasHttpError ? "has-http-error" : "";
  return [errClass, httpClass].filter(Boolean).join(" ");
}

function renderList() {
  const inner = document.getElementById("listInner");
  const topSpacer = document.getElementById("listTopSpacer");
  const botSpacer = document.getElementById("listBottomSpacer");
  const scrollEl = document.getElementById("listScroll");
  if (!inner || !topSpacer || !botSpacer || !scrollEl) {
    return;
  }

  const visible = items.filter(passesFilters);
  if (visible.length === 0) {
    inner.innerHTML =
      '<p class="detail-empty list-empty-msg" style="padding:12px;margin:0">' +
      (items.length === 0
        ? "No GraphQL operations captured yet. Reload or interact with the page."
        : "No operations match filters.") +
      "</p>";
    topSpacer.style.height = "0px";
    botSpacer.style.height = "0px";
    return;
  }

  const totalH = visible.length * ROW_HEIGHT;
  const st = scrollEl.scrollTop;
  const vh = scrollEl.clientHeight || 400;
  let start = Math.floor(st / ROW_HEIGHT) - VIRTUAL_OVERSCAN;
  if (start < 0) {
    start = 0;
  }
  let end = Math.ceil((st + vh) / ROW_HEIGHT) + VIRTUAL_OVERSCAN;
  if (end > visible.length) {
    end = visible.length;
  }

  const slice = visible.slice(start, end);
  topSpacer.style.height = `${start * ROW_HEIGHT}px`;
  botSpacer.style.height = `${(visible.length - end) * ROW_HEIGHT}px`;

  inner.innerHTML = slice
    .map((item) => {
      const pending =
        item.hasGqlErrors === null ? " · response loading…" : "";
      const batch =
        item.batchSize != null && item.batchSize > 1
          ? ` · batch ${(item.batchIndex ?? 0) + 1}/${item.batchSize}`
          : "";
      const sel = item.id === selectedId ? "selected" : "";
      const cur = item.id === selectedId ? ' aria-current="true"' : "";
      const cls = rowClasses(item);
      const ariaLabel = ariaLabelForOpRow(
        /** @type {GqlOperationKind} */ (item.operationKind ?? "unknown"),
        item.operationName,
      );
      return (
        `<button type="button" class="list-item ${cls} ${sel}" data-id="${
          item.id
        }"${cur} aria-label="${escapeHtml(ariaLabel)}">` +
        `<div class="op-row">` +
        opKindMarkup(/** @type {GqlOperationKind} */ (item.operationKind)) +
        `<div class="op">${escapeHtml(item.operationName)}</div></div>` +
        `<div class="meta">${item.method} ${item.httpStatus} · ${Math.round(
          item.timeMs,
        )} ms${pending}${batch}<br /><span class="url-line">${escapeHtml(
          trunc(item.url, 120),
        )}</span></div>` +
        `</button>`
      );
    })
    .join("");

  inner.querySelectorAll(".list-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-id"));
      selectItem(id);
    });
  });
}

function requestListRenderSoon() {
  if (listScrollRaf != null) {
    return;
  }
  listScrollRaf = requestAnimationFrame(() => {
    listScrollRaf = null;
    renderList();
  });
}

/**
 * @param {number} id
 */
function selectItem(id) {
  const item = items.find((i) => i.id === id);
  selectedId = item ? id : null;
  renderList();
  const detail = document.getElementById("detail");
  const detailEmpty = document.getElementById("detailEmpty");
  if (!item) {
    detail?.classList.add("hidden");
    detail?.setAttribute("hidden", "");
    detailEmpty?.classList.remove("hidden");
    return;
  }
  detailEmpty?.classList.add("hidden");
  detail?.classList.remove("hidden");
  detail?.removeAttribute("hidden");

  const summary = document.getElementById("summary");
  if (summary) {
    summary.innerHTML = `
      <dt>Type</dt><dd>${escapeHtml(
        summaryLabelForKind(/** @type {GqlOperationKind} */ (item.operationKind)),
      )}</dd>
      <dt>Operation</dt><dd>${escapeHtml(item.operationName)}</dd>
      <dt>URL</dt><dd>${escapeHtml(item.url)}</dd>
      <dt>HTTP</dt><dd>${item.httpStatus}${
      item.hasHttpError ? ' <span class="pill pill-warn">HTTP error</span>' : ""
    }</dd>
      <dt>Time</dt><dd>${Math.round(item.timeMs)} ms</dd>
      <dt>GraphQL errors</dt><dd>${
        item.hasGqlErrors === null
          ? "…"
          : item.hasGqlErrors
            ? "Yes"
            : "No"
      }</dd>
      <dt class="kv-wide">Request headers</dt><dd class="kv-block"><pre class="kv-pre">${
        escapeHtml(item.requestHeadersText)
      }</pre></dd>
      <dt class="kv-wide">Response headers</dt><dd class="kv-block"><pre class="kv-pre">${
        escapeHtml(item.responseHeadersText)
      }</pre></dd>
    `;
  }

  document.getElementById("queryBody").textContent = item.queryText || "(empty)";
  document.getElementById("variablesBody").textContent =
    item.variablesText || "(none)";
  document.getElementById("responseBody").textContent =
    item.responseRaw ?? "(loading response…)";

  syncDetailActions(item);
}

/**
 * @param {GraphQLCapture|null} item
 */
function syncDetailActions(item) {
  const hasSel = Boolean(item);
  const ids = [
    "copyReport",
    "copyQuery",
    "copyVariables",
    "copyResponse",
    "exportResponse",
  ];
  const responsePending =
    !item || item.responseRaw == null;
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) {
      continue;
    }
    if (!hasSel) {
      el.disabled = true;
      continue;
    }
    el.disabled = false;
    if (
      (id === "copyResponse" || id === "exportResponse") &&
      responsePending
    ) {
      el.disabled = true;
    }
  }
}

function buildBugReportText(/** @type {GraphQLCapture} */ item) {
  const lines = [
    "=== GraphQL (GraphQL QA panel) ===",
    `Operation: ${item.operationName}`,
    `GraphQL operation kind: ${summaryLabelForKind(/** @type {GqlOperationKind} */ (item.operationKind))}`,
    `URL: ${item.url}`,
    `Method: ${item.method}`,
    `HTTP status: ${item.httpStatus}`,
    `Duration: ${Math.round(item.timeMs)} ms`,
    `HTTP error (≥400): ${item.hasHttpError ? "yes" : "no"}`,
    `GraphQL errors in body: ${
      item.hasGqlErrors === null
        ? "unknown"
        : item.hasGqlErrors
          ? "yes"
          : "no"
    }`,
  ];
  if (item.gqlErrorsSummary) {
    lines.push(`Errors snippet: ${item.gqlErrorsSummary}`);
  }
  lines.push("");
  lines.push("--- Query (truncated) ---");
  lines.push(trunc(item.queryText || "", CLIP_MAX_LEN));
  lines.push("");
  lines.push("--- Variables (truncated) ---");
  lines.push(trunc(item.variablesText || "", CLIP_MAX_LEN));
  lines.push("");
  lines.push("--- Response (truncated) ---");
  lines.push(trunc(item.responseRaw || "", CLIP_MAX_LEN));
  return lines.join("\n");
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }
}

function showCopyStatus(msg) {
  const status = document.getElementById("copyStatus");
  if (!status) {
    return;
  }
  status.textContent = msg;
  window.setTimeout(() => {
    status.textContent = "";
  }, 2000);
}

/** Safe fragment for `download=""` (operation name, etc.). */
function sanitizeFilenameSegment(raw) {
  const s = String(raw ?? "graphql")
    .trim()
    .slice(0, 80)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "-");
  return s || "graphql";
}

function buildExportFilename(/** @type {GraphQLCapture} */ item) {
  const op = sanitizeFilenameSegment(item.operationName);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `graphql-response-${op}-${ts}.json`;
}

function showEmptyDetail() {
  document.getElementById("detailEmpty")?.classList.remove("hidden");
  const detail = document.getElementById("detail");
  detail?.classList.add("hidden");
  detail?.setAttribute("hidden", "");
  syncDetailActions(null);
}

function wireSplitter() {
  const pane = document.getElementById("listPane");
  const split = document.getElementById("splitter");
  if (!pane || !split) {
    return;
  }

  split.addEventListener("keydown", (ev) => {
    if (
      /** @type {KeyboardEvent} */ (ev).key !== "ArrowLeft" &&
      /** @type {KeyboardEvent} */ (ev).key !== "ArrowRight"
    ) {
      return;
    }
    const step = /** @type {KeyboardEvent} */ (ev).shiftKey ? 12 : 4;
    const delta =
      /** @type {KeyboardEvent} */ (ev).key === "ArrowLeft"
        ? -step
        : step;
    const cur = parseFloat(pane.style.flexBasis) || 42;
    const next = Math.min(80, Math.max(22, cur + delta * 0.12));
    pane.style.flexBasis = `${next}%`;
    chrome.storage.local.set({ [STORAGE.listPanePct]: next });
    /** @type {KeyboardEvent} */ (ev).preventDefault();
  });

    split.addEventListener("mousedown", (/** @type {MouseEvent} */ down) => {
    down.preventDefault();
    const startX = down.clientX;
    const wrap = pane.parentElement;
    if (!wrap) {
      return;
    }
    const fromStyle = parseFloat(pane.style.flexBasis);
    const fromAttr = pane.getAttribute("data-pct-default");
    const startPct =
      (Number.isFinite(fromStyle) && fromStyle > 0
        ? fromStyle
        : fromAttr != null && fromAttr !== ""
          ? Number(fromAttr)
          : 42);

    /**
     * @param {MouseEvent} ev
     */
    function onMove(ev) {
      const dx = ev.clientX - startX;
      const w = wrap.getBoundingClientRect().width || 600;
      const deltaPct = (dx / w) * 100;
      const cur = Math.min(80, Math.max(22, startPct + deltaPct));
      pane.style.flexBasis = `${cur}%`;
    }

    /**
     * @param {MouseEvent} evUp
     */
    function onUp(evUp) {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const cur = parseFloat(pane.style.flexBasis);
      chrome.storage.local.set({
        [STORAGE.listPanePct]: Number.isFinite(cur) ? cur : startPct,
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

function getVisibleFiltered() {
  return items.filter(passesFilters);
}

function navigateSelection(delta) {
  const visible = getVisibleFiltered();
  if (!visible.length) {
    return;
  }
  const idx = visible.findIndex((i) => i.id === selectedId);
  let nextIdx = idx < 0 ? 0 : idx + delta;
  if (nextIdx < 0) {
    nextIdx = 0;
  }
  if (nextIdx >= visible.length) {
    nextIdx = visible.length - 1;
  }
  const next = visible[nextIdx];
  selectItem(next.id);
  const scrollEl = document.getElementById("listScroll");
  if (!scrollEl) {
    return;
  }
  const rowTop = nextIdx * ROW_HEIGHT;
  const rowBottom = rowTop + ROW_HEIGHT;
  if (rowTop < scrollEl.scrollTop) {
    scrollEl.scrollTop = rowTop;
  } else if (rowBottom > scrollEl.scrollTop + scrollEl.clientHeight) {
    scrollEl.scrollTop = rowBottom - scrollEl.clientHeight;
  }
}

function wireKeyboard() {
  document.addEventListener(
    "keydown",
    (/** @type {KeyboardEvent} */ ev) => {
      const t = /** @type {HTMLElement} */ (ev.target);
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")
      ) {
        return;
      }
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        navigateSelection(1);
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        navigateSelection(-1);
      }
    },
    true,
  );
}

/**
 * @param {string|null} content
 * @param {string} encoding
 */
function decodeResponseBody(content, encoding) {
  if (encoding === "base64" && content) {
    try {
      const bin = atob(content);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }
  return content ?? "";
}

/**
 * @param {chrome.devtools.network.Request} request
 */
function handleFinishedRequest(request) {
  const parsedOps = parseGraphQLRequestPayload(request);
  if (!parsedOps?.length) {
    return;
  }

  const httpStatus = request.response?.status ?? 0;
  const hasHttpError = httpStatus >= 400;
  const reqHeaders = formatHeadersForDisplay(request.request.headers);
  const resHeaders = formatHeadersForDisplay(request.response?.headers);

  const batchSize = parsedOps.length;
  /** @type {GraphQLCapture[]} */
  const created = [];

  for (const p of parsedOps) {
    /** @type {GraphQLCapture} */
    const item = {
      id: nextId++,
      url: request.request.url,
      method: request.request.method,
      operationName: p.operationName || inferOperationNameFromQuery(p.queryText),
      httpStatus,
      timeMs: request.time ?? 0,
      queryText: p.queryText,
      variablesText: p.variablesText,
      responseRaw: null,
      hasGqlErrors: null,
      gqlErrorsSummary: null,
      requestHeadersText: reqHeaders,
      responseHeadersText: resHeaders,
      hasHttpError,
      batchIndex: p.batchIndex,
      batchSize: p.batchSize ?? (batchSize > 1 ? batchSize : undefined),
      operationKind:
        /** @type {GqlOperationKind} */ (p.operationKind) ?? "unknown",
    };
    created.push(item);
    items.push(item);
  }

  if (items.length > MAX_ITEMS) {
    const drop = items.length - MAX_ITEMS;
    const removed = items.splice(0, drop);
    if (
      selectedId != null &&
      removed.some((r) => r.id === selectedId)
    ) {
      selectedId = null;
    }
  }

  renderList();

  request.getContent((content, encoding) => {
    const raw = decodeResponseBody(content, encoding);
    if (raw === null) {
      for (const item of created) {
        item.responseRaw = "(binary — could not decode)";
        item.hasGqlErrors = false;
        item.gqlErrorsSummary = null;
      }
      if (created.some((c) => c.id === selectedId)) {
        selectItem(/** @type {number} */ (selectedId));
      }
      renderList();
      return;
    }

    const parts =
      batchSize > 1
        ? splitBatchedResponse(raw, batchSize)
        : null;

    for (let i = 0; i < created.length; i++) {
      const item = created[i];
      let slice =
        parts && batchSize > 1
          ? /** @type {string[]} */ (parts)[i]
          : raw;
      if (batchSize > 1 && parts == null) {
        slice =
          `[Batch response could not be split into ${batchSize} parts — full payload below]\n\n` +
          raw;
      }
      item.responseRaw = slice || "(empty)";
      const analyzed = analyzeGraphQLResponse(slice || "");
      item.hasGqlErrors = analyzed.hasErrors;
      item.gqlErrorsSummary = analyzed.errorsSummary;
      if (analyzed.pretty && analyzed.pretty !== slice) {
        item.responseRaw = analyzed.pretty;
      }
    }

    if (created.some((c) => c.id === selectedId)) {
      selectItem(/** @type {number} */ (selectedId));
    }
    renderList();
  });
}

/**
 * SPA / client-side path changes (same semantics as Clear vs Preserve radios).
 */
function connectBackgroundForSpaNav() {
  if (!chrome.devtools?.inspectedWindow || !chrome.runtime?.connect) {
    return;
  }
  const tabId = chrome.devtools.inspectedWindow.tabId;
  if (typeof tabId !== "number" || tabId < 0) {
    return;
  }
  /** @type {chrome.runtime.Port|null} */
  let bgPort = null;
  try {
    bgPort = chrome.runtime.connect({ name: BG_PORT_NAME });
  } catch {
    return;
  }
  bgPort.postMessage({ type: "register", tabId });
  bgPort.onMessage.addListener((msg) => {
    if (msg?.type === "spa-navigation") {
      clearLogsPerNavSettings();
    }
  });
}

function wireUi() {
  document.getElementById("filterText")?.addEventListener("input", () => {
    const ls = document.getElementById("listScroll");
    if (ls) {
      ls.scrollTop = 0;
    }
    renderList();
    scheduleSaveUiPrefs();
  });
  document.getElementById("filterErrors")?.addEventListener("change", () => {
    const ls = document.getElementById("listScroll");
    if (ls) {
      ls.scrollTop = 0;
    }
    renderList();
    saveUiPrefs();
  });
  document.getElementById("navClearRadio")?.addEventListener("change", () => {
    saveUiPrefs();
  });
  document.getElementById("navPreserveRadio")?.addEventListener("change", () => {
    saveUiPrefs();
  });
  document.getElementById("themeSelect")?.addEventListener("change", (ev) => {
    const sel = /** @type {HTMLSelectElement} */ (ev.target).value;
    applyTheme(sel);
    saveUiPrefs();
  });

  document.getElementById("clearBtn")?.addEventListener("click", () => {
    items = [];
    selectedId = null;
    renderList();
    showEmptyDetail();
  });

  document.getElementById("copyReport")?.addEventListener("click", async () => {
    const item = items.find((i) => i.id === selectedId);
    if (!item) {
      showCopyStatus("Select an item first.");
      return;
    }
    const ok = await writeClipboard(buildBugReportText(item));
    showCopyStatus(ok ? "Copied." : "Copy failed.");
  });

  document.getElementById("copyQuery")?.addEventListener("click", async () => {
    const item = items.find((i) => i.id === selectedId);
    if (!item) {
      showCopyStatus("Select an item first.");
      return;
    }
    const ok = await writeClipboard(item.queryText ?? "");
    showCopyStatus(ok ? "Copied query." : "Copy failed.");
  });

  document.getElementById("copyVariables")?.addEventListener("click", async () => {
    const item = items.find((i) => i.id === selectedId);
    if (!item) {
      showCopyStatus("Select an item first.");
      return;
    }
    const ok = await writeClipboard(item.variablesText ?? "");
    showCopyStatus(ok ? "Copied variables." : "Copy failed.");
  });

  document.getElementById("copyResponse")?.addEventListener("click", async () => {
    const item = items.find((i) => i.id === selectedId);
    if (!item) {
      showCopyStatus("Select an item first.");
      return;
    }
    const ok = await writeClipboard(item.responseRaw ?? "");
    showCopyStatus(ok ? "Copied response." : "Copy failed.");
  });

  document.getElementById("exportResponse")?.addEventListener("click", () => {
    const item = items.find((i) => i.id === selectedId);
    if (!item) {
      showCopyStatus("Select an item first.");
      return;
    }
    if (item.responseRaw == null) {
      showCopyStatus("Response not loaded yet.");
      return;
    }
    try {
      const text =
        typeof item.responseRaw === "string"
          ? item.responseRaw
          : String(item.responseRaw);
      const blob = new Blob([text], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildExportFilename(item);
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showCopyStatus("Exported.");
    } catch {
      showCopyStatus("Export failed.");
    }
  });

  const listScroll = document.getElementById("listScroll");
  listScroll?.addEventListener("scroll", () => {
    requestListRenderSoon();
  });
  if (listScroll && typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      renderList();
    });
    ro.observe(listScroll);
  }
  window.addEventListener(
    "resize",
    () => {
      renderList();
    },
    { passive: true },
  );

  wireSplitter();
  wireKeyboard();
}

function hydrateFromStored(/** @type {Record<string, unknown>} */ stored) {
  const ft = stored[STORAGE.filterText];
  if (typeof ft === "string" && document.getElementById("filterText")) {
    document.getElementById("filterText").value = ft;
  }
  if (
    typeof stored[STORAGE.filterErrors] === "boolean" &&
    document.getElementById("filterErrors")
  ) {
    document.getElementById("filterErrors").checked =
      stored[STORAGE.filterErrors];
  }
  const clrRadio = /** @type {HTMLInputElement|null} */ (
    document.getElementById("navClearRadio")
  );
  const prvRadio = /** @type {HTMLInputElement|null} */ (
    document.getElementById("navPreserveRadio")
  );
  if (
    typeof stored[STORAGE.clearOnNav] === "boolean" &&
    clrRadio &&
    prvRadio
  ) {
    if (stored[STORAGE.clearOnNav]) {
      clrRadio.checked = true;
    } else {
      prvRadio.checked = true;
    }
  }

  const th = stored[STORAGE.theme] ?? "system";
  const themeEl = document.getElementById("themeSelect");
  if (
    themeEl &&
    typeof th === "string" &&
    ["system", "light", "dark"].includes(th)
  ) {
    themeEl.value = th;
    applyTheme(th);
  } else if (themeEl) {
    applyTheme("system");
  }

  const lp = stored[STORAGE.listPanePct];
  const pane = document.getElementById("listPane");
  if (pane && typeof lp === "number" && Number.isFinite(lp)) {
    pane.style.flexBasis = `${Math.min(80, Math.max(22, lp))}%`;
  }

  wireUi();
  renderList();
  connectBackgroundForSpaNav();
}

/**
 * Registers network listeners and hydrates from storage. Guards chrome.* APIs
 * so missing namespaces do not break the whole panel (avoids opaque panel.html errors).
 */
function bootstrapPanel() {
  const netApi = typeof chrome !== "undefined" ? chrome.devtools?.network : undefined;

  if (netApi?.onRequestFinished) {
    netApi.onRequestFinished.addListener(handleFinishedRequest);
  }
  if (netApi?.onNavigated) {
    netApi.onNavigated.addListener(() => {
      clearLogsPerNavSettings();
    });
  }

  if (!chrome?.storage?.local?.get) {
    hydrateFromStored({});
    return;
  }
  chrome.storage.local.get(
    [
      STORAGE.filterText,
      STORAGE.filterErrors,
      STORAGE.clearOnNav,
      STORAGE.theme,
      STORAGE.listPanePct,
    ],
    (stored) => {
      if (chrome.runtime?.lastError) {
        hydrateFromStored({});
        return;
      }
      hydrateFromStored(stored ?? {});
    },
  );
}

bootstrapPanel();
