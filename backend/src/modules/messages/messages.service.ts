import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from '@/common/database/schemas/message.schema';
import { Conversation, ConversationDocument } from '@/common/database/schemas/conversation.schema';
import { PlatformConnection, PlatformConnectionDocument } from '@/common/database/schemas/platform-connection.schema';
import { GetMessagesDto } from './dto/get-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ZaloOAuthService } from '@/modules/platform-connections/zalo-oauth.service';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
    private zaloOAuthService: ZaloOAuthService,
  ) {}

  async findByConversation(
    conversationId: string,
    dto: GetMessagesDto,
  ) {
    const { page = 1, limit = 50 } = dto;

    // Verify conversation exists
    const conversation = await this.conversationModel
      .findById(conversationId)
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({ conversationId: new Types.ObjectId(conversationId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.messageModel
        .countDocuments({ conversationId: new Types.ObjectId(conversationId) })
        .exec(),
    ]);

    // Reverse to show oldest first
    return {
      data: messages.reverse(),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async send(userId: string, dto: SendMessageDto) {
    const { conversationId, type, content } = dto;

    // Verify conversation exists
    const conversation = await this.conversationModel
      .findById(conversationId)
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Find customer info from participants (recipient of message)
    const customer = conversation.participants.find((p) => p.role === 'customer');
    if (!customer) {
      throw new BadRequestException('No customer found in conversation');
    }

    // Get platform connection for access token (optional for now)
    const platformConnection = await this.platformConnectionModel
      .findById(conversation.platformConnectionId)
      .exec();

    if (!platformConnection) {
      throw new NotFoundException('Platform connection not found');
    }

    // Get sender info - prefer agent from conversation participants
    const agent = conversation.participants.find((p) => p.role === 'agent');
    const senderInfo = {
      platformUserId: agent?.platformUserId || platformConnection.platformAccountId || 'system',
      name: agent?.name || platformConnection.platformAccountName || 'Agent',
      avatar: agent?.avatar || platformConnection.metadata?.avatar,
    };

    // Create message with pending status
    const message = await this.messageModel.create({
      conversationId: new Types.ObjectId(conversationId),
      platform: conversation.platform,
      platformMessageId: `temp_${Date.now()}_${Math.random()}`, // Will be updated after platform API call
      direction: 'outbound',
      type,
      content,
      sender: senderInfo,
      status: 'pending',
      metadata: {
        sentByUserId: userId,
      },
    });

    try {
      // Send message to platform
      if (conversation.platform === 'zalo') {
        if (type !== 'text') {
          throw new BadRequestException('Only text messages are supported for Zalo');
        }

        this.logger.log('=== Sending Zalo message ===');
        this.logger.log(`  Recipient platformUserId: ${customer.platformUserId}`);
        this.logger.log(`  Platform connection: ${platformConnection._id}`);
        this.logger.log(`  Message content: ${content.text?.substring(0, 50)}...`);

        // Use wrapper method that automatically refreshes token if needed
        const result = await this.zaloOAuthService.sendTextMessageWithRefresh(
          platformConnection,
          customer.platformUserId,
          content.text,
        );

        // Update message with actual platform message ID and status
        message.platformMessageId = result.message_id;
        message.status = 'sent';
        await message.save();

        // Update conversation's last message
        await this.conversationModel.findByIdAndUpdate(conversationId, {
          lastMessage: {
            text: content.text,
            timestamp: new Date(),
            senderId: platformConnection.platformAccountId,
            messageId: message._id,
          },
        });

        this.logger.log(`✅ Message sent successfully: ${result.message_id}`);
      } else {
        throw new BadRequestException(`Platform ${conversation.platform} not supported yet`);
      }
    } catch (error) {
      this.logger.error('Failed to send message to platform:', error);

      // Update message status to failed
      message.status = 'failed';
      message.metadata = {
        ...message.metadata,
        error: error.message,
      };
      await message.save();

      throw error;
    }

    // TODO: Publish to Kafka topic 'websocket.notifications' for real-time update

    return message;
  }

  async updateStatus(messageId: string, status: string) {
    return this.messageModel
      .findByIdAndUpdate(messageId, { status }, { new: true })
      .exec();
  }

  async updatePlatformMessageId(messageId: string, platformMessageId: string) {
    return this.messageModel
      .findByIdAndUpdate(messageId, { platformMessageId }, { new: true })
      .exec();
  }
}
