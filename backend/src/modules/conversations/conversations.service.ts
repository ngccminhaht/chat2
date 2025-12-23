import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageDocument,
} from '@/common/database/schemas/message.schema';
import { User, UserDocument } from '@/common/database/schemas/user.schema';
import { GetConversationsDto } from './dto/get-conversations.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  /**
   * Find all conversations for an organization
   * IMPORTANT: organizationId is REQUIRED for tenant isolation
   */
  async findAll(organizationId: string, dto: GetConversationsDto) {
    const { status, platform, assignedTo, search, page = 1, limit = 20 } = dto;

    // CRITICAL: Always filter by organizationId
    const filter: any = {
      organizationId: new Types.ObjectId(organizationId),
    };

    if (status) {
      filter.status = status;
    }

    if (platform) {
      filter.platform = platform;
    }

    if (assignedTo) {
      filter.assignedTo = new Types.ObjectId(assignedTo);
    }

    if (search) {
      // Search in customer name or last message text
      filter.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { 'lastMessage.text': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      this.conversationModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assignedTo', 'name email avatarUrl')
        .lean()
        .exec(),
      this.conversationModel.countDocuments(filter).exec(),
    ]);

    return {
      data: conversations,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find a conversation by ID with org check
   */
  async findOne(organizationId: string, id: string) {
    const conversation = await this.conversationModel
      .findOne({
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      })
      .populate('assignedTo', 'name email avatarUrl')
      .lean()
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  /**
   * Update conversation (status, assignedTo, tags) with org check
   */
  async update(organizationId: string, id: string, dto: UpdateConversationDto) {
    // Validate assignedTo user exists and belongs to same org
    if (dto.assignedTo) {
      const user = await this.userModel
        .findOne({
          _id: new Types.ObjectId(dto.assignedTo),
          organizationId: new Types.ObjectId(organizationId),
        })
        .lean()
        .exec();

      if (!user) {
        throw new BadRequestException(
          'Assigned user not found or not in same organization',
        );
      }
    }

    const updateData: any = {};
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.tags !== undefined) updateData.tags = dto.tags;
    if (dto.aiEnabled !== undefined) updateData.aiEnabled = dto.aiEnabled;
    if (dto.assignedTo !== undefined) {
      updateData.assignedTo = dto.assignedTo
        ? new Types.ObjectId(dto.assignedTo)
        : null;
    }

    const conversation = await this.conversationModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          organizationId: new Types.ObjectId(organizationId),
        },
        updateData,
        { new: true },
      )
      .populate('assignedTo', 'name email avatarUrl')
      .lean()
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    this.logger.log(`Updated conversation ${id}: ${JSON.stringify(dto)}`);
    return conversation;
  }

  /**
   * Update unread count (internal use, no org check needed as conversationId is trusted)
   */
  async updateUnreadCount(conversationId: string, count: number) {
    return this.conversationModel
      .findByIdAndUpdate(conversationId, { unreadCount: count }, { new: true })
      .exec();
  }

  /**
   * Update last message (internal use)
   */
  async updateLastMessage(conversationId: string, message: any) {
    return this.conversationModel
      .findByIdAndUpdate(
        conversationId,
        {
          lastMessage: {
            text: message.content.text || `[${message.type}]`,
            timestamp: message.createdAt,
            senderId: message.sender.platformUserId,
            messageId: message._id,
          },
        },
        { new: true },
      )
      .exec();
  }

  /**
   * Remove a conversation with org check
   */
  async remove(organizationId: string, id: string) {
    // Delete conversation with org check
    const conversation = await this.conversationModel
      .findOneAndDelete({
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      })
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Delete all messages in this conversation
    const deleteResult = await this.messageModel
      .deleteMany({
        conversationId: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      })
      .exec();

    this.logger.log(
      `Deleted conversation ${id} and ${deleteResult.deletedCount} messages`,
    );

    return {
      success: true,
      deletedConversation: conversation._id,
      deletedMessages: deleteResult.deletedCount,
    };
  }

  /**
   * Remove all conversations for an organization (admin only)
   */
  async removeAll(organizationId: string) {
    // Delete all conversations for this org
    const conversationResult = await this.conversationModel
      .deleteMany({ organizationId: new Types.ObjectId(organizationId) })
      .exec();

    // Delete all messages for this org
    const messageResult = await this.messageModel
      .deleteMany({ organizationId: new Types.ObjectId(organizationId) })
      .exec();

    this.logger.warn(
      `Deleted ALL data for org ${organizationId}: ${conversationResult.deletedCount} conversations and ${messageResult.deletedCount} messages`,
    );

    return {
      success: true,
      deletedConversations: conversationResult.deletedCount,
      deletedMessages: messageResult.deletedCount,
    };
  }
}
