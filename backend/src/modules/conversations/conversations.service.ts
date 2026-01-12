import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  Conversation,
  ConversationDocument,
} from "@/common/database/schemas/conversation.schema";
import {
  Message,
  MessageDocument,
} from "@/common/database/schemas/message.schema";
import {
  ConversationNote,
  ConversationNoteDocument,
} from "@/common/database/schemas/conversation-note.schema";
import { GetConversationsDto } from "./dto/get-conversations.dto";
import { UpdateConversationDto } from "./dto/update-conversation.dto";
import { CreateConversationNoteDto } from "./dto/create-conversation-note.dto";
import { UpdateConversationNoteDto } from "./dto/update-conversation-note.dto";
import { OrganizationsService } from "../organizations/organizations.service";
import { OrganizationRole } from "@/common/database/schemas";

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(ConversationNote.name)
    private conversationNoteModel: Model<ConversationNoteDocument>,
    private organizationsService: OrganizationsService
  ) {}

  /**
   * Find all conversations for an organization
   * IMPORTANT: organizationId is REQUIRED for tenant isolation
   */
  async findAll(organizationId: string, dto: GetConversationsDto) {
    const { status, platform, search, page = 1, limit = 20 } = dto;

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

    if (search) {
      // Search in customer name or last message text
      filter.$or = [
        { customerName: { $regex: search, $options: "i" } },
        { "lastMessage.text": { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      this.conversationModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
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
      .lean()
      .exec();

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    return conversation;
  }

  /**
   * Update conversation (status, tags, aiEnabled) with org check
   */
  async update(organizationId: string, id: string, dto: UpdateConversationDto) {
    const updateData: any = {};
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.tags !== undefined) updateData.tags = dto.tags;
    if (dto.aiEnabled !== undefined) updateData.aiEnabled = dto.aiEnabled;

    const conversation = await this.conversationModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          organizationId: new Types.ObjectId(organizationId),
        },
        updateData,
        { new: true }
      )
      .lean()
      .exec();

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
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
        { new: true }
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
      throw new NotFoundException("Conversation not found");
    }

    // Delete all messages in this conversation
    const deleteResult = await this.messageModel
      .deleteMany({
        conversationId: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      })
      .exec();

    this.logger.log(
      `Deleted conversation ${id} and ${deleteResult.deletedCount} messages`
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
      `Deleted ALL data for org ${organizationId}: ${conversationResult.deletedCount} conversations and ${messageResult.deletedCount} messages`
    );

    return {
      success: true,
      deletedConversations: conversationResult.deletedCount,
      deletedMessages: messageResult.deletedCount,
    };
  }

  /**
   * Get all notes for a conversation
   * Returns all notes if user is admin/owner, or only non-private notes + user's own notes
   */
  async getNotes(
    organizationId: string,
    conversationId: string,
    userId: string
  ) {
    // Verify conversation exists and belongs to org
    const conversation = await this.conversationModel
      .findOne({
        _id: new Types.ObjectId(conversationId),
        organizationId: new Types.ObjectId(organizationId),
      })
      .lean()
      .exec();

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    // Get user role
    const userRole = await this.organizationsService.getUserRole(
      organizationId,
      userId
    );
    const isAdminOrOwner =
      userRole === OrganizationRole.ADMIN ||
      userRole === OrganizationRole.OWNER;

    // Build query: if admin/owner, show all notes; otherwise show non-private + user's own
    const filter: any = {
      organizationId: new Types.ObjectId(organizationId),
      conversationId: new Types.ObjectId(conversationId),
    };

    if (!isAdminOrOwner) {
      filter.$or = [
        { isPrivate: false },
        { userId: new Types.ObjectId(userId) },
      ];
    }

    const notes = await this.conversationNoteModel
      .find(filter)
      .populate("userId", "name email avatarUrl")
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return notes;
  }

  /**
   * Create a new note for a conversation
   */
  async createNote(
    organizationId: string,
    conversationId: string,
    userId: string,
    dto: CreateConversationNoteDto
  ) {
    // Verify conversation exists and belongs to org
    const conversation = await this.conversationModel
      .findOne({
        _id: new Types.ObjectId(conversationId),
        organizationId: new Types.ObjectId(organizationId),
      })
      .lean()
      .exec();

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const note = new this.conversationNoteModel({
      organizationId: new Types.ObjectId(organizationId),
      conversationId: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(userId),
      content: dto.content,
      isPrivate: dto.isPrivate ?? false,
    });

    const savedNote = await note.save();
    await savedNote.populate("userId", "name email avatarUrl");

    this.logger.log(
      `Created note ${savedNote._id} for conversation ${conversationId}`
    );
    return savedNote;
  }

  /**
   * Update a note
   * Only the creator or admin/owner can update
   */
  async updateNote(
    organizationId: string,
    noteId: string,
    userId: string,
    dto: UpdateConversationNoteDto
  ) {
    const note = await this.conversationNoteModel
      .findOne({
        _id: new Types.ObjectId(noteId),
        organizationId: new Types.ObjectId(organizationId),
      })
      .exec();

    if (!note) {
      throw new NotFoundException("Note not found");
    }

    // Check permission: creator or admin/owner
    const isCreator = note.userId.toString() === userId.toString();
    const userRole = await this.organizationsService.getUserRole(
      organizationId,
      userId
    );
    const isAdminOrOwner =
      userRole === OrganizationRole.ADMIN ||
      userRole === OrganizationRole.OWNER;

    if (!isCreator && !isAdminOrOwner) {
      throw new ForbiddenException("You can only update your own notes");
    }

    if (dto.content !== undefined) note.content = dto.content;
    if (dto.isPrivate !== undefined) note.isPrivate = dto.isPrivate;

    const updatedNote = await note.save();
    await updatedNote.populate("userId", "name email avatarUrl");

    this.logger.log(`Updated note ${noteId}`);
    return updatedNote;
  }

  /**
   * Delete a note
   * Only the creator or admin/owner can delete
   */
  async deleteNote(organizationId: string, noteId: string, userId: string) {
    const note = await this.conversationNoteModel
      .findOne({
        _id: new Types.ObjectId(noteId),
        organizationId: new Types.ObjectId(organizationId),
      })
      .exec();

    if (!note) {
      throw new NotFoundException("Note not found");
    }

    // Check permission: creator or admin/owner
    const isCreator = note.userId.toString() === userId.toString();
    const userRole = await this.organizationsService.getUserRole(
      organizationId,
      userId
    );
    const isAdminOrOwner =
      userRole === OrganizationRole.ADMIN ||
      userRole === OrganizationRole.OWNER;

    if (!isCreator && !isAdminOrOwner) {
      throw new ForbiddenException("You can only delete your own notes");
    }

    await this.conversationNoteModel.findByIdAndDelete(noteId).exec();

    this.logger.log(`Deleted note ${noteId}`);
    return { success: true };
  }
}
