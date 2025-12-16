import { FunctionComponent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { styled } from 'goober';
import { Message } from '../lib/storage';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  messages: Message[];
  greeting: string;
}

export const MessageList: FunctionComponent<MessageListProps> = ({
  messages,
  greeting,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <Container ref={containerRef}>
      {messages.length === 0 && greeting && (
        <GreetingMessage>
          <GreetingBubble>{greeting}</GreetingBubble>
        </GreetingMessage>
      )}

      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </Container>
  );
};

const Container = styled('div')`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }
`;

const GreetingMessage = styled('div')`
  display: flex;
  justify-content: flex-start;
`;

const GreetingBubble = styled('div')`
  max-width: 80%;
  padding: 12px 16px;
  background: #f3f4f6;
  border-radius: 16px 16px 16px 4px;
  color: #1f2937;
  font-size: 14px;
  line-height: 1.5;
`;
