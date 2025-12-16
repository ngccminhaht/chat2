import { render, h } from 'preact';
import { setup } from 'goober';
import { Launcher } from './launcher/Launcher';
import { fetchConfig, WidgetConfig } from './lib/config';
import { getOrCreateSessionId } from './lib/storage';

// Setup goober with Preact's h function
setup(h);

interface MiAgentWidgetOptions {
  orgSlug: string;
  color?: string;
  position?: 'left' | 'right';
}

class MiAgentWidget {
  private container: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private config: WidgetConfig | null = null;
  private sessionId: string;

  constructor(private options: MiAgentWidgetOptions) {
    this.sessionId = getOrCreateSessionId();
    this.init();
  }

  private async init() {
    try {
      // Fetch config from backend
      this.config = await fetchConfig(this.options.orgSlug);

      // Apply option overrides
      if (this.options.color) {
        this.config.primaryColor = this.options.color;
      }
      if (this.options.position) {
        this.config.position = this.options.position;
      }

      // Create container with Shadow DOM
      this.container = document.createElement('div');
      this.container.id = 'miagent-widget';
      document.body.appendChild(this.container);

      this.shadowRoot = this.container.attachShadow({ mode: 'closed' });

      // Add reset styles to shadow DOM
      const style = document.createElement('style');
      style.textContent = this.getBaseStyles();
      this.shadowRoot.appendChild(style);

      // Create render target
      const root = document.createElement('div');
      root.id = 'widget-root';
      this.shadowRoot.appendChild(root);

      // Render launcher
      render(
        h(Launcher, {
          config: this.config,
          sessionId: this.sessionId,
          onOpenChat: () => this.loadAndOpenChat(),
        }),
        root
      );
    } catch (error) {
      console.error('[MiAgent Widget] Init failed:', error);
    }
  }

  private async loadAndOpenChat() {
    if (!this.config || !this.shadowRoot) return;

    // Dynamically import chat module
    const { ChatWindow } = await import('./chat/ChatWindow');

    const root = this.shadowRoot.getElementById('widget-root');
    if (!root) return;

    render(
      h(ChatWindow, {
        config: this.config,
        sessionId: this.sessionId,
        onClose: () => this.closeChat(),
      }),
      root
    );
  }

  private closeChat() {
    if (!this.config || !this.shadowRoot) return;

    const root = this.shadowRoot.getElementById('widget-root');
    if (!root) return;

    render(
      h(Launcher, {
        config: this.config,
        sessionId: this.sessionId,
        onOpenChat: () => this.loadAndOpenChat(),
      }),
      root
    );
  }

  private getBaseStyles(): string {
    return `
      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      #widget-root {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #1a1a1a;
      }
    `;
  }

  destroy() {
    if (this.container) {
      this.container.remove();
    }
  }
}

// Auto-init from script tag data attributes
function autoInit() {
  const script = document.currentScript as HTMLScriptElement;
  if (!script) return;

  const orgSlug = script.dataset.org;
  if (!orgSlug) {
    console.error('[MiAgent Widget] Missing data-org attribute');
    return;
  }

  (window as any).MiAgentWidget = new MiAgentWidget({
    orgSlug,
    color: script.dataset.color,
    position: script.dataset.position as 'left' | 'right',
  });
}

// Run when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit);
} else {
  autoInit();
}

export { MiAgentWidget };
