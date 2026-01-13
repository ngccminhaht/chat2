import { JSX } from 'preact';
import { RefreshIcon } from './icons';
import { Message, OrganizationConfig } from '../types';

interface MessageBubbleProps {
  message: Message;
  config: OrganizationConfig;
  onRetry?: (id: string, content: string) => void;
}

export function MessageBubble({ message, config, onRetry }: MessageBubbleProps): JSX.Element {
  const { primaryColor, textColor } = config;
  const isUser = message.sender === 'user';
  const iconColor = textColor === 'light' ? 'text-white' : 'text-black';

  const bubbleClasses = isUser
    ? `self-end rounded-br-sm ${iconColor}`
    : 'self-start bg-gray-100 text-gray-900 rounded-bl-sm';

  const bubbleStyle = isUser ? { backgroundColor: primaryColor } : {};

  const statusClasses = {
    sending: 'opacity-70',
    failed: 'opacity-70 border border-dashed border-red-500',
    sent: '',
  }[message.status || 'sent'];

  return (
    <div
      class={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed flex flex-col gap-1 miagent-animate-fade-in overflow-hidden ${bubbleClasses} ${statusClasses}`}
      style={bubbleStyle}
    >
      {message.content && (
        <span
          class="break-words max-w-full"
          style="word-break: break-all; overflow-wrap: anywhere;"
        >
          {message.content}
        </span>
      )}

      {message.mediaUrl && (
        <img
          src={message.mediaUrl}
          alt="Attachment"
          class="max-w-full max-h-48 rounded-lg mt-2 cursor-pointer first:mt-0"
          onClick={() => window.open(message.mediaUrl, '_blank')}
        />
      )}

      {message.status === 'failed' && onRetry && (
        <button
          onClick={() => onRetry(message.id, message.content)}
          class="self-end flex items-center gap-1 bg-red-500 text-white border-none rounded px-2 py-1 text-xs cursor-pointer hover:bg-red-600"
        >
          <RefreshIcon />
          Retry
        </button>
      )}
    </div>
  );
}
