import { FunctionComponent, JSX } from 'preact';
import { useState } from 'preact/hooks';
import { styled } from 'goober';

interface PreChatFormProps {
  fields: string[];
  onSubmit: (data: { name?: string; email?: string; phone?: string }) => void;
}

export const PreChatForm: FunctionComponent<PreChatFormProps> = ({
  fields,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (fields.includes('name') && !name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (fields.includes('email')) {
      if (!email.trim()) {
        newErrors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        newErrors.email = 'Please enter a valid email';
      }
    }

    if (fields.includes('phone') && !phone.trim()) {
      newErrors.phone = 'Phone is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();

    if (!validate()) return;

    onSubmit({
      name: name.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
    });
  };

  return (
    <Container>
      <Title>Before we start</Title>
      <Subtitle>Please tell us a bit about yourself</Subtitle>

      <Form onSubmit={handleSubmit}>
        {fields.includes('name') && (
          <Field>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => setName(e.currentTarget.value)}
              placeholder="Your name"
              hasError={!!errors.name}
            />
            {errors.name && <Error>{errors.name}</Error>}
          </Field>
        )}

        {fields.includes('email') && (
          <Field>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => setEmail(e.currentTarget.value)}
              placeholder="your@email.com"
              hasError={!!errors.email}
            />
            {errors.email && <Error>{errors.email}</Error>}
          </Field>
        )}

        {fields.includes('phone') && (
          <Field>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => setPhone(e.currentTarget.value)}
              placeholder="Your phone number"
              hasError={!!errors.phone}
            />
            {errors.phone && <Error>{errors.phone}</Error>}
          </Field>
        )}

        <SubmitButton type="submit">Start Chat</SubmitButton>
      </Form>
    </Container>
  );
};

const Container = styled('div')`
  flex: 1;
  padding: 24px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Title = styled('h3')`
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px;
  color: #1f2937;
`;

const Subtitle = styled('p')`
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 24px;
`;

const Form = styled('form')`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Field = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Label = styled('label')`
  font-size: 13px;
  font-weight: 500;
  color: #374151;
`;

const Input = styled('input')<{ hasError?: boolean }>`
  padding: 10px 12px;
  border: 1px solid ${(props) => (props.hasError ? '#ef4444' : '#d1d5db')};
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const Error = styled('span')`
  font-size: 12px;
  color: #ef4444;
`;

const SubmitButton = styled('button')`
  margin-top: 8px;
  padding: 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #2563eb;
  }

  &:active {
    background: #1d4ed8;
  }
`;
