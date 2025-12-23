import { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { OrganizationConfig, VisitorInfo } from '../types';

interface PreChatFormProps {
  config: OrganizationConfig;
  onSubmit: (info: VisitorInfo) => void;
}

export function PreChatForm({ config, onSubmit }: PreChatFormProps): JSX.Element {
  const { primaryColor, preChatFields, greeting } = config;
  const [formData, setFormData] = useState<VisitorInfo>({});

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getInputType = (field: string) => {
    if (field === 'email') return 'email';
    if (field === 'phone') return 'tel';
    return 'text';
  };

  const isRequired = (field: string) => field === 'name' || field === 'email';

  return (
    <div class="flex-1 flex flex-col p-6 overflow-y-auto">
      <h3 class="m-0 mb-2 text-lg font-semibold">Start a conversation</h3>
      <p class="m-0 mb-5 text-sm text-gray-600 leading-relaxed">
        {greeting || 'Please fill in your details to begin.'}
      </p>

      <form onSubmit={handleSubmit} class="flex flex-col gap-3">
        {preChatFields.map((field) => (
          <input
            key={field}
            type={getInputType(field)}
            name={field}
            placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
            required={isRequired(field)}
            value={formData[field as keyof VisitorInfo] || ''}
            onInput={(e) => handleChange(field, (e.target as HTMLInputElement).value)}
            class="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500 box-border"
            style={{ '--focus-color': primaryColor } as JSX.CSSProperties}
          />
        ))}

        <button
          type="submit"
          class="w-full py-3 mt-2 border-none rounded-lg text-white text-sm font-medium cursor-pointer hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          Start Chat
        </button>
      </form>
    </div>
  );
}
