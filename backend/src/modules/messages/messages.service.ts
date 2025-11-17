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

        this.logger.log(`Sending Zalo message to user ${customer.platformUserId}`);

        // Helper function to refresh token
        const refreshAccessToken = async () => {
          this.logger.log('=== Starting token refresh ===');
          this.logger.log(`Refresh token exists: ${!!platformConnection.credentials.refreshToken}`);
          this.logger.log(`Refresh token length: ${platformConnection.credentials.refreshToken?.length}`);

          const tokenResponse = await this.zaloOAuthService.refreshToken(
            platformConnection.credentials.refreshToken,
          );

          this.logger.log('Token refresh response received');
          this.logger.log(`New access token length: ${tokenResponse.access_token?.length}`);
          this.logger.log(`New refresh token length: ${tokenResponse.refresh_token?.length}`);
          this.logger.log(`Expires in: ${tokenResponse.expires_in} seconds`);

          platformConnection.credentials.accessToken = tokenResponse.access_token;
          platformConnection.credentials.refreshToken = tokenResponse.refresh_token;
          platformConnection.credentials.expiresAt = new Date(
            Date.now() + tokenResponse.expires_in * 1000,
          );
          await platformConnection.save();

          this.logger.log('Platform connection updated and saved');
          this.logger.log('=== Token refresh completed ===');
          return tokenResponse.access_token;
        };

        // Check if access token will expire soon (within 5 minutes) and refresh proactively
        let accessToken = platformConnection.credentials.accessToken;
        const expiresAt = platformConnection.credentials.expiresAt;
        const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

        this.logger.log(`Current token expires at: ${expiresAt}`);
        this.logger.log(`Current time: ${new Date()}`);
        this.logger.log(`Time until expiry: ${expiresAt ? new Date(expiresAt).getTime() - new Date().getTime() : 'N/A'} ms`);

        if (expiresAt && new Date().getTime() >= new Date(expiresAt).getTime() - bufferTime) {
          this.logger.log('Token will expire soon, proactively refreshing...');
          try {
            accessToken = await refreshAccessToken();
          } catch (refreshError) {
            this.logger.error('Proactive token refresh failed:', refreshError);
            this.logger.error('Error details:', JSON.stringify(refreshError.response?.data || refreshError.message));
            // Continue with existing token, will retry if API call fails
          }
        } else {
          this.logger.log('Token is still valid, skipping proactive refresh');
        }

        // Try to send message, retry once with token refresh if it fails with invalid token
        let result;
        try {
          this.logger.log('Attempting to send message with current token...');
          result = await this.zaloOAuthService.sendTextMessage(
            accessToken,
            customer.platformUserId,
            content.text,
          );
          this.logger.log('Message sent successfully on first attempt');
        } catch (sendError) {
          this.logger.error('First send attempt failed');
          this.logger.error('Send error:', JSON.stringify(sendError.response?.data || sendError.message));

          // Check if error is due to invalid access token (Zalo error -216)
          const errorData = sendError.response?.data;
          this.logger.log(`Error code: ${errorData?.error}`);
          this.logger.log(`Error message: ${errorData?.message}`);

          if (errorData?.error === -216 || errorData?.message?.includes('Access token is invalid')) {
            this.logger.log('=== Detected invalid token error, refreshing and retrying ===');

            try {
              accessToken = await refreshAccessToken();

              this.logger.log('Retrying message send with new token...');
              // Retry sending with new token
              result = await this.zaloOAuthService.sendTextMessage(
                accessToken,
                customer.platformUserId,
                content.text,
              );
              this.logger.log('Message sent successfully on retry after token refresh');
            } catch (retryError) {
              this.logger.error('=== Retry after token refresh failed ===');
              this.logger.error('Retry error:', JSON.stringify(retryError.response?.data || retryError.message));
              throw new BadRequestException(
                'Failed to send message after refreshing token. Please reconnect your Zalo OA.',
              );
            }
          } else {
            this.logger.error('Error is not related to token, rethrowing');
            // Other error, rethrow
            throw sendError;
          }
        }

        // Update message with actual platform message ID and status
        message.platformMessageId = result.message_id;
        message.status = 'sent';
        await message.save();

        this.logger.log(`Message sent successfully: ${result.message_id}`);
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
