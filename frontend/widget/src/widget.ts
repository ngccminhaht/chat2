import { WidgetConfig, OrganizationConfig, Message } from './types';
import { getStyles } from './styles';
import { getButtonIconSvg, closeIcon, defaultLogo } from './icons';
import { WidgetAPI } from './api';

const DEFAULT_API_URL = 'http://localhost:8300/api';

export class Widget {
  private config: WidgetConfig;
  private api: WidgetAPI;
  private orgConfig: OrganizationConfig | null = null;
  private container: HTMLElement | null = null;
  private isOpen = false;
  private messages: Message[] = [];

  constructor(config: Partial<WidgetConfig>) {
    if (!config.orgSlug) {
      throw new Error('orgSlug is required');
    }
    this.config = {
      orgSlug: config.orgSlug,
      apiUrl: config.apiUrl || DEFAULT_API_URL,
    };
    this.api = new WidgetAPI(this.config.apiUrl);
  }

  async init(): Promise<void> {
    try {
      this.orgConfig = await this.api.fetchConfig(this.config.orgSlug);
      this.render();
      this.bindEvents();
    } catch (error) {
      console.error('[MiAgent Widget] Failed to initialize', error);
    }
  }

  private getButtonIcon(): string {
    if (!this.orgConfig) return getButtonIconSvg('chat');

    const { buttonIcon, customIconUrl } = this.orgConfig;

    if (buttonIcon === 'custom' && customIconUrl) {
      return `<img src="${customIconUrl}" alt="chat">`;
    }

    return getButtonIconSvg(buttonIcon);
  }

  private getAvatarHtml(): string {
    if (!this.orgConfig) return defaultLogo;

    const { avatarUrl, avatarName, logo } = this.orgConfig;

    // Prefer avatar URL, then logo, then default
    if (avatarUrl) {
      return `<img src="${avatarUrl}" alt="${avatarName || 'avatar'}">`;
    }
    if (logo) {
      return `<img src="${logo}" alt="">`;
    }
    if (avatarName) {
      return `<span style="font-size: 16px; font-weight: 600;">${avatarName.charAt(0).toUpperCase()}</span>`;
    }

    return defaultLogo;
  }

  private render(): void {
    if (!this.orgConfig) return;

    // Create container
    this.container = document.createElement('div');
    this.container.id = 'miagent-widget-container';
    this.container.className = this.orgConfig.position || 'right';
    document.body.appendChild(this.container);

    // Inject styles with marker attribute for cleanup
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-miagent-widget', 'true');
    styleEl.textContent = getStyles(this.orgConfig);
    document.head.appendChild(styleEl);

    // Get display name
    const displayName = this.orgConfig.avatarName || this.orgConfig.organizationName;

    // Render widget HTML
    this.container.innerHTML = `
      <button id="miagent-widget-button">
        ${this.getButtonIcon()}
      </button>
      <div id="miagent-widget-window">
        <div id="miagent-widget-header">
          <div id="miagent-widget-header-logo">${this.getAvatarHtml()}</div>
          <div id="miagent-widget-header-info">
            <div id="miagent-widget-header-name">${displayName}</div>
            <div id="miagent-widget-header-status">Online</div>
          </div>
          <button id="miagent-widget-close">${closeIcon}</button>
        </div>
        <div id="miagent-widget-messages">
          <div class="miagent-message bot">${this.orgConfig.greeting}</div>
        </div>
        <div id="miagent-widget-input">
          <input type="text" placeholder="Type a message..." id="miagent-input-field">
          <button id="miagent-send-btn">Send</button>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Use event delegation on container for reliable event handling
    if (!this.container) {
      console.error('[MiAgent Widget] Container not found for event binding');
      return;
    }

    // Use capture phase to ensure we get events before React/Next.js
    this.container.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;
        const button = target.closest('#miagent-widget-button');
        const closeBtn = target.closest('#miagent-widget-close');
        const sendBtn = target.closest('#miagent-send-btn');

        if (button || closeBtn || sendBtn) {
          e.stopPropagation();
          e.preventDefault();
        }

        if (button) {
          this.toggle();
        } else if (closeBtn) {
          this.toggle();
        } else if (sendBtn) {
          this.sendMessage();
        }
      },
      true // Capture phase
    );

    const inputField = this.container.querySelector(
      '#miagent-input-field'
    ) as HTMLInputElement;
    inputField?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
    const window = document.getElementById('miagent-widget-window');
    window?.classList.toggle('open', this.isOpen);
  }

  open(): void {
    this.isOpen = true;
    document.getElementById('miagent-widget-window')?.classList.add('open');
  }

  close(): void {
    this.isOpen = false;
    document.getElementById('miagent-widget-window')?.classList.remove('open');
  }

  private sendMessage(): void {
    const inputField = document.getElementById(
      'miagent-input-field'
    ) as HTMLInputElement;
    const text = inputField.value.trim();
    if (!text) return;

    // Add user message to UI
    this.addMessage(text, 'user');
    inputField.value = '';

    // TODO: Send to backend via WebSocket
    // For now, show a demo response
    setTimeout(() => {
      this.addMessage(
        'Thank you for your message. An agent will respond shortly.',
        'bot'
      );
    }, 1000);
  }

  private addMessage(content: string, sender: 'user' | 'bot' | 'agent'): void {
    const messagesEl = document.getElementById('miagent-widget-messages');
    if (!messagesEl) return;

    const msgEl = document.createElement('div');
    msgEl.className = `miagent-message ${sender}`;
    msgEl.textContent = content;
    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    this.messages.push({
      id: Date.now().toString(),
      content,
      sender,
      timestamp: new Date(),
    });
  }

  destroy(): void {
    this.container?.remove();
  }
}
