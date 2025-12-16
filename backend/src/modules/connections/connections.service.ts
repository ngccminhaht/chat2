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
import { WebsocketGateway } from '@/modules/websocket/websocket.gateway';
import { ConnectionStatus } from '@/common/constants';

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    private websocketGateway: WebsocketGateway,
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
        connectedBy: conn.connectedBy?.toString(),
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

  async updateStatus(
    id: string,
    status: ConnectionStatus,
  ): Promise<PlatformConnectionDocument | null> {
    this.logger.log(`Updating platform connection ${id} status to ${status}`);

    const connection = await this.platformConnectionModel
      .findByIdAndUpdate(
        id,
        { status },
        { new: true }, // Return updated document
      )
      .exec();

    if (!connection) {
      this.logger.warn(`Platform connection ${id} not found`);
      return null;
    }

    this.logger.log(`✅ Updated connection status: ${connection.platformAccountName} → ${status}`);
    return connection;
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
    this.logger.log(`Platform connection ID: ${id}`);
    this.logger.log(`Platform Account ID: ${platformConnection.platformAccountId}`);

    // Find all conversations for this platform account (OA/Page ID)
    // Query by platform + platformAccountId field (indexed for performance)
    const conversations = await this.conversationModel
      .find({
        platform: platformConnection.platform,
        platformAccountId: platformConnection.platformAccountId,
      })
      .exec();

    this.logger.log(`Found ${conversations.length} conversations for ${platformConnection.platform} account ${platformConnection.platformAccountId}`);

    if (conversations.length > 0) {
      this.logger.log('Conversation IDs to delete:', conversations.map(c => c._id.toString()));
    }

    const conversationIds = conversations.map((conv) => conv._id);

    // Delete all messages in these conversations
    const messageDeleteResult = await this.messageModel
      .deleteMany({ conversationId: { $in: conversationIds } })
      .exec();

    this.logger.log(`Deleted ${messageDeleteResult.deletedCount} messages`);

    // Delete all conversations (use the conversationIds we found, not platformConnectionId)
    const conversationDeleteResult = await this.conversationModel
      .deleteMany({ _id: { $in: conversationIds } })
      .exec();

    this.logger.log(`Deleted ${conversationDeleteResult.deletedCount} conversations`);

    // Delete the platform connection
    await this.platformConnectionModel.findByIdAndDelete(id).exec();

    this.logger.log(
      `Disconnected platform ${platformConnection.platform} (${platformConnection.platformAccountName}): ` +
      `Deleted ${conversationDeleteResult.deletedCount} conversations and ${messageDeleteResult.deletedCount} messages`,
    );

    // Emit WebSocket event to notify all clients to refresh conversations
    // Emit to all connected clients (they will filter by their own organizationId on the frontend)
    this.websocketGateway.server.emit('connection:deleted', {
      connectionId: id,
      platform: platformConnection.platform,
      deletedConversationIds: conversationIds.map(id => id.toString()),
    });

    this.logger.log(`📤 Emitted connection:deleted event for connection ${id}`);
  }
}
