import { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { MessageBubble } from './message-bubble';
import { Message, OrganizationConfig } from '../types';

interface MessageListProps {
  messages: Message[];
  config: OrganizationConfig;
  onRetry: (id: string, content: string) => void;
}

export function MessageList({ messages, config, onRetry }: MessageListProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={containerRef}
      class="flex-1 overflow-y-auto p-4 flex flex-col gap-3"
    >
      {/* Greeting message */}
      <div class="self-start max-w-[80%] p-3 rounded-2xl rounded-bl-sm bg-gray-100 text-gray-900 text-sm leading-relaxed">
        {config.greeting}
      </div>

      {/* Messages */}
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          config={config}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}
