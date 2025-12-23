import { Widget } from './widget';
import { WidgetConfig } from './types';

declare global {
  interface Window {
    MiAgentWidget: typeof Widget;
    MiAgent?: Widget;
  }
}

// Auto-initialize from script tag
(function () {
  // Prevent duplicate initialization
  if (window.MiAgent) {
    console.warn('[MiAgent Widget] Already initialized, skipping');
    return;
  }

  // Check if container already exists (another guard)
  if (document.getElementById('miagent-widget-container')) {
    console.warn('[MiAgent Widget] Container already exists, skipping');
    return;
  }

  // Try to get script element - works for inline scripts
  let script = document.currentScript as HTMLScriptElement | null;

  // For dynamically injected scripts, find by attribute
  if (!script) {
    script = document.querySelector(
      'script[data-miagent-widget]'
    ) as HTMLScriptElement | null;
  }

  // Last resort: find by src containing widget.js
  if (!script) {
    script = document.querySelector(
      'script[src*="widget.js"]'
    ) as HTMLScriptElement | null;
  }

  if (!script) {
    console.error('[MiAgent Widget] Could not find script element');
    return;
  }

  const orgSlug = script.getAttribute('data-org');
  if (!orgSlug) {
    console.error('[MiAgent Widget] data-org attribute is required');
    return;
  }

  const config: Partial<WidgetConfig> = {
    orgSlug,
    apiUrl: script.getAttribute('data-api') || undefined,
  };

  const widget = new Widget(config);
  widget.init();

  // Expose to window for manual control
  window.MiAgentWidget = Widget;
  window.MiAgent = widget;
})();

export { Widget };
export type { WidgetConfig };
