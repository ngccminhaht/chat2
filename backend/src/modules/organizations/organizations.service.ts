import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Organization,
  OrganizationDocument,
  OrganizationMember,
  OrganizationMemberDocument,
  OrganizationRole,
} from '@/common/database/schemas';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  InviteMemberDto,
  UpdateAIAgentDto,
} from './dto';
import { AIAgentSettings } from '@/common/database/schemas/organization.schema';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private organizationModel: Model<OrganizationDocument>,
    @InjectModel(OrganizationMember.name)
    private memberModel: Model<OrganizationMemberDocument>,
  ) {}

  /**
   * Create a new organization with the creator as owner
   */
  async create(
    dto: CreateOrganizationDto,
    ownerId: string,
  ): Promise<OrganizationDocument> {
    // Check slug uniqueness
    const existing = await this.organizationModel.findOne({ slug: dto.slug });
    if (existing) {
      throw new ConflictException('Organization slug already exists');
    }

    // Create organization
    const org = await this.organizationModel.create({
      ...dto,
      owner: new Types.ObjectId(ownerId),
    });

    // Add owner as member with OWNER role
    await this.memberModel.create({
      organizationId: org._id,
      userId: new Types.ObjectId(ownerId),
      role: OrganizationRole.OWNER,
      joinedAt: new Date(),
    });

    return org;
  }

  /**
   * Find organization by ID
   */
  async findById(id: string): Promise<OrganizationDocument> {
    const org = await this.organizationModel.findById(id);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  /**
   * Find organization by slug (for widget config)
   */
  async findBySlug(slug: string): Promise<OrganizationDocument> {
    const org = await this.organizationModel.findOne({ slug, isActive: true });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  /**
   * Update organization
   */
  async update(
    id: string,
    dto: UpdateOrganizationDto,
    userId: string,
  ): Promise<OrganizationDocument> {
    await this.assertRole(id, userId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);

    const org = await this.organizationModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true },
    );
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  /**
   * Get all organizations for a user
   */
  async findByUser(userId: string): Promise<
    Array<{
      organization: OrganizationDocument;
      role: OrganizationRole;
    }>
  > {
    const memberships = await this.memberModel
      .find({
        userId: new Types.ObjectId(userId),
        isActive: true,
      })
      .populate('organizationId');

    return memberships
      .filter((m) => m.organizationId) // Filter out null refs
      .map((m) => ({
        organization: m.organizationId as unknown as OrganizationDocument,
        role: m.role,
      }));
  }

  /**
   * Get user's role in an organization
   */
  async getUserRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole | null> {
    const member = await this.memberModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(userId),
      isActive: true,
    });
    return member?.role ?? null;
  }

  /**
   * Check if user has required role in organization
   */
  async assertRole(
    organizationId: string,
    userId: string,
    allowedRoles: OrganizationRole[],
  ): Promise<OrganizationRole> {
    const role = await this.getUserRole(organizationId, userId);
    if (!role || !allowedRoles.includes(role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return role;
  }

  /**
   * Invite a user to organization by email
   */
  async inviteMember(
    organizationId: string,
    dto: InviteMemberDto,
    inviterId: string,
    targetUserId: string,
  ): Promise<OrganizationMemberDocument> {
    // Check inviter has permission
    await this.assertRole(organizationId, inviterId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);

    // Can't invite as owner
    if (dto.role === OrganizationRole.OWNER) {
      throw new ForbiddenException('Cannot invite as owner');
    }

    // Check if already a member
    const existing = await this.memberModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(targetUserId),
    });

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException('User is already a member');
      }
      // Reactivate membership
      existing.isActive = true;
      existing.role = dto.role;
      existing.invitedBy = new Types.ObjectId(inviterId);
      existing.invitedAt = new Date();
      existing.joinedAt = new Date();
      return existing.save();
    }

    // Create new membership
    return this.memberModel.create({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(targetUserId),
      role: dto.role,
      invitedBy: new Types.ObjectId(inviterId),
      invitedAt: new Date(),
      joinedAt: new Date(),
    });
  }

  /**
   * Remove a member from organization
   */
  async removeMember(
    organizationId: string,
    targetUserId: string,
    removerId: string,
  ): Promise<void> {
    // Check remover has permission
    await this.assertRole(organizationId, removerId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);

    // Can't remove owner
    const org = await this.findById(organizationId);
    if (org.owner.toString() === targetUserId) {
      throw new ForbiddenException('Cannot remove organization owner');
    }

    // Soft delete
    await this.memberModel.updateOne(
      {
        organizationId: new Types.ObjectId(organizationId),
        userId: new Types.ObjectId(targetUserId),
      },
      { $set: { isActive: false } },
    );
  }

  /**
   * Get all members of an organization
   */
  async getMembers(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMemberDocument[]> {
    // Check user is a member
    await this.assertRole(organizationId, userId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
      OrganizationRole.AGENT,
      OrganizationRole.VIEWER,
    ]);

    return this.memberModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        isActive: true,
      })
      .populate('userId', 'name email avatarUrl');
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    organizationId: string,
    targetUserId: string,
    newRole: OrganizationRole,
    updaterId: string,
  ): Promise<OrganizationMemberDocument> {
    // Only owner can change roles
    await this.assertRole(organizationId, updaterId, [OrganizationRole.OWNER]);

    // Can't change owner role
    if (newRole === OrganizationRole.OWNER) {
      throw new ForbiddenException('Cannot assign owner role');
    }

    const org = await this.findById(organizationId);
    if (org.owner.toString() === targetUserId) {
      throw new ForbiddenException('Cannot change owner role');
    }

    const member = await this.memberModel.findOneAndUpdate(
      {
        organizationId: new Types.ObjectId(organizationId),
        userId: new Types.ObjectId(targetUserId),
        isActive: true,
      },
      { $set: { role: newRole } },
      { new: true },
    );

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return member;
  }

  /**
   * Get AI agent settings for an organization
   */
  async getAIAgentSettings(id: string): Promise<AIAgentSettings> {
    const org = await this.findById(id);
    return org.aiAgentSettings || { enabled: false };
  }

  /**
   * Update AI agent settings for an organization (merge partial updates)
   */
  async updateAIAgentSettings(
    id: string,
    dto: UpdateAIAgentDto,
  ): Promise<AIAgentSettings> {
    // Build update object with dot notation for partial merge
    const updateFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        updateFields[`aiAgentSettings.${key}`] = value;
      }
    }

    const org = await this.organizationModel.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true },
    );

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org.aiAgentSettings;
  }
}
