/**
 * Integration Tests - Kafka Producer/Consumer Flow
 * Uses in-memory message bus to simulate Kafka behavior
 *
 * Note: @js-ak/kafkajs-mock doesn't properly simulate consumer.run() behavior
 * So we implement our own in-memory Kafka mock for proper testing
 */

/**
 * Type definition for Kafka message payload (matches kafkajs EachMessagePayload)
 */
interface EachMessagePayload {
  topic: string;
  partition: number;
  message: {
    key: Buffer | null;
    value: Buffer | null;
    timestamp: string;
    offset: string;
  };
}

/**
 * In-memory Kafka mock that properly simulates producer/consumer behavior
 */
class InMemoryKafkaMock {
  private topics: Map<string, Array<{ key?: string; value: string }>> = new Map();
  private consumers: Map<string, { topic: string; handler: (msg: any) => Promise<void> }[]> = new Map();

  producer() {
    return {
      connect: async () => {},
      disconnect: async () => {},
      send: async ({ topic, messages }: { topic: string; messages: Array<{ key?: string; value: string }> }) => {
        if (!this.topics.has(topic)) {
          this.topics.set(topic, []);
        }

        for (const msg of messages) {
          this.topics.get(topic)!.push(msg);

          // Notify consumers
          const consumers = this.consumers.get(topic) || [];
          for (const consumer of consumers) {
            await consumer.handler({
              topic,
              partition: 0,
              message: {
                key: msg.key ? Buffer.from(msg.key) : null,
                value: Buffer.from(msg.value),
                timestamp: Date.now().toString(),
                offset: '0',
              },
            });
          }
        }

        return [{ partition: 0, offset: '0' }];
      },
    };
  }

  consumer({ groupId }: { groupId: string }) {
    const consumerInstance = {
      groupId,
      subscribedTopics: [] as string[],
      connect: async () => {},
      disconnect: async () => {},
      subscribe: async ({ topic }: { topic: string; fromBeginning?: boolean }) => {
        consumerInstance.subscribedTopics.push(topic);
      },
      run: async ({ eachMessage }: { eachMessage: (payload: any) => Promise<void> }) => {
        for (const topic of consumerInstance.subscribedTopics) {
          if (!this.consumers.has(topic)) {
            this.consumers.set(topic, []);
          }
          this.consumers.get(topic)!.push({ topic, handler: eachMessage });
        }
      },
    };
    return consumerInstance;
  }
}

describe('Kafka Mock Integration Tests', () => {
  let kafka: InMemoryKafkaMock;
  let producer: ReturnType<InMemoryKafkaMock['producer']>;
  let consumer: ReturnType<InMemoryKafkaMock['consumer']>;

  const TOPIC = 'websocket.notifications';

  beforeEach(async () => {
    kafka = new InMemoryKafkaMock();
    producer = kafka.producer();
    consumer = kafka.consumer({ groupId: 'test-group' });

    await producer.connect();
    await consumer.connect();
  });

  afterEach(async () => {
    await producer.disconnect();
    await consumer.disconnect();
  });

  describe('Producer/Consumer Flow', () => {
    it('should send and receive message through Kafka', async () => {
      const receivedMessages: any[] = [];

      // Setup consumer
      await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
      await consumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          receivedMessages.push(JSON.parse(message.value?.toString() || '{}'));
        },
      });

      // Send message
      const testMessage = {
        type: 'message:new',
        userId: 'user123',
        payload: {
          conversationId: 'conv123',
          message: { text: 'Hello from Kafka!' },
        },
      };

      await producer.send({
        topic: TOPIC,
        messages: [{ value: JSON.stringify(testMessage) }],
      });

      // Wait for consumer to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual(testMessage);
    });

    it('should handle multiple messages in order', async () => {
      const receivedMessages: any[] = [];

      await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
      await consumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          receivedMessages.push(JSON.parse(message.value?.toString() || '{}'));
        },
      });

      // Send 5 messages
      const messages = Array.from({ length: 5 }, (_, i) => ({
        type: 'message:new',
        userId: 'user123',
        sequence: i + 1,
      }));

      await producer.send({
        topic: TOPIC,
        messages: messages.map((m) => ({ value: JSON.stringify(m) })),
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedMessages).toHaveLength(5);
      expect(receivedMessages.map((m) => m.sequence)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle messages with keys for partitioning', async () => {
      const receivedMessages: { key: string; value: any }[] = [];

      await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
      await consumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          receivedMessages.push({
            key: message.key?.toString() || '',
            value: JSON.parse(message.value?.toString() || '{}'),
          });
        },
      });

      // Send messages with different keys (simulating different users)
      await producer.send({
        topic: TOPIC,
        messages: [
          { key: 'user1', value: JSON.stringify({ msg: 'User 1 message' }) },
          { key: 'user2', value: JSON.stringify({ msg: 'User 2 message' }) },
          { key: 'user1', value: JSON.stringify({ msg: 'User 1 second message' }) },
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedMessages).toHaveLength(3);
      expect(receivedMessages[0].key).toBe('user1');
      expect(receivedMessages[1].key).toBe('user2');
      expect(receivedMessages[2].key).toBe('user1');
    });
  });

  describe('WebSocket Notification Flow Simulation', () => {
    it('should simulate full webhook → Kafka → WebSocket flow', async () => {
      const wsEmissions: any[] = [];

      // Simulate WebSocket bridge consumer
      await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
      await consumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          const event = JSON.parse(message.value?.toString() || '{}');

          // Simulate WebSocket emission based on event type
          switch (event.type) {
            case 'message:new':
              wsEmissions.push({
                event: 'message:new',
                room: `user:${event.userId}`,
                data: event.payload,
              });
              break;
            case 'conversation:updated':
              wsEmissions.push({
                event: 'conversation:updated',
                room: `user:${event.userId}`,
                data: event.payload,
              });
              break;
          }
        },
      });

      // Simulate Zalo webhook processing publishing to Kafka
      const userId = 'agent123';
      const messagePayload = {
        _id: 'msg_001',
        conversationId: 'conv_001',
        content: { text: 'Hello from Zalo!' },
        direction: 'inbound',
        platform: 'zalo',
      };

      const conversationPayload = {
        _id: 'conv_001',
        platform: 'zalo',
        lastMessage: { text: 'Hello from Zalo!' },
        unreadCount: 1,
      };

      // Publish message:new event
      await producer.send({
        topic: TOPIC,
        messages: [
          {
            key: userId,
            value: JSON.stringify({
              type: 'message:new',
              userId,
              payload: { conversationId: 'conv_001', message: messagePayload },
            }),
          },
        ],
      });

      // Publish conversation:updated event
      await producer.send({
        topic: TOPIC,
        messages: [
          {
            key: userId,
            value: JSON.stringify({
              type: 'conversation:updated',
              userId,
              payload: conversationPayload,
            }),
          },
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify WebSocket emissions
      expect(wsEmissions).toHaveLength(2);

      const msgEmission = wsEmissions.find((e) => e.event === 'message:new');
      expect(msgEmission).toBeDefined();
      expect(msgEmission.room).toBe(`user:${userId}`);
      expect(msgEmission.data.message.content.text).toBe('Hello from Zalo!');

      const convEmission = wsEmissions.find((e) => e.event === 'conversation:updated');
      expect(convEmission).toBeDefined();
      expect(convEmission.data.lastMessage.text).toBe('Hello from Zalo!');
    });

    it('should handle visitor message flow', async () => {
      const wsEmissions: any[] = [];

      await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
      await consumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          const event = JSON.parse(message.value?.toString() || '{}');
          wsEmissions.push({
            event: event.type,
            userId: event.userId,
            data: event.payload,
          });
        },
      });

      // Simulate visitor sending message - broadcast to all org agents
      const orgId = 'org_001';
      await producer.send({
        topic: TOPIC,
        messages: [
          {
            key: orgId, // Partition by org for ordering
            value: JSON.stringify({
              type: 'visitor:message',
              userId: orgId, // Will be broadcast to org agents room
              payload: {
                sessionId: 'visitor_session_001',
                message: { text: 'Help needed!' },
              },
            }),
          },
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(wsEmissions).toHaveLength(1);
      expect(wsEmissions[0].event).toBe('visitor:message');
      expect(wsEmissions[0].data.message.text).toBe('Help needed!');
    });
  });

  describe('Error Handling', () => {
    it('should handle consumer errors gracefully', async () => {
      const errors: Error[] = [];
      const processedMessages: any[] = [];

      await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
      await consumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          const data = JSON.parse(message.value?.toString() || '{}');

          if (data.shouldError) {
            errors.push(new Error('Simulated error'));
            return;
          }

          processedMessages.push(data);
        },
      });

      // Send mix of good and bad messages
      await producer.send({
        topic: TOPIC,
        messages: [
          { value: JSON.stringify({ id: 1, shouldError: false }) },
          { value: JSON.stringify({ id: 2, shouldError: true }) },
          { value: JSON.stringify({ id: 3, shouldError: false }) },
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(processedMessages).toHaveLength(2);
      expect(errors).toHaveLength(1);
    });
  });
});
