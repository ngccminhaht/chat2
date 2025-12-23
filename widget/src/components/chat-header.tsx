import { JSX } from 'preact';
import { CloseIcon } from './icons';
import { OrganizationConfig } from '../types';

interface ChatHeaderProps {
  config: OrganizationConfig;
  isConnected: boolean;
  onClose: () => void;
}

export function ChatHeader({ config, isConnected, onClose }: ChatHeaderProps): JSX.Element {
  const { primaryColor, textColor, avatarUrl, avatarName, logo, organizationName } = config;
  const textColorClass = textColor === 'light' ? 'text-white' : 'text-black';
  const iconHexColor = textColor === 'light' ? '#ffffff' : '#000000';
  const displayName = avatarName || organizationName;

  const renderAvatar = () => {
    if (avatarUrl) {
      return <img src={avatarUrl} alt={avatarName || 'avatar'} class="w-full h-full object-cover" />;
    }
    if (logo) {
      return <img src={logo} alt="" class="w-full h-full object-cover" />;
    }
    if (avatarName) {
      return <span class="text-base font-semibold">{avatarName.charAt(0).toUpperCase()}</span>;
    }
    return (
      <svg viewBox="0 0 24 24" fill="white" width="24" height="24">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
      </svg>
    );
  };

  return (
    <div
      class={`flex items-center gap-3 p-4 ${textColorClass}`}
      style={{ backgroundColor: primaryColor }}
    >
      <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
        {renderAvatar()}
      </div>
      <div class="flex-1">
        <div class="font-semibold text-base">{displayName}</div>
        <div class="text-xs opacity-80">
          {isConnected ? 'Online' : 'Connecting...'}
        </div>
      </div>
      <button
        onClick={onClose}
        class="p-1 opacity-80 hover:opacity-100 bg-transparent border-none cursor-pointer"
      >
        <CloseIcon color={iconHexColor} />
      </button>
    </div>
  );
}
