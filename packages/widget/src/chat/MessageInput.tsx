import { FunctionComponent } from 'preact';
import { useState, useRef, useCallback } from 'preact/hooks';
import { styled } from 'goober';
import { SendIcon, AttachIcon } from '../assets/icons';

interface MessageInputProps {
  onSend: (text: string, file?: File) => void;
  onTyping: (isTyping: boolean) => void;
  disabled: boolean;
}

export const MessageInput: FunctionComponent<MessageInputProps> = ({
  onSend,
  onTyping,
  disabled,
}) => {
  const [text, setText] = useState('');
  const typingTimeoutRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTyping = useCallback(() => {
    onTyping(true);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = window.setTimeout(() => {
      onTyping(false);
    }, 2000);
  }, [onTyping]);

  const handleChange = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    setText(target.value);
    handleTyping();
  };

  const handleSubmit = (e?: Event) => {
    e?.preventDefault();

    const trimmedText = text.trim();
    if (!trimmedText || disabled) return;

    onSend(trimmedText);
    setText('');
    onTyping(false);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];

    if (file) {
      // TODO: Implement file upload
      console.log('File selected:', file.name);
    }

    // Reset input
    target.value = '';
  };

  return (
    <Container>
      <InputWrapper>
        <AttachButton
          type="button"
          onClick={handleFileClick}
          disabled={disabled}
          aria-label="Attach file"
        >
          <AttachIcon />
        </AttachButton>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <TextArea
          value={text}
          onInput={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Connecting...' : 'Type a message...'}
          disabled={disabled}
          rows={1}
        />

        <SendButton
          type="button"
          onClick={() => handleSubmit()}
          disabled={disabled || !text.trim()}
          aria-label="Send message"
        >
          <SendIcon />
        </SendButton>
      </InputWrapper>
    </Container>
  );
};

const Container = styled('div')`
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
  background: white;
  flex-shrink: 0;
`;

const InputWrapper = styled('div')`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: #f3f4f6;
  border-radius: 24px;
  padding: 8px 12px;
`;

const TextArea = styled('textarea')`
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  font-size: 14px;
  line-height: 1.5;
  max-height: 120px;
  outline: none;
  font-family: inherit;

  &::placeholder {
    color: #9ca3af;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const IconButton = styled('button')`
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  svg {
    width: 20px;
    height: 20px;
    fill: #6b7280;
  }
`;

const AttachButton = styled(IconButton)``;

const SendButton = styled(IconButton)`
  svg {
    fill: #3b82f6;
  }

  &:disabled svg {
    fill: #9ca3af;
  }
`;
