import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';
import {
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageDocument,
} from '@/common/database/schemas/message.schema';

@Injectable()
export class PlatformConnectionsService {
  private readonly logger = new Logger(PlatformConnectionsService.name);

  constructor(
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
  ) {}

  async findAllByUser(userId: string): Promise<any> {
    const connections = await this.platformConnectionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();

    // Transform _id to id for frontend compatibility
    return connections.map((conn) => {
      const doc: any = conn.toObject();
      return {
        id: conn._id.toString(),
        userId: conn.userId.toString(),
        platform: conn.platform,
        platformAccountId: conn.platformAccountId,
        platformAccountName: conn.platformAccountName,
        status: conn.status,
        credentials: conn.credentials,
        webhookSecret: conn.webhookSecret,
        metadata: conn.metadata,
        lastSyncAt: conn.lastSyncAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });
  }

  async findOne(id: string): Promise<PlatformConnectionDocument | null> {
    return this.platformConnectionModel.findById(id).exec();
  }

  async findByPlatform(
    userId: string,
    platform: string,
  ): Promise<PlatformConnectionDocument | null> {
    return this.platformConnectionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        platform,
      })
      .exec();
  }

  async delete(id: string): Promise<void> {
    this.logger.log(`Starting deletion of platform connection: ${id}`);

    // Find the platform connection first
    const platformConnection = await this.platformConnectionModel.findById(id).exec();

    if (!platformConnection) {
      this.logger.warn(`Platform connection ${id} not found`);
      return;
    }

    this.logger.log(`Found platform connection: ${platformConnection.platform} (${platformConnection.platformAccountName})`);

    // Find all conversations for this platform connection
    const conversations = await this.conversationModel
      .find({ platformConnectionId: new Types.ObjectId(id) })
      .exec();

    this.logger.log(`Found ${conversations.length} conversations to delete`);

    const conversationIds = conversations.map((conv) => conv._id);

    // Delete all messages in these conversations
    const messageDeleteResult = await this.messageModel
      .deleteMany({ conversationId: { $in: conversationIds } })
      .exec();

    this.logger.log(`Deleted ${messageDeleteResult.deletedCount} messages`);

    // Delete all conversations
    const conversationDeleteResult = await this.conversationModel
      .deleteMany({ platformConnectionId: new Types.ObjectId(id) })
      .exec();

    this.logger.log(`Deleted ${conversationDeleteResult.deletedCount} conversations`);

    // Delete the platform connection
    await this.platformConnectionModel.findByIdAndDelete(id).exec();

    this.logger.log(
      `Disconnected platform ${platformConnection.platform} (${platformConnection.platformAccountName}): ` +
      `Deleted ${conversationDeleteResult.deletedCount} conversations and ${messageDeleteResult.deletedCount} messages`,
    );
  }
}
