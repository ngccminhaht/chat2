import { FunctionComponent } from 'preact';
import { styled } from 'goober';
import { Message } from '../lib/storage';
import { CheckIcon, CheckDoubleIcon } from '../assets/icons';

interface MessageItemProps {
  message: Message;
}

export const MessageItem: FunctionComponent<MessageItemProps> = ({ message }) => {
  const isOutbound = message.direction === 'outbound';

  return (
    <Container outbound={isOutbound}>
      <Bubble outbound={isOutbound}>
        {message.mediaUrl && (
          <MediaPreview src={message.mediaUrl} alt="Attachment" />
        )}
        {message.text && <Text>{message.text}</Text>}
        <Meta>
          <Time>{formatTime(message.timestamp)}</Time>
          {isOutbound && (
            <Status>
              {message.status === 'pending' && <PendingDot />}
              {message.status === 'sent' && <CheckIcon />}
              {message.status === 'delivered' && <CheckDoubleIcon />}
              {message.status === 'failed' && <FailedText>Failed</FailedText>}
            </Status>
          )}
        </Meta>
      </Bubble>
    </Container>
  );
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const Container = styled('div')<{ outbound: boolean }>`
  display: flex;
  justify-content: ${(props) => (props.outbound ? 'flex-end' : 'flex-start')};
`;

const Bubble = styled('div')<{ outbound: boolean }>`
  max-width: 80%;
  padding: 10px 14px;
  background: ${(props) => (props.outbound ? '#3b82f6' : '#f3f4f6')};
  color: ${(props) => (props.outbound ? 'white' : '#1f2937')};
  border-radius: ${(props) =>
    props.outbound ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};
`;

const Text = styled('p')`
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
`;

const MediaPreview = styled('img')`
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  margin-bottom: 8px;
  object-fit: cover;
`;

const Meta = styled('div')`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 4px;
`;

const Time = styled('span')`
  font-size: 11px;
  opacity: 0.7;
`;

const Status = styled('span')`
  display: flex;
  align-items: center;

  svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
    opacity: 0.7;
  }
`;

const PendingDot = styled('span')`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
`;

const FailedText = styled('span')`
  font-size: 11px;
  color: #ef4444;
`;
