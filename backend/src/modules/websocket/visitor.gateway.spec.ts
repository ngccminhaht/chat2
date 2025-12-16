import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VisitorGateway, VisitorSocket } from './visitor.gateway';
import { VisitorMessageService } from './visitor-message.service';
import { VisitorRateLimitService } from './visitor-rate-limit.service';
import {
  Organization,
  OrganizationDocument,
} from '@/common/database/schemas/organization.schema';

describe('VisitorGateway', () => {
  let gateway: VisitorGateway;
  let organizationModel: jest.Mocked<Model<OrganizationDocument>>;
  let visitorMessageService: jest.Mocked<VisitorMessageService>;
  let rateLimitService: jest.Mocked<VisitorRateLimitService>;

  const mockOrganization = {
    _id: { toString: () => 'org123' },
    name: 'Test Company',
    slug: 'test-company',
    isActive: true,
  };

  const createMockSocket = (auth: any = {}): VisitorSocket => {
    const socket = {
      id: 'socket123',
      handshake: {
        auth,
        headers: { origin: 'https://example.com' },
        address: '127.0.0.1',
      },
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as VisitorSocket;
    return socket;
  };

  beforeEach(async () => {
    const mockModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn() }),
    };

    const mockVisitorMessageService = {
      getExistingConversation: jest.fn(),
      processVisitorMessage: jest.fn(),
      updateVisitorInfo: jest.fn(),
    };

    const mockRateLimitService = {
      checkConnectionLimit: jest.fn().mockResolvedValue(true),
      checkMessageLimit: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitorGateway,
        { provide: getModelToken(Organization.name), useValue: mockModel },
        { provide: VisitorMessageService, useValue: mockVisitorMessageService },
        { provide: VisitorRateLimitService, useValue: mockRateLimitService },
      ],
    }).compile();

    gateway = module.get<VisitorGateway>(VisitorGateway);
    organizationModel = module.get(getModelToken(Organization.name));
    visitorMessageService = module.get(VisitorMessageService);
    rateLimitService = module.get(VisitorRateLimitService);

    // Mock the server
    gateway.server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    } as any;
  });

  describe('handleConnection', () => {
    it('should reject connection if rate limited', async () => {
      rateLimitService.checkConnectionLimit.mockResolvedValue(false);
      const socket = createMockSocket({
        sessionId: 'session123',
        organizationId: 'org123',
      });

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', {
        code: 'RATE_LIMITED',
        message: 'Too many connections. Please try again later.',
      });
      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should reject connection if sessionId is missing', async () => {
      const socket = createMockSocket({ organizationId: 'org123' });

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', {
        code: 'AUTH_REQUIRED',
        message: 'Session ID and Organization ID required',
      });
      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should reject connection if organizationId is missing', async () => {
      const socket = createMockSocket({ sessionId: 'session123' });

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', {
        code: 'AUTH_REQUIRED',
        message: 'Session ID and Organization ID required',
      });
      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should reject connection if organization not found', async () => {
      (organizationModel.findOne as jest.Mock).mockResolvedValue(null);
      const socket = createMockSocket({
        sessionId: 'session123',
        organizationId: 'org123',
      });

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', {
        code: 'ORG_NOT_FOUND',
        message: 'Organization not found',
      });
      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should accept valid connection and join rooms', async () => {
      (organizationModel.findOne as jest.Mock).mockResolvedValue(mockOrganization);
      visitorMessageService.getExistingConversation.mockResolvedValue(null);
      const socket = createMockSocket({
        sessionId: 'session123',
        organizationId: 'org123',
        name: 'John',
      });

      await gateway.handleConnection(socket);

      expect(socket.join).toHaveBeenCalledWith('visitor:session123');
      expect(socket.join).toHaveBeenCalledWith('org:org123:visitors');
      expect(socket.emit).toHaveBeenCalledWith('connected', {
        sessionId: 'session123',
        organizationId: 'org123',
      });
      expect(socket.sessionId).toBe('session123');
      expect(socket.organizationId).toBe('org123');
      expect(socket.visitorName).toBe('John');
    });

    it('should restore existing conversation on connect', async () => {
      (organizationModel.findOne as jest.Mock).mockResolvedValue(mockOrganization);
      const existingConversation = {
        _id: 'conv123',
        messages: [{ _id: 'msg1', text: 'Hello' }],
      } as any;
      visitorMessageService.getExistingConversation.mockResolvedValue(
        existingConversation,
      );
      const socket = createMockSocket({
        sessionId: 'session123',
        organizationId: 'org123',
      });

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('conversation:restored', {
        conversationId: 'conv123',
        messages: [{ _id: 'msg1', text: 'Hello' }],
      });
    });
  });

  describe('handleMessageSend', () => {
    it('should reject if not authenticated', async () => {
      const socket = createMockSocket();

      await gateway.handleMessageSend(socket, { text: 'Hello' });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        code: 'NOT_AUTHENTICATED',
      });
    });

    it('should reject if message rate limited', async () => {
      rateLimitService.checkMessageLimit.mockResolvedValue(false);
      const socket = createMockSocket();
      socket.sessionId = 'session123';
      socket.organizationId = 'org123';

      await gateway.handleMessageSend(socket, { text: 'Hello' });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        code: 'MESSAGE_RATE_LIMITED',
        message: 'Too many messages. Please slow down.',
      });
    });

    it('should process message and emit confirmation', async () => {
      const socket = createMockSocket();
      socket.sessionId = 'session123';
      socket.organizationId = 'org123';
      socket.visitorName = 'John';

      visitorMessageService.processVisitorMessage.mockResolvedValue({
        messageId: 'msg123',
        conversationId: 'conv123',
        timestamp: new Date('2024-01-01'),
      });

      await gateway.handleMessageSend(socket, { text: 'Hello' });

      expect(visitorMessageService.processVisitorMessage).toHaveBeenCalledWith({
        sessionId: 'session123',
        organizationId: 'org123',
        visitorName: 'John',
        visitorEmail: undefined,
        text: 'Hello',
        type: undefined,
        mediaUrl: undefined,
        fileName: undefined,
      });
      expect(socket.emit).toHaveBeenCalledWith('message:sent', {
        messageId: 'msg123',
        conversationId: 'conv123',
        timestamp: new Date('2024-01-01'),
      });
    });
  });

  describe('handleTypingStart', () => {
    it('should emit typing event to org agents', () => {
      const socket = createMockSocket();
      socket.sessionId = 'session123';
      socket.organizationId = 'org123';

      gateway.handleTypingStart(socket);

      expect(gateway.server.to).toHaveBeenCalledWith('org:org123:agents');
      expect(gateway.server.emit).toHaveBeenCalledWith('visitor:typing', {
        sessionId: 'session123',
        isTyping: true,
      });
    });

    it('should not emit if not authenticated', () => {
      const socket = createMockSocket();

      gateway.handleTypingStart(socket);

      expect(gateway.server.to).not.toHaveBeenCalled();
    });
  });

  describe('handlePreChatSubmit', () => {
    it('should update visitor info', async () => {
      const socket = createMockSocket();
      socket.sessionId = 'session123';
      socket.organizationId = 'org123';

      await gateway.handlePreChatSubmit(socket, {
        name: 'John',
        email: 'john@example.com',
        phone: '123456',
      });

      expect(visitorMessageService.updateVisitorInfo).toHaveBeenCalledWith(
        'org123',
        'session123',
        { name: 'John', email: 'john@example.com', phone: '123456' },
      );
      expect(socket.emit).toHaveBeenCalledWith('pre-chat:saved');
      expect(socket.visitorName).toBe('John');
      expect(socket.visitorEmail).toBe('john@example.com');
    });
  });

  describe('emitToVisitor', () => {
    it('should emit to visitor room', () => {
      gateway.emitToVisitor('session123', 'message:new', { text: 'Hello' });

      expect(gateway.server.to).toHaveBeenCalledWith('visitor:session123');
      expect(gateway.server.emit).toHaveBeenCalledWith('message:new', {
        text: 'Hello',
      });
    });
  });

  describe('emitToOrgVisitors', () => {
    it('should emit to org visitors room', () => {
      gateway.emitToOrgVisitors('org123', 'org:offline', {});

      expect(gateway.server.to).toHaveBeenCalledWith('org:org123:visitors');
      expect(gateway.server.emit).toHaveBeenCalledWith('org:offline', {});
    });
  });
});
