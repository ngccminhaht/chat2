import { JSX } from 'preact';

interface IconProps {
  class?: string;
  style?: JSX.CSSProperties;
  color?: string;
}

export function ChatIcon({ class: className, style, color = 'currentColor' }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" class={className} style={style} fill={color}>
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
    </svg>
  );
}

export function MessageIcon({ class: className, style, color = 'currentColor' }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" class={className} style={style} fill={color}>
      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
    </svg>
  );
}

export function MessengerIcon({ class: className, style, color = 'currentColor' }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" class={className} style={style} fill={color}>
      <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.34.29.55l.06 1.72c.02.66.72 1.08 1.33.78l1.92-.93c.16-.08.34-.11.51-.08.86.21 1.77.32 2.75.32 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm1.09 12.63L10.97 12 6.4 14.8l5.02-5.32 2.17 2.62 4.5-2.74-4.97 5.27z" />
    </svg>
  );
}

export function CloseIcon({ class: className, style, color = 'currentColor' }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" class={className} style={style} fill={color} width="24" height="24">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

export function SendIcon({ class: className, style, color = 'currentColor' }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" class={className} style={style} fill={color} width="20" height="20">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

export function RefreshIcon({ class: className, style, color = 'currentColor' }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" class={className} style={style} fill={color} width="14" height="14">
      <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  );
}

interface ButtonIconProps extends IconProps {
  type: 'chat' | 'message' | 'messenger' | 'custom';
  customUrl?: string;
}

export function ButtonIcon({ type, customUrl, class: className, style, color }: ButtonIconProps): JSX.Element {
  if (type === 'custom' && customUrl) {
    return <img src={customUrl} alt="chat" class={className} style={style} />;
  }

  switch (type) {
    case 'message':
      return <MessageIcon class={className} style={style} color={color} />;
    case 'messenger':
      return <MessengerIcon class={className} style={style} color={color} />;
    default:
      return <ChatIcon class={className} style={style} color={color} />;
  }
}
