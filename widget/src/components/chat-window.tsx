import { JSX } from 'preact';
import { ChatHeader } from './chat-header';
import { MessageList } from './message-list';
import { MessageInput } from './message-input';
import { PreChatForm } from './pre-chat-form';
import { Message, OrganizationConfig, VisitorInfo } from '../types';

interface ChatWindowProps {
  config: OrganizationConfig;
  messages: Message[];
  isConnected: boolean;
  preChatCompleted: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => void;
  onRetryMessage: (id: string, content: string) => void;
  onSubmitPreChat: (info: VisitorInfo) => void;
}

export function ChatWindow({
  config,
  messages,
  isConnected,
  preChatCompleted,
  onClose,
  onSendMessage,
  onRetryMessage,
  onSubmitPreChat,
}: ChatWindowProps): JSX.Element {
  const { buttonSize, marginBottom, windowHeight, windowHeightUnit, preChatForm, preChatFields } = config;

  const showPreChat = preChatForm && preChatFields.length > 0 && !preChatCompleted;

  // Calculate window height
  const heightValue = windowHeightUnit === '%' ? `${windowHeight}vh` : `${windowHeight}px`;

  return (
    <div
      class="absolute w-[380px] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col miagent-animate-fade-in max-[480px]:w-[calc(100vw-40px)]"
      style={{
        bottom: `${buttonSize + 16}px`,
        right: 0,
        height: heightValue,
        maxHeight: `calc(100vh - ${buttonSize + marginBottom + 40}px)`,
      }}
    >
      <ChatHeader config={config} isConnected={isConnected} onClose={onClose} />

      {showPreChat ? (
        <PreChatForm config={config} onSubmit={onSubmitPreChat} />
      ) : (
        <>
          <MessageList messages={messages} config={config} onRetry={onRetryMessage} />
          <MessageInput config={config} onSend={onSendMessage} disabled={!isConnected} />
        </>
      )}
    </div>
  );
}
