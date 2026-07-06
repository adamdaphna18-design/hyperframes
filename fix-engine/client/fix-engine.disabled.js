/* Fix Engine is disabled (FIX_ENGINE_ENABLED=0). No overlay is installed. */
(function () {
  if (window.__FIX_ENGINE_LOADED__) return;
  window.__FIX_ENGINE_LOADED__ = true;
  // Intentionally inert — kill switch is on.
})();
