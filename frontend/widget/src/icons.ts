// Chat icon (default)
export const chatIcon = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>`;

// Message icon
export const messageIcon = `<svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`;

// Messenger icon
export const messengerIcon = `<svg viewBox="0 0 24 24"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.34.29.55l.06 1.72c.02.66.72 1.08 1.33.78l1.92-.93c.16-.08.34-.11.51-.08.86.21 1.77.32 2.75.32 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm1.09 12.63L10.97 12 6.4 14.8l5.02-5.32 2.17 2.62 4.5-2.74-4.97 5.27z"/></svg>`;

// Close icon
export const closeIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;

// Default logo/avatar
export const defaultLogo = `<svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;

// Get button icon by type
export function getButtonIconSvg(type: string): string {
  switch (type) {
    case 'chat': return chatIcon;
    case 'message': return messageIcon;
    case 'messenger': return messengerIcon;
    default: return chatIcon;
  }
}
