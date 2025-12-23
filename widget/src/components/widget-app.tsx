import { JSX } from 'preact';
import { ChatButton } from './chat-button';
import { ChatWindow } from './chat-window';
import { useWidget } from '../hooks/use-widget';

interface WidgetAppProps {
  orgSlug: string;
  apiUrl?: string;
}

export function WidgetApp({ orgSlug, apiUrl }: WidgetAppProps): JSX.Element | null {
  const {
    orgConfig,
    messages,
    isOpen,
    isConnected,
    isLoading,
    preChatCompleted,
    sendMessage,
    retryMessage,
    submitPreChat,
    toggle,
    close,
  } = useWidget({ orgSlug, apiUrl });

  if (isLoading || !orgConfig) {
    return null;
  }

  const { position, marginRight, marginBottom, marginBottomMobile } = orgConfig;
  const positionClass = position === 'left' ? 'left-0' : 'right-0';

  return (
    <div
      id="miagent-widget-root"
      class={`fixed z-[2147483647] ${positionClass} max-[480px]:bottom-[${marginBottomMobile}px]`}
      style={{
        bottom: `${marginBottom}px`,
        [position === 'left' ? 'left' : 'right']: `${marginRight}px`,
      }}
    >
      <ChatButton config={orgConfig} onClick={toggle} />

      {isOpen && (
        <ChatWindow
          config={orgConfig}
          messages={messages}
          isConnected={isConnected}
          preChatCompleted={preChatCompleted}
          onClose={close}
          onSendMessage={sendMessage}
          onRetryMessage={retryMessage}
          onSubmitPreChat={submitPreChat}
        />
      )}
    </div>
  );
}
