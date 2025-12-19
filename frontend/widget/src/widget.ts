import { WidgetConfig, OrganizationConfig, Message, VisitorInfo } from './types';
import { getStyles } from './styles';
import { getButtonIconSvg, closeIcon, defaultLogo } from './icons';
import { WidgetAPI } from './api';
import { WidgetSocket } from './socket';

const DEFAULT_API_URL = 'http://localhost:8300/api';

export class Widget {
  private config: WidgetConfig;
  private api: WidgetAPI;
  private socket: WidgetSocket | null = null;
  private orgConfig: OrganizationConfig | null = null;
  private container: HTMLElement | null = null;
  private isOpen = false;
  private messages: Message[] = [];
  private visitorInfo: VisitorInfo = {};
  private preChatCompleted = false;
  private isConnected = false;
  private typingIndicatorEl: HTMLElement | null = null;

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
      this.loadVisitorInfo();
      this.render();
      this.bindEvents();
      this.initSocket();
    } catch (error) {
      console.error('[MiAgent Widget] Failed to initialize', error);
    }
  }

  private loadVisitorInfo(): void {
    const key = `miagent_visitor_${this.orgConfig?.organizationId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        this.visitorInfo = JSON.parse(saved);
        this.preChatCompleted = true;
      } catch {
        // Ignore parse errors
      }
    }
  }

  private saveVisitorInfo(): void {
    const key = `miagent_visitor_${this.orgConfig?.organizationId}`;
    localStorage.setItem(key, JSON.stringify(this.visitorInfo));
  }

  private initSocket(): void {
    if (!this.orgConfig) return;

    this.socket = new WidgetSocket(
      this.config.apiUrl,
      this.orgConfig.organizationId
    );

    this.socket.setCallbacks({
      onConnected: () => {
        this.isConnected = true;
        this.updateConnectionStatus(true);
      },
      onDisconnected: () => {
        this.isConnected = false;
        this.updateConnectionStatus(false);
      },
      onMessage: (message) => {
        this.addMessageToUI(message);
      },
      onMessageSent: (messageId) => {
        this.updateMessageStatus(messageId, 'sent');
      },
      onMessageError: (error) => {
        console.error('[MiAgent] Message error:', error);
      },
      onConversationRestored: (messages) => {
        this.restoreMessages(messages);
      },
      onAgentTyping: (isTyping, agentName) => {
        this.showTypingIndicator(isTyping, agentName);
      },
      onPreChatSaved: () => {
        this.preChatCompleted = true;
        this.saveVisitorInfo();
      },
      onError: (code, message) => {
        console.error('[MiAgent] Error:', code, message);
        if (code === 'RATE_LIMITED') {
          this.showSystemMessage('Too many requests. Please try again later.');
        }
      },
    });

    // Connect with visitor info if available
    this.socket.connect(this.preChatCompleted ? this.visitorInfo : undefined);
  }

  private updateConnectionStatus(connected: boolean): void {
    const statusEl = document.getElementById('miagent-widget-header-status');
    if (statusEl) {
      statusEl.textContent = connected ? 'Online' : 'Connecting...';
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

  private shouldShowPreChatForm(): boolean {
    return !!(
      this.orgConfig?.preChatForm &&
      this.orgConfig.preChatFields.length > 0 &&
      !this.preChatCompleted
    );
  }

  private render(): void {
    if (!this.orgConfig) return;

    this.container = document.createElement('div');
    this.container.id = 'miagent-widget-container';
    this.container.className = this.orgConfig.position || 'right';
    document.body.appendChild(this.container);

    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-miagent-widget', 'true');
    styleEl.textContent = getStyles(this.orgConfig) + this.getPreChatStyles();
    document.head.appendChild(styleEl);

    const displayName =
      this.orgConfig.avatarName || this.orgConfig.organizationName;

    this.container.innerHTML = `
      <button id="miagent-widget-button">
        ${this.getButtonIcon()}
      </button>
      <div id="miagent-widget-window">
        <div id="miagent-widget-header">
          <div id="miagent-widget-header-logo">${this.getAvatarHtml()}</div>
          <div id="miagent-widget-header-info">
            <div id="miagent-widget-header-name">${displayName}</div>
            <div id="miagent-widget-header-status">Connecting...</div>
          </div>
          <button id="miagent-widget-close">${closeIcon}</button>
        </div>
        ${this.shouldShowPreChatForm() ? this.renderPreChatForm() : this.renderChatView()}
      </div>
    `;
  }

  private renderPreChatForm(): string {
    const fields = this.orgConfig?.preChatFields || [];
    const fieldInputs = fields
      .map((field) => {
        const type = field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text';
        const placeholder = field.charAt(0).toUpperCase() + field.slice(1);
        const required = field === 'name' || field === 'email' ? 'required' : '';
        return `
        <div class="miagent-form-field">
          <input type="${type}" name="${field}" placeholder="${placeholder}" ${required}>
        </div>
      `;
      })
      .join('');

    return `
      <div id="miagent-prechat-form">
        <div class="miagent-prechat-content">
          <h3>Start a conversation</h3>
          <p>${this.orgConfig?.greeting || 'Please fill in your details to begin.'}</p>
          <form id="miagent-prechat-form-element">
            ${fieldInputs}
            <button type="submit">Start Chat</button>
          </form>
        </div>
      </div>
    `;
  }

  private renderChatView(): string {
    return `
      <div id="miagent-widget-messages">
        <div class="miagent-message bot">${this.orgConfig?.greeting}</div>
      </div>
      <div id="miagent-widget-input">
        <input type="text" placeholder="Type a message..." id="miagent-input-field">
        <button id="miagent-send-btn">Send</button>
      </div>
    `;
  }

  private getPreChatStyles(): string {
    const primaryColor = this.orgConfig?.primaryColor || '#4F46E5';
    return `
      #miagent-prechat-form {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 24px;
        overflow-y: auto;
      }
      .miagent-prechat-content h3 {
        margin: 0 0 8px 0;
        font-size: 18px;
        font-weight: 600;
      }
      .miagent-prechat-content p {
        margin: 0 0 20px 0;
        font-size: 14px;
        color: #666;
        line-height: 1.5;
      }
      .miagent-form-field {
        margin-bottom: 12px;
      }
      .miagent-form-field input {
        width: 100%;
        padding: 12px 16px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 14px;
        outline: none;
        box-sizing: border-box;
      }
      .miagent-form-field input:focus {
        border-color: ${primaryColor};
      }
      #miagent-prechat-form-element button {
        width: 100%;
        padding: 12px 20px;
        margin-top: 8px;
        border: none;
        border-radius: 8px;
        background: ${primaryColor};
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      #miagent-prechat-form-element button:hover {
        opacity: 0.9;
      }
      .miagent-typing-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        background: #f0f0f0;
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        max-width: 80%;
        align-self: flex-start;
      }
      .miagent-typing-dots {
        display: flex;
        gap: 4px;
      }
      .miagent-typing-dots span {
        width: 6px;
        height: 6px;
        background: #888;
        border-radius: 50%;
        animation: miagent-bounce 1.4s infinite;
      }
      .miagent-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
      .miagent-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes miagent-bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-4px); }
      }
      .miagent-message.sending { opacity: 0.7; }
      .miagent-message.failed {
        opacity: 0.7;
        border: 1px dashed #f00;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .miagent-retry-btn {
        background: #ff4444;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
        cursor: pointer;
        align-self: flex-end;
      }
      .miagent-retry-btn:hover {
        background: #cc0000;
      }
      .miagent-system-message {
        text-align: center;
        font-size: 12px;
        color: #888;
        padding: 8px;
      }
    `;
  }

  private bindEvents(): void {
    if (!this.container) {
      console.error('[MiAgent Widget] Container not found for event binding');
      return;
    }

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
      true
    );

    // Pre-chat form submission
    this.container.addEventListener('submit', (e) => {
      if ((e.target as HTMLElement).id === 'miagent-prechat-form-element') {
        e.preventDefault();
        this.handlePreChatSubmit();
      }
    });

    // Input field events
    const inputField = this.container.querySelector(
      '#miagent-input-field'
    ) as HTMLInputElement;
    if (inputField) {
      inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.sendMessage();
      });
      inputField.addEventListener('input', () => {
        this.socket?.startTyping();
      });
    }
  }

  private handlePreChatSubmit(): void {
    const form = document.getElementById(
      'miagent-prechat-form-element'
    ) as HTMLFormElement;
    if (!form) return;

    const formData = new FormData(form);
    this.visitorInfo = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
    };

    // Send to server
    this.socket?.submitPreChatForm(this.visitorInfo);
    this.preChatCompleted = true;
    this.saveVisitorInfo();

    // Switch to chat view
    const windowEl = document.getElementById('miagent-widget-window');
    if (windowEl) {
      const preChatEl = document.getElementById('miagent-prechat-form');
      if (preChatEl) {
        preChatEl.outerHTML = this.renderChatView();
        this.rebindInputEvents();
      }
    }
  }

  private rebindInputEvents(): void {
    const inputField = document.getElementById(
      'miagent-input-field'
    ) as HTMLInputElement;
    if (inputField) {
      inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.sendMessage();
      });
      inputField.addEventListener('input', () => {
        this.socket?.startTyping();
      });
    }
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
    const text = inputField?.value.trim();
    if (!text) return;

    // Stop typing indicator
    this.socket?.stopTyping();

    // Generate temp ID for optimistic update
    const tempId = 'temp_' + Date.now();

    // Add to UI optimistically
    const message: Message = {
      id: tempId,
      content: text,
      sender: 'user',
      timestamp: new Date(),
      status: 'sending',
    };
    this.addMessageToUI(message);
    inputField.value = '';

    // Send via socket
    if (this.socket && this.isConnected) {
      this.socket.sendMessage(text);
    } else {
      // Queue or show error
      this.updateMessageStatus(tempId, 'failed');
      this.showSystemMessage('Unable to send. Please check your connection.');
    }
  }

  private addMessageToUI(message: Message): void {
    const messagesEl = document.getElementById('miagent-widget-messages');
    if (!messagesEl) return;

    // Remove typing indicator if present
    this.hideTypingIndicator();

    const msgEl = document.createElement('div');
    msgEl.className = `miagent-message ${message.sender}`;
    if (message.status === 'sending') msgEl.classList.add('sending');
    if (message.status === 'failed') msgEl.classList.add('failed');
    msgEl.setAttribute('data-id', message.id);
    msgEl.setAttribute('data-content', message.content);

    // Add content and retry button for failed messages
    const contentSpan = document.createElement('span');
    contentSpan.className = 'miagent-message-content';
    contentSpan.textContent = message.content;
    msgEl.appendChild(contentSpan);

    if (message.status === 'failed') {
      this.addRetryButton(msgEl, message.content);
    }

    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    this.messages.push(message);
  }

  private addRetryButton(msgEl: Element, content: string): void {
    // Remove existing retry button if any
    const existingBtn = msgEl.querySelector('.miagent-retry-btn');
    if (existingBtn) existingBtn.remove();

    const retryBtn = document.createElement('button');
    retryBtn.className = 'miagent-retry-btn';
    retryBtn.innerHTML = '↻ Retry';
    retryBtn.onclick = (e) => {
      e.stopPropagation();
      this.retryMessage(msgEl, content);
    };
    msgEl.appendChild(retryBtn);
  }

  private retryMessage(msgEl: Element, content: string): void {
    const messageId = msgEl.getAttribute('data-id');
    if (!messageId) return;

    // Remove from messages array and DOM
    this.messages = this.messages.filter((m) => m.id !== messageId);
    msgEl.remove();

    // Re-send message
    const inputField = document.getElementById('miagent-input-field') as HTMLInputElement;
    if (inputField) {
      inputField.value = content;
      this.sendMessage();
    }
  }

  private updateMessageStatus(
    messageId: string,
    status: 'sent' | 'failed'
  ): void {
    const msgEl = document.querySelector(`[data-id="${messageId}"]`);
    if (msgEl) {
      msgEl.classList.remove('sending');
      if (status === 'failed') {
        msgEl.classList.add('failed');
        const content = msgEl.getAttribute('data-content') || '';
        this.addRetryButton(msgEl, content);
      }
    }
    const msg = this.messages.find((m) => m.id === messageId);
    if (msg) msg.status = status;
  }

  private restoreMessages(messages: Message[]): void {
    const messagesEl = document.getElementById('miagent-widget-messages');
    if (!messagesEl) return;

    // Clear existing messages (keep greeting)
    messagesEl.innerHTML = `<div class="miagent-message bot">${this.orgConfig?.greeting}</div>`;

    messages.forEach((msg) => {
      this.addMessageToUI(msg);
    });
  }

  private showTypingIndicator(isTyping: boolean, agentName?: string): void {
    const messagesEl = document.getElementById('miagent-widget-messages');
    if (!messagesEl) return;

    if (isTyping) {
      if (!this.typingIndicatorEl) {
        this.typingIndicatorEl = document.createElement('div');
        this.typingIndicatorEl.className = 'miagent-typing-indicator';
        this.typingIndicatorEl.innerHTML = `
          <div class="miagent-typing-dots">
            <span></span><span></span><span></span>
          </div>
          <span>${agentName || 'Agent'} is typing...</span>
        `;
        messagesEl.appendChild(this.typingIndicatorEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    } else {
      this.hideTypingIndicator();
    }
  }

  private hideTypingIndicator(): void {
    if (this.typingIndicatorEl) {
      this.typingIndicatorEl.remove();
      this.typingIndicatorEl = null;
    }
  }

  private showSystemMessage(text: string): void {
    const messagesEl = document.getElementById('miagent-widget-messages');
    if (!messagesEl) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'miagent-system-message';
    msgEl.textContent = text;
    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  destroy(): void {
    this.socket?.disconnect();
    this.container?.remove();
  }
}
