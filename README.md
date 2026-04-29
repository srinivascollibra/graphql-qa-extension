# GraphQL QA Panel (Chrome extension)

Tester-focused **DevTools** panel that lists **GraphQL** requests from the **real** browser session (what the app sent), highlights **GraphQL errors** or **bad HTTP statuses**, filters, persists UI choices, resizes the panes, shows **operation type** (**query / mutation / subscription**) with icons, and copies **truncated bundles** plus **individual query / variables / response** snippets for bugs.

No host-based **origin** access: **`storage`**, **`webNavigation`**, and **`tabs`** (to read the inspected tab’s current URL pathname when syncing SPA route detection)—the GraphQL QA **panel** itself still uses DevTools **network** for traffic on the **inspected** page only.


## Install (load unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. **Load unpacked** and choose this folder: `chrome-extension-graphql-tester`.
4. Open DevTools (**F12** or **Cmd+Option+I**).
5. Open the **GraphQL QA** tab (use the » overflow menu if tabs are crowded).

## How to use

1. Keep **GraphQL QA** open while exercising the app.
2. Rows appear for POST JSON **`query` / `operationName`**, **batched arrays**, **persisted/APQ-only** payloads, **`multipart`** bodies with GraphQL **`operations`** (common for uploads), **`application/graphql`**, and GET **`query=`**.
3. Each row shows a small **icon** (left of the name) for **Query**, **Mutation**, **Subscription**, **Persisted** (hash-only / APQ), or **Unknown**. The **Summary** panel lists the same **Type** text.
4. **Orange** tint: HTTP status **≥400** (transport / gateway failures even without GraphQL `errors`). **Red**: JSON body **`errors`** when present after load completes.
5. Under **Logs on navigation**, choose **Clear logs on navigation** or **Preserve logs**. This applies to **both**:
   - **Full document navigations** (reload, traditional site loads), via `chrome.devtools.network.onNavigated`, and  
   - **SPA / client-side route changes**, when the **URL path** of the inspected tab changes (tracked via **`webNavigation.onHistoryStateUpdated`** in the extension service worker).

   Same choice is used for both: **Preserve** keeps the list when you reload or switch in-app routes; **Clear** empties it on either kind of navigation (path-only heuristic: changing only query parameters without changing the **path** may not trigger a SPA clear).
6. Resize the divider between **list** and **detail** (drag or focus the splitter and use arrow keys **←/→** with **Shift** for larger steps).
7. Arrow **↑** / **↓** move the selection when focus is **not** in the filter, **navigation radios**, or theme controls (**list** pane is focusable for keyboard use).
8. **Summary** shows **request and response headers** when DevTools exposes them.
9. **Copy bug report** bundles metadata (including **GraphQL operation kind**); smaller buttons copy **query**, **variables**, or **response** only. **Export response** writes the **full** response body to a `.json` file (no clipboard size limit)—useful for huge payloads.
10. The left list uses **fixed-height virtualization**—long sessions stay responsive (up to 500 tracked operations; oldest dropped).

## Developer notes

- Run **`npm test`** from this folder to execute **Vitest** against `parsers.mjs` (`parsers.test.mjs`).
- Regenerate raster icons after editing `assets/graphql-logo.svg`: **`npm run icons`** (requires `sharp`).
- **WebSockets / subscriptions** are **not** surfaced the same way as fetch/XHR in `chrome.devtools.network.onRequestFinished`; treat this as a known DevTools API gap unless you add a different integration.

## Privacy

Everything runs **locally** in Chromium. Clipboard copy stays on your machine unless you paste elsewhere.

## Limits

- **SPA heuristic:** client-side clears run when **`onHistoryStateUpdated`** fires and the **`pathname`** part of the URL **changes**. Updates that change **only query strings or hash** might not clear until the path moves (intentionally reduces noisy clears).
- Batched responses are split when the HTTP body parses as a **JSON array matching** the outbound batch length; otherwise the full payload is shown with an explanatory prefix.
- **GraphQL trademark**: The extension toolbar icons use the **pink GraphQL logo** style in `assets/` (see **npm run icons**). [**GraphQL**](https://graphql.org) and related marks are trademarks of the **GraphQL Foundation**—swap `assets/graphql-logo.svg` if your org prefers a custom glyph.
