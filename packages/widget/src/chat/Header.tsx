import { FunctionComponent } from 'preact';
import { styled } from 'goober';
import { MinimizeIcon } from '../assets/icons';

interface HeaderProps {
  title: string;
  color: string;
  isConnected: boolean;
  onClose: () => void;
}

export const Header: FunctionComponent<HeaderProps> = ({
  title,
  color,
  isConnected,
  onClose,
}) => {
  return (
    <Container style={{ backgroundColor: color }}>
      <TitleSection>
        <Title>{title}</Title>
        <Status connected={isConnected}>
          <StatusDot connected={isConnected} />
          {isConnected ? 'Online' : 'Connecting...'}
        </Status>
      </TitleSection>
      <Actions>
        <ActionButton onClick={onClose} aria-label="Minimize chat">
          <MinimizeIcon />
        </ActionButton>
      </Actions>
    </Container>
  );
};

const Container = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  color: white;
  flex-shrink: 0;
`;

const TitleSection = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Title = styled('h2')`
  font-size: 16px;
  font-weight: 600;
  margin: 0;
`;

const Status = styled('div')<{ connected: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  opacity: 0.9;
`;

const StatusDot = styled('span')<{ connected: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(props) => (props.connected ? '#22c55e' : '#fbbf24')};
`;

const Actions = styled('div')`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled('button')`
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  svg {
    width: 18px;
    height: 18px;
    fill: white;
  }
`;
