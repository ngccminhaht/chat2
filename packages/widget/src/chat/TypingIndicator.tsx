import { FunctionComponent } from 'preact';
import { styled, keyframes } from 'goober';

export const TypingIndicator: FunctionComponent = () => {
  return (
    <Container>
      <Bubble>
        <Dot style={{ animationDelay: '0ms' }} />
        <Dot style={{ animationDelay: '150ms' }} />
        <Dot style={{ animationDelay: '300ms' }} />
      </Bubble>
    </Container>
  );
};

const bounce = keyframes`
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-4px);
  }
`;

const Container = styled('div')`
  display: flex;
  justify-content: flex-start;
  padding: 0 16px 8px;
`;

const Bubble = styled('div')`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background: #f3f4f6;
  border-radius: 16px 16px 16px 4px;
`;

const Dot = styled('span')`
  width: 8px;
  height: 8px;
  background: #9ca3af;
  border-radius: 50%;
  animation: ${bounce} 1.4s ease-in-out infinite;
`;
