import { JSX } from 'preact';
import { ButtonIcon } from './icons';
import { OrganizationConfig } from '../types';

interface ChatButtonProps {
  config: OrganizationConfig;
  onClick: () => void;
}

export function ChatButton({ config, onClick }: ChatButtonProps): JSX.Element {
  const { primaryColor, textColor, buttonStyle, buttonSize, buttonIcon, customIconUrl } = config;

  const iconColor = textColor === 'light' ? '#ffffff' : '#000000';

  const borderRadius = {
    circle: 'rounded-full',
    pill: 'rounded-full',
    square: 'rounded-lg',
  }[buttonStyle] || 'rounded-full';

  const iconSize = Math.round(buttonSize * 0.45);

  return (
    <button
      onClick={onClick}
      class={`flex items-center justify-center cursor-pointer shadow-lg hover:scale-105 hover:shadow-xl transition-all duration-200 ${borderRadius}`}
      style={{
        width: `${buttonSize}px`,
        height: `${buttonSize}px`,
        backgroundColor: primaryColor,
      }}
    >
      <ButtonIcon
        type={buttonIcon}
        customUrl={customIconUrl}
        color={iconColor}
        style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
      />
    </button>
  );
}
