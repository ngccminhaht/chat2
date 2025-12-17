import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QuickReply, QuickReplyDocument } from './quick-reply.schema';
import { CreateQuickReplyDto } from './dto/create-quick-reply.dto';
import { UpdateQuickReplyDto } from './dto/update-quick-reply.dto';

@Injectable()
export class QuickRepliesService {
  constructor(
    @InjectModel(QuickReply.name) private quickReplyModel: Model<QuickReplyDocument>,
  ) {}

  /**
   * Create a new quick reply
   */
  async create(
    organizationId: string,
    userId: string,
    dto: CreateQuickReplyDto,
  ): Promise<QuickReply> {
    // Check if shortcut already exists in org
    const existing = await this.quickReplyModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      shortcut: dto.shortcut,
      isActive: true,
    });

    if (existing) {
      throw new ConflictException(`Shortcut "${dto.shortcut}" already exists`);
    }

    const quickReply = new this.quickReplyModel({
      organizationId: new Types.ObjectId(organizationId),
      userId: dto.isPersonal ? new Types.ObjectId(userId) : null,
      title: dto.title,
      shortcut: dto.shortcut,
      content: dto.content,
      tags: dto.tags || [],
    });

    return quickReply.save();
  }

  /**
   * Find all quick replies for an organization (including personal ones for the user)
   */
  async findAll(
    organizationId: string,
    userId: string,
    options: { search?: string; tag?: string; page?: number; limit?: number } = {},
  ) {
    const { search, tag, page = 1, limit = 50 } = options;

    const query: any = {
      organizationId: new Types.ObjectId(organizationId),
      isActive: true,
      $or: [
        { userId: null }, // Shared replies
        { userId: new Types.ObjectId(userId) }, // User's personal replies
      ],
    };

    // Add search filter
    if (search) {
      query.$text = { $search: search };
    }

    // Add tag filter
    if (tag) {
      query.tags = tag;
    }

    const [data, total] = await Promise.all([
      this.quickReplyModel
        .find(query)
        .sort({ usageCount: -1, title: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.quickReplyModel.countDocuments(query),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find a quick reply by shortcut
   */
  async findByShortcut(
    organizationId: string,
    userId: string,
    shortcut: string,
  ): Promise<QuickReply | null> {
    return this.quickReplyModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      shortcut,
      isActive: true,
      $or: [
        { userId: null },
        { userId: new Types.ObjectId(userId) },
      ],
    }).lean();
  }

  /**
   * Find a quick reply by ID
   */
  async findOne(organizationId: string, id: string): Promise<QuickReply> {
    const quickReply = await this.quickReplyModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    }).lean();

    if (!quickReply) {
      throw new NotFoundException('Quick reply not found');
    }

    return quickReply;
  }

  /**
   * Update a quick reply
   */
  async update(
    organizationId: string,
    id: string,
    dto: UpdateQuickReplyDto,
  ): Promise<QuickReply> {
    // Check for shortcut conflict if changing shortcut
    if (dto.shortcut) {
      const existing = await this.quickReplyModel.findOne({
        organizationId: new Types.ObjectId(organizationId),
        shortcut: dto.shortcut,
        _id: { $ne: new Types.ObjectId(id) },
        isActive: true,
      });

      if (existing) {
        throw new ConflictException(`Shortcut "${dto.shortcut}" already exists`);
      }
    }

    const quickReply = await this.quickReplyModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      },
      { $set: dto },
      { new: true },
    ).lean();

    if (!quickReply) {
      throw new NotFoundException('Quick reply not found');
    }

    return quickReply;
  }

  /**
   * Delete a quick reply (soft delete)
   */
  async remove(organizationId: string, id: string): Promise<void> {
    const result = await this.quickReplyModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      },
      { $set: { isActive: false } },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('Quick reply not found');
    }
  }

  /**
   * Increment usage count when a quick reply is used
   */
  async incrementUsage(organizationId: string, id: string): Promise<void> {
    await this.quickReplyModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      },
      { $inc: { usageCount: 1 } },
    );
  }
}
