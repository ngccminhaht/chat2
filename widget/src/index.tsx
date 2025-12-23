import { render } from 'preact';
import { WidgetApp } from './components/widget-app';
import css from './styles.generated.css?raw';

declare global {
  interface Window {
    MiAgent?: {
      destroy: () => void;
    };
  }
}

// Inject CSS
const styleEl = document.createElement('style');
styleEl.setAttribute('data-miagent-widget', '');
styleEl.textContent = css;
document.head.appendChild(styleEl);

// Auto-initialize from script tag
(function () {
  // Prevent duplicate initialization
  if (window.MiAgent) {
    console.warn('[MiAgent Widget] Already initialized, skipping');
    return;
  }

  // Check if container already exists
  if (document.getElementById('miagent-widget-container')) {
    console.warn('[MiAgent Widget] Container already exists, skipping');
    return;
  }

  // Find script element
  let script = document.currentScript as HTMLScriptElement | null;

  if (!script) {
    script = document.querySelector('script[data-miagent-widget]') as HTMLScriptElement | null;
  }

  if (!script) {
    script = document.querySelector('script[src*="widget.js"]') as HTMLScriptElement | null;
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

  const apiUrl = script.getAttribute('data-api') || undefined;

  // Create container
  const container = document.createElement('div');
  container.id = 'miagent-widget-container';
  document.body.appendChild(container);

  // Render Preact app
  render(<WidgetApp orgSlug={orgSlug} apiUrl={apiUrl} />, container);

  // Expose destroy method
  window.MiAgent = {
    destroy: () => {
      render(null, container);
      container.remove();
      styleEl.remove();
      window.MiAgent = undefined;
    },
  };
})();
