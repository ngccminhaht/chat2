import { OrganizationConfig } from './types';

export function getStyles(config: OrganizationConfig): string {
  const {
    primaryColor,
    textColor,
    buttonStyle,
    buttonSize,
    marginRight,
    marginBottom,
    marginBottomMobile,
    windowHeight,
    windowHeightUnit,
    windowHeightMobile,
  } = config;

  const iconColor = textColor === 'light' ? '#ffffff' : '#000000';
  const iconColorSecondary = textColor === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)';

  // Get button border radius based on style
  const getButtonRadius = () => {
    switch (buttonStyle) {
      case 'circle': return '50%';
      case 'pill': return `${buttonSize / 2}px`;
      case 'square': return '8px';
      default: return '50%';
    }
  };

  // Calculate window height for desktop
  const windowHeightValue = windowHeightUnit === '%'
    ? `${windowHeight}vh`
    : `${windowHeight}px`;

  return `
    #miagent-widget-container {
      position: fixed;
      bottom: ${marginBottom}px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #miagent-widget-container.right { right: ${marginRight}px; }
    #miagent-widget-container.left { left: ${marginRight}px; }

    #miagent-widget-button {
      width: ${buttonSize}px;
      height: ${buttonSize}px;
      border-radius: ${getButtonRadius()};
      border: none;
      background: ${primaryColor};
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #miagent-widget-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0,0,0,0.2);
    }
    #miagent-widget-button svg {
      width: ${Math.round(buttonSize * 0.45)}px;
      height: ${Math.round(buttonSize * 0.45)}px;
      fill: ${iconColor};
    }
    #miagent-widget-button img {
      width: ${Math.round(buttonSize * 0.45)}px;
      height: ${Math.round(buttonSize * 0.45)}px;
      object-fit: contain;
    }

    #miagent-widget-window {
      position: absolute;
      bottom: ${buttonSize + 16}px;
      width: 380px;
      height: ${windowHeightValue};
      max-height: calc(100vh - ${buttonSize + marginBottom + 40}px);
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      overflow: hidden;
      display: none;
      flex-direction: column;
    }
    #miagent-widget-container.right #miagent-widget-window { right: 0; }
    #miagent-widget-container.left #miagent-widget-window { left: 0; }
    #miagent-widget-window.open { display: flex; }

    #miagent-widget-header {
      padding: 16px;
      background: ${primaryColor};
      color: ${iconColor};
      display: flex;
      align-items: center;
      gap: 12px;
    }
    #miagent-widget-header-logo {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    #miagent-widget-header-logo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    #miagent-widget-header-info { flex: 1; }
    #miagent-widget-header-name {
      font-weight: 600;
      font-size: 16px;
      color: ${iconColor};
    }
    #miagent-widget-header-status {
      font-size: 12px;
      color: ${iconColorSecondary};
    }
    #miagent-widget-close {
      background: none;
      border: none;
      color: ${iconColor};
      cursor: pointer;
      padding: 4px;
      opacity: 0.8;
    }
    #miagent-widget-close:hover { opacity: 1; }
    #miagent-widget-close svg {
      fill: ${iconColor};
    }

    #miagent-widget-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .miagent-message {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.4;
    }
    .miagent-message.bot,
    .miagent-message.agent {
      background: #f0f0f0;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .miagent-message.user {
      background: ${primaryColor};
      color: ${iconColor};
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }

    #miagent-widget-input {
      display: flex;
      padding: 12px;
      border-top: 1px solid #eee;
      gap: 8px;
    }
    #miagent-widget-input input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #ddd;
      border-radius: 24px;
      font-size: 14px;
      outline: none;
    }
    #miagent-widget-input input:focus { border-color: ${primaryColor}; }
    #miagent-widget-input button {
      padding: 12px 20px;
      border: none;
      border-radius: 24px;
      background: ${primaryColor};
      color: ${iconColor};
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }
    #miagent-widget-input button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    @media (max-width: 480px) {
      #miagent-widget-container {
        bottom: ${marginBottomMobile}px;
      }
      #miagent-widget-window {
        width: calc(100vw - ${marginRight * 2 + 20}px);
        height: ${windowHeightMobile}vh;
        max-height: calc(100vh - ${buttonSize + marginBottomMobile + 40}px);
        bottom: ${buttonSize + 12}px;
      }
    }
  `;
}
