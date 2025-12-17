import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiAgent, AiAgentDocument, AiAgentStatus } from './ai-agent.schema';
import { CreateAiAgentDto } from './dto/create-ai-agent.dto';
import { UpdateAiAgentDto } from './dto/update-ai-agent.dto';

@Injectable()
export class AiAgentsService {
  constructor(
    @InjectModel(AiAgent.name) private aiAgentModel: Model<AiAgentDocument>,
  ) {}

  /**
   * Create a new AI agent
   */
  async create(organizationId: string, dto: CreateAiAgentDto): Promise<AiAgent> {
    const aiAgent = new this.aiAgentModel({
      organizationId: new Types.ObjectId(organizationId),
      ...dto,
      settings: {
        temperature: 0.7,
        maxTokens: 1000,
        responseDelay: 1000,
        ...dto.settings,
      },
    });

    return aiAgent.save();
  }

  /**
   * Find all AI agents for an organization
   */
  async findAll(
    organizationId: string,
    options: { status?: AiAgentStatus; page?: number; limit?: number } = {},
  ) {
    const { status, page = 1, limit = 20 } = options;

    const query: any = {
      organizationId: new Types.ObjectId(organizationId),
    };

    if (status) {
      query.status = status;
    }

    const [data, total] = await Promise.all([
      this.aiAgentModel
        .find(query)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.aiAgentModel.countDocuments(query),
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
   * Find active AI agents for assignment dropdown
   */
  async findActiveAgents(organizationId: string): Promise<AiAgent[]> {
    return this.aiAgentModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        status: AiAgentStatus.ACTIVE,
      })
      .select('_id name avatar description')
      .lean();
  }

  /**
   * Find one AI agent by ID
   */
  async findOne(organizationId: string, id: string): Promise<AiAgent> {
    const aiAgent = await this.aiAgentModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    }).lean();

    if (!aiAgent) {
      throw new NotFoundException('AI Agent not found');
    }

    return aiAgent;
  }

  /**
   * Update an AI agent
   */
  async update(
    organizationId: string,
    id: string,
    dto: UpdateAiAgentDto,
  ): Promise<AiAgent> {
    const aiAgent = await this.aiAgentModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      },
      { $set: dto },
      { new: true },
    ).lean();

    if (!aiAgent) {
      throw new NotFoundException('AI Agent not found');
    }

    return aiAgent;
  }

  /**
   * Delete an AI agent
   */
  async remove(organizationId: string, id: string): Promise<void> {
    const result = await this.aiAgentModel.deleteOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('AI Agent not found');
    }
  }

  /**
   * Increment stats when AI handles messages (called by external AI platform)
   */
  async incrementStats(aiAgentId: string, messageCount: number = 1): Promise<void> {
    await this.aiAgentModel.updateOne(
      { _id: new Types.ObjectId(aiAgentId) },
      {
        $inc: { totalMessages: messageCount },
        $set: { lastActiveAt: new Date() },
      },
    );
  }

  /**
   * Increment conversation count when AI starts handling a conversation
   */
  async incrementConversationCount(aiAgentId: string): Promise<void> {
    await this.aiAgentModel.updateOne(
      { _id: new Types.ObjectId(aiAgentId) },
      { $inc: { totalConversations: 1 } },
    );
  }
}
