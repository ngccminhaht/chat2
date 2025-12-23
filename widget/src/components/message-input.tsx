import { JSX } from 'preact';
import { useState, useRef } from 'preact/hooks';
import { SendIcon } from './icons';
import { OrganizationConfig } from '../types';

interface MessageInputProps {
  config: OrganizationConfig;
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function MessageInput({ config, onSend, disabled }: MessageInputProps): JSX.Element {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { primaryColor, textColor } = config;
  const iconColor = textColor === 'light' ? '#ffffff' : '#000000';

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div class="flex gap-2 p-3 border-t border-gray-200">
      <input
        ref={inputRef}
        type="text"
        value={text}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
        onKeyPress={handleKeyPress}
        placeholder="Type a message..."
        disabled={disabled}
        class="flex-1 px-4 py-3 border border-gray-300 rounded-full text-sm outline-none focus:border-blue-500 disabled:opacity-50"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !text.trim()}
        class="flex items-center justify-center w-12 h-12 rounded-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: primaryColor }}
      >
        <SendIcon color={iconColor} />
      </button>
    </div>
  );
}
