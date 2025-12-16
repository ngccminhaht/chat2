import { FunctionComponent } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { styled } from 'goober';
import { WidgetConfig } from '../lib/config';
import { getUnreadCount } from '../lib/storage';
import { ChatIcon } from '../assets/icons';

interface LauncherProps {
  config: WidgetConfig;
  sessionId: string;
  onOpenChat: () => void;
}

export const Launcher: FunctionComponent<LauncherProps> = ({
  config,
  sessionId,
  onOpenChat,
}) => {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setUnreadCount(getUnreadCount(sessionId));
  }, [sessionId]);

  const positionStyle = config.position === 'left' ? { left: '20px' } : { right: '20px' };

  return (
    <LauncherButton
      style={{
        backgroundColor: config.primaryColor,
        ...positionStyle,
      }}
      onClick={onOpenChat}
      aria-label="Open chat"
    >
      <ChatIcon />
      {unreadCount > 0 && <Badge>{unreadCount > 9 ? '9+' : unreadCount}</Badge>}
    </LauncherButton>
  );
};

const LauncherButton = styled('button')`
  position: fixed;
  bottom: 20px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s, box-shadow 0.2s;
  z-index: 2147483647;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 28px;
    height: 28px;
    fill: white;
  }
`;

const Badge = styled('span')`
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ef4444;
  color: white;
  font-size: 12px;
  font-weight: 600;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
`;
