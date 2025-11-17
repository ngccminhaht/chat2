import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from '@/common/database/schemas/conversation.schema';
import { Message, MessageDocument } from '@/common/database/schemas/message.schema';
import { GetConversationsDto } from './dto/get-conversations.dto';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
  ) {}

  async findAll(dto: GetConversationsDto) {
    const { status, platform, assignedTo, search, page = 1, limit = 20 } = dto;

    const filter: any = {};

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
      // Search in participant names or last message text
      filter.$or = [
        { 'participants.name': { $regex: search, $options: 'i' } },
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
        .populate('assignedTo', 'name email avatar')
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

  async findOne(id: string) {
    const conversation = await this.conversationModel
      .findById(id)
      .populate('assignedTo', 'name email avatar')
      .lean()
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async updateUnreadCount(conversationId: string, count: number) {
    return this.conversationModel
      .findByIdAndUpdate(
        conversationId,
        { unreadCount: count },
        { new: true },
      )
      .exec();
  }

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

  async remove(id: string) {
    // Delete conversation
    const conversation = await this.conversationModel.findByIdAndDelete(id).exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Delete all messages in this conversation
    const deleteResult = await this.messageModel
      .deleteMany({ conversationId: new Types.ObjectId(id) })
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

  async removeAll() {
    // Delete all conversations
    const conversationResult = await this.conversationModel.deleteMany({}).exec();

    // Delete all messages
    const messageResult = await this.messageModel.deleteMany({}).exec();

    this.logger.warn(
      `Deleted ALL data: ${conversationResult.deletedCount} conversations and ${messageResult.deletedCount} messages`,
    );

    return {
      success: true,
      deletedConversations: conversationResult.deletedCount,
      deletedMessages: messageResult.deletedCount,
    };
  }
}
