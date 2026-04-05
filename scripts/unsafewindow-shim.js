// Shim for GPTK's unsafeWindow usage.
// In Tampermonkey, unsafeWindow provides access to the page's real window.
// In a Chrome extension MAIN world script, `window` IS the page's real window,
// so we just alias it.
if (typeof unsafeWindow === "undefined") {
  window.unsafeWindow = window;
}
