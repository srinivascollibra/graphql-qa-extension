# 🚀 GraphQL QA (Chrome Extension)

### *A Chrome DevTools Extension for Precision GraphQL Testing*

**GraphQL QA Panel** is a dedicated DevTools tab built for testers and developers. It captures real-time GraphQL traffic, providing deep visibility into operations, error states, and payload data—all within the native browser environment.

---

## ✨ Key Features

* **Smart Traffic Monitoring:** Automatically detects and categorizes `query`, `mutation`, and `subscription` operations with distinct icons.
* **Deep Payload Support:** Handles standard POST JSON, batched arrays, APQ (Persisted Queries), GET-based queries, and `multipart` uploads.
* **Error Highlighting:** * 🟠 **Orange:** HTTP transport failures (Status $\ge 400$).
    * 🔴 **Red:** Valid HTTP responses containing GraphQL `errors` arrays.
* **Flexible Log Management:** Toggle between **Clear** or **Preserve** logs during full page reloads and SPA (History API) route changes.
* **Developer-First UX:**
    * **Resizable Panes:** Drag or use `Shift` + `Arrow Keys` to adjust the UI.
    * **Virtualization:** High-performance list rendering supports up to 500 operations without lag.
    * **Quick Copy:** One-click copying for Bug Reports (bundled metadata), Query, Variables, or Responses.
    * **Disk Export:** Bypass clipboard limits by exporting massive JSON responses directly to files.

---

## 🛠 Installation (Developer Mode)

1.  Download or clone this repository.
2.  Open **Chrome** and navigate to `chrome://extensions`.
3.  Enable **Developer mode** (top right toggle).
4.  Click **Load unpacked** and select the `chrome-extension-graphql-tester` folder.
5.  Open DevTools (**F12** or **Cmd+Option+I**) and select the **GraphQL QA** tab.

---

## 📖 Usage Guide

* **Navigation Control:** Use the "Logs on navigation" setting to decide if the panel should wipe data when you change routes.
* **Keyboard Shortcuts:** Navigate the list using **↑** / **↓** keys when the list pane is focused.
* **Summary View:** View full request/response headers and metadata for the selected operation.
* **Filtering:** Use the built-in filter to isolate specific operation names or types.

---

## 💻 Developer Notes

### Development Workflow
* **Testing:** Run `npm test` to execute **Vitest** suites against the parsing logic.
* **Assets:** If you modify `assets/graphql-logo.svg`, run `npm run icons` (requires `sharp`) to regenerate the extension icons.

### Technical Limitations
* **WebSockets:** Subscriptions are captured if initiated via standard network requests, but continuous WebSocket stream data is limited by the current `chrome.devtools.network` API.
* **SPA Heuristic:** Automated clearing triggers on **pathname** changes. Updates to query strings or hashes only will not trigger a "Clear on Navigation" event to prevent UI flickering.

---

## 🔒 Privacy & Security

* **Local Execution:** All data processing happens locally within your browser instance.
* **Permissions:** Uses `storage` for UI persistence and `webNavigation`/`tabs` solely to detect route changes for the "Clear logs" feature.
* **No Remote Access:** No data is sent to external servers.

---

## ⚖️ Legal
*GraphQL and the GraphQL logo are trademarks of the GraphQL Foundation.*
