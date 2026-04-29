/**
 * Pure parsing helpers (no DOM). Used by DevTools panel and unit tests.
 */

/**
 * Transport / parse metadata: `kind` (json | get | multipart | …).
 * `operationKind` is the GraphQL document type where inferrable.
 * @typedef {{ queryText: string, variablesText: string, operationName: string, operationKind: GqlOperationKind, kind?: string, batchIndex?: number, batchSize?: number }} ParsedOp
 */

/**
 * GraphQL-style operation inferred from inline document text (when present).
 * @typedef {'query' | 'mutation' | 'subscription' | 'persisted' | 'unknown'} GqlOperationKind
 */

export const CLIP_MAX_LEN = 4000;

/**
 * Infer query / mutation / subscription from GraphQL query string (anonymous `{` ⇒ query).
 * @param {string} queryText
 * @returns {GqlOperationKind}
 */
export function inferGqlOperationKind(queryText) {
  if (!queryText || typeof queryText !== "string") {
    return "unknown";
  }
  const t = queryText.trim();
  if (/^\(persisted/i.test(t)) {
    return "persisted";
  }
  if (/^\s*mutation\b/i.test(t)) {
    return "mutation";
  }
  if (/^\s*subscription\b/i.test(t)) {
    return "subscription";
  }
  if (/^\s*query\b/i.test(t)) {
    return "query";
  }
  if (t.startsWith("{")) {
    return "query";
  }
  return "unknown";
}

/**
 * @param {string} query
 */
export function inferOperationNameFromQuery(query) {
  if (!query || typeof query !== "string") {
    return "(anonymous)";
  }
  const trimmed = query.trim();
  const m = trimmed.match(/(?:query|mutation|subscription)\s+(\w+)/i);
  if (m) {
    return m[1];
  }
  return "(anonymous)";
}

/**
 * @param {*} body
 */
function variablesToText(body) {
  if (
    body.variables === undefined ||
    body.variables === null
  ) {
    return "(none)";
  }
  const v = body.variables;
  if (typeof v === "string") {
    return v;
  }
  return JSON.stringify(v, null, 2);
}

/**
 * @param {*} body
 * @returns {ParsedOp|null}
 */
function opFromGraphQLBody(body) {
  if (!body || typeof body !== "object") {
    return null;
  }
  const extensions = /** @type {Record<string, unknown>} */ (body.extensions);
  const pq = /** @type {Record<string, unknown>} */ (
    (extensions?.persistedQuery ?? {}) ?? {}
  );
  const persistedHash =
    typeof pq.sha256Hash === "string"
      ? pq.sha256Hash
      : typeof pq.sha256_hash === "string"
        ? pq.sha256_hash
        : "";

  let queryText = typeof body.query === "string" ? body.query : "";
  const hasPersistedHint =
    Boolean(persistedHash) ||
    pq.version != null ||
    (typeof extensions === "object" && extensions?.persistedQuery != null);

  if ((!queryText || queryText.trim() === "") && hasPersistedHint) {
    const shortHash = persistedHash ? `${persistedHash.slice(0, 12)}…` : "unknown-hash";
    return {
      queryText:
        `(persisted — inline query not sent; hash ${shortHash})`,
      variablesText: variablesToText(body),
      operationName:
        typeof body.operationName === "string"
          ? body.operationName
          : `(persisted:${shortHash})`,
      operationKind: "persisted",
      kind: "persisted",
    };
  }

  if (
    typeof body.operationName !== "string" &&
    !(typeof body.query === "string" && body.query.length > 0)
  ) {
    return null;
  }

  const opFromJson =
    typeof body.operationName === "string"
      ? body.operationName
      : inferOperationNameFromQuery(queryText || "");

  return {
    queryText,
    variablesText: variablesToText(body),
    operationName: opFromJson,
    operationKind: inferGqlOperationKind(queryText),
    kind: "json",
  };
}

/**
 * @param {*} body
 * @returns {ParsedOp[]|null}
 */
export function normalizeJsonBodyToOps(body) {
  if (Array.isArray(body)) {
    const out = [];
    for (let i = 0; i < body.length; i++) {
      const el = body[i];
      const op = opFromGraphQLBody(el);
      if (op) {
        out.push({
          ...op,
          batchIndex: i,
          batchSize: body.length,
        });
      }
    }
    return out.length ? out : null;
  }
  const op = opFromGraphQLBody(body);
  return op ? [op] : null;
}

/**
 * @param {string} raw
 * @param {string} mimeType
 * @returns {ParsedOp[]|null}
 */
export function parseMultipartOperations(raw, mimeType) {
  if (!raw || !mimeType || !mimeType.toLowerCase().includes("multipart")) {
    return null;
  }
  const m = /boundary=([^;\s]+|"[^"]+")/i.exec(mimeType);
  if (!m) {
    return null;
  }
  const boundary = m[1].replace(/^"|"$/g, "");
  const delimiter = `--${boundary}`;
  const segments = raw.split(delimiter).filter((s) => s.length > 1);
  for (const seg of segments) {
    if (!/name=["']operations["']/i.test(seg)) {
      continue;
    }
    const headerEnd = seg.search(/\r?\n\r?\n/);
    if (headerEnd === -1) {
      continue;
    }
    let jsonText = seg.slice(headerEnd).replace(/^\r?\n/, "").trim();
    jsonText = jsonText.replace(/\r?\n--$/, "").trim();
    try {
      const parsed = JSON.parse(jsonText);
      return normalizeJsonBodyToOps(parsed);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {chrome.devtools.network.Request} request
 * @returns {ParsedOp[]|null}
 */
export function parseGraphQLRequestPayload(request) {
  const method = request.request.method;
  const url = request.request.url;

  if (method === "POST") {
    const raw = request.request.postData?.text;
    const mime = request.request.postData?.mimeType || "";
    if (!raw) {
      return null;
    }

    const lowerMime = mime.toLowerCase();
    if (lowerMime.includes("multipart")) {
      const fromMulti = parseMultipartOperations(raw, mime);
      if (fromMulti?.length) {
        return fromMulti.map((o) => ({
          ...o,
          kind: o.kind ?? "multipart",
        }));
      }
    }

    if (
      lowerMime.includes("application/json") ||
      raw.trim().startsWith("{") ||
      raw.trim().startsWith("[")
    ) {
      try {
        const body = JSON.parse(raw);
        const ops = normalizeJsonBodyToOps(body);
        if (ops?.length) {
          return ops;
        }
      } catch {
        /* not JSON */
      }
    }

    if (
      lowerMime.includes("application/graphql") ||
      /^(query|mutation|subscription)\s/m.test(raw.trim())
    ) {
      return [
        {
          queryText: raw,
          variablesText: "(none)",
          operationName: inferOperationNameFromQuery(raw),
          operationKind: inferGqlOperationKind(raw),
          kind: "graphql",
        },
      ];
    }
  }

  if (method === "GET") {
    try {
      const u = new URL(url);
      const q = u.searchParams.get("query");
      if (q) {
        let varsText = "(none)";
        const varsParam = u.searchParams.get("variables");
        if (varsParam) {
          try {
            varsText = JSON.stringify(JSON.parse(varsParam), null, 2);
          } catch {
            varsText = varsParam;
          }
        }
        return [
          {
            queryText: q,
            variablesText: varsText,
            operationName: inferOperationNameFromQuery(q),
            operationKind: inferGqlOperationKind(q),
            kind: "get",
          },
        ];
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * @param {string} responseText
 */
export function analyzeGraphQLResponse(responseText) {
  if (!responseText) {
    return { hasErrors: false, errorsSummary: null, pretty: "(empty)" };
  }
  try {
    const j = JSON.parse(responseText);
    const pretty = JSON.stringify(j, null, 2);
    if (Array.isArray(j.errors) && j.errors.length > 0) {
      const snippet = JSON.stringify(j.errors).slice(0, CLIP_MAX_LEN);
      return {
        hasErrors: true,
        errorsSummary:
          snippet.length >= CLIP_MAX_LEN ? `${snippet}…` : snippet,
        pretty,
      };
    }
    return { hasErrors: false, errorsSummary: null, pretty };
  } catch {
    return {
      hasErrors: false,
      errorsSummary: null,
      pretty:
        responseText.slice(0, CLIP_MAX_LEN) +
        (responseText.length > CLIP_MAX_LEN ? "…" : ""),
    };
  }
}

/**
 * @param {string} responseText
 * @param {number} batchSize
 */
export function splitBatchedResponse(responseText, batchSize) {
  if (batchSize <= 1 || !responseText) {
    return null;
  }
  try {
    const j = JSON.parse(responseText);
    if (!Array.isArray(j) || j.length !== batchSize) {
      return null;
    }
    return j.map((part, idx) => {
      if (typeof part === "object" && part !== null) {
        try {
          return JSON.stringify(part, null, 2);
        } catch {
          return String(part);
        }
      }
      return String(part ?? `(batch slot ${idx})`);
    });
  } catch {
    return null;
  }
}

/**
 * @param {chrome.devtools.network.Request["request"]["headers"]|chrome.devtools.network.Request["response"]["headers"]|undefined} headers
 */
export function formatHeadersForDisplay(headers) {
  if (!headers || !Array.isArray(headers) || headers.length === 0) {
    return "(none)";
  }
  return headers
    .map((h) => `${h.name}: ${h.value}`)
    .sort((a, b) => a.localeCompare(b))
    .join("\n");
}
