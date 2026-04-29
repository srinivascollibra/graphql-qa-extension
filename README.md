# 🚀 GraphQL QA (Chrome Extension)

### *A Chrome DevTools Extension for Precision GraphQL Testing*

**GraphQL QA Panel** is a dedicated DevTools tab built for testers and developers. It captures real-time GraphQL traffic, providing deep visibility into operations, error states, and payload data—all within the native browser environment.

---

## ✨ Key Features

* **Smart Traffic Monitoring:** Automatically detects and categorizes `query`, `mutation`, and `subscription` operations with distinct icons.
* **Deep Payload Support:** Handles standard POST JSON, batched arrays, APQ (Persisted Queries), GET-based queries, and `multipart` uploads.
* **Error Highlighting:** 
    * 🟠 **Orange:** HTTP transport failures (Status $\ge 400$).
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
## 📺 Screenshots

* **Graphql QA Panel**:
<img width="3456" height="904" alt="image" src="https://github.com/user-attachments/assets/cc41f69a-96f6-40df-9384-b5eebd2ed320" />

* **Copy bug report:**  This copies all details to paste it in bug report.
<img width="1371" height="901" alt="image" src="https://github.com/user-attachments/assets/4fc47d43-b669-476c-8de5-ad569ae2693e" />

* **Export Response:** Exports only the response in JSON Format
<img width="1728" height="459" alt="image" src="https://github.com/user-attachments/assets/3d1a197f-3df4-453f-9576-89bd54f0d193" />


## 🔒 Privacy & Security

* **Local Execution:** All data processing happens locally within your browser instance.
* **Permissions:** Uses `storage` for UI persistence and `webNavigation`/`tabs` solely to detect route changes for the "Clear logs" feature.
* **No Remote Access:** No data is sent to external servers.

---

## ⚖️ Legal
*GraphQL and the GraphQL logo are trademarks of the GraphQL Foundation.*
