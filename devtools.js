/**
 * Registers the GraphQL QA inspector as a DevTools tab.
 * Empty icon path uses the default panel appearance in Chrome.
 */
chrome.devtools.panels.create(
  "GraphQL QA",
  "icons/icon16.png",
  "panel.html",
  () => {}
);
