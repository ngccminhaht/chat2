import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentUser, RequestUser } from '@/common/decorators';
import { OrganizationsService } from './organizations.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  InviteMemberDto,
  UpdateAIAgentDto,
} from './dto';
import { UsersService } from '../users/users.service';
import { OrganizationRole } from '@/common/database/schemas';
import { WidgetService } from '../widget/widget.service';
import { UpdateWidgetConfigDto } from '../widget/dto/update-widget-config.dto';

// User payload interface (after KeycloakUserSyncGuard)
interface JwtPayload {
  sub: string; // MongoDB ObjectId (for backward compatibility)
  email: string;
  keycloakId?: string;
}

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly usersService: UsersService,
    private readonly widgetService: WidgetService,
  ) {}

  /**
   * Create a new organization
   * POST /api/organizations
   */
  @Post()
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const org = await this.organizationsService.create(dto, user.sub);
    return {
      id: org._id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
    };
  }

  /**
   * Get all organizations for current user
   * GET /api/organizations
   */
  @Get()
  async findMyOrganizations(@CurrentUser() user: JwtPayload) {
    const orgs = await this.organizationsService.findByUser(user.sub);
    return orgs.map(({ organization, role }) => ({
      id: organization._id,
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
      role,
      isActive: organization.isActive,
    }));
  }

  /**
   * Get organization by ID
   * GET /api/organizations/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    // Verify user is a member
    await this.organizationsService.assertRole(id, user.sub, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
      OrganizationRole.AGENT,
      OrganizationRole.VIEWER,
    ]);

    const org = await this.organizationsService.findById(id);
    const role = await this.organizationsService.getUserRole(id, user.sub);

    return {
      id: org._id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      settings: org.settings,
      widgetSettings: org.widgetSettings,
      role,
      isActive: org.isActive,
    };
  }

  /**
   * Update organization
   * PUT /api/organizations/:id
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const org = await this.organizationsService.update(id, dto, user.sub);
    return {
      id: org._id,
      name: org.name,
      slug: org.slug,
      settings: org.settings,
      widgetSettings: org.widgetSettings,
    };
  }

  /**
   * Get organization members
   * GET /api/organizations/:id/members
   */
  @Get(':id/members')
  async getMembers(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const members = await this.organizationsService.getMembers(id, user.sub);
    return members.map((m) => ({
      id: m._id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  /**
   * Invite a user to organization
   * POST /api/organizations/:id/members
   */
  @Post(':id/members')
  async inviteMember(
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // Find user by email
    const targetUser = await this.usersService.findByEmail(dto.email);

    const member = await this.organizationsService.inviteMember(
      id,
      dto,
      user.sub,
      targetUser._id.toString(),
    );

    return {
      id: member._id,
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt,
    };
  }

  /**
   * Update member role
   * PUT /api/organizations/:id/members/:userId
   */
  @Put(':id/members/:userId')
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body('role') role: OrganizationRole,
    @CurrentUser() user: JwtPayload,
  ) {
    const member = await this.organizationsService.updateMemberRole(
      id,
      targetUserId,
      role,
      user.sub,
    );

    return {
      id: member._id,
      userId: member.userId,
      role: member.role,
    };
  }

  /**
   * Remove member from organization
   * DELETE /api/organizations/:id/members/:userId
   */
  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.organizationsService.removeMember(id, targetUserId, user.sub);
  }

  /**
   * Get widget configuration for organization
   * GET /api/organizations/:id/widget
   */
  @Get(':id/widget')
  async getWidgetConfig(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.organizationsService.assertRole(id, user.sub, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
      OrganizationRole.AGENT,
      OrganizationRole.VIEWER,
    ]);
    return this.widgetService.getWidgetConfigByOrgId(id);
  }

  /**
   * Update widget configuration for organization
   * PATCH /api/organizations/:id/widget
   */
  @Patch(':id/widget')
  async updateWidgetConfig(
    @Param('id') id: string,
    @Body() dto: UpdateWidgetConfigDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.organizationsService.assertRole(id, user.sub, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
    return this.widgetService.updateWidgetConfig(id, dto);
  }

  /**
   * Get AI agent settings for organization
   * GET /api/organizations/:id/ai-agent
   */
  @Get(':id/ai-agent')
  async getAIAgentSettings(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.organizationsService.assertRole(id, user.sub, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
    return this.organizationsService.getAIAgentSettings(id);
  }

  /**
   * Update AI agent settings for organization
   * PATCH /api/organizations/:id/ai-agent
   */
  @Patch(':id/ai-agent')
  async updateAIAgentSettings(
    @Param('id') id: string,
    @Body() dto: UpdateAIAgentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.organizationsService.assertRole(id, user.sub, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
    return this.organizationsService.updateAIAgentSettings(id, dto);
  }

  /**
   * Get API key for organization
   * GET /api/organizations/:id/api-key
   */
  @Get(':id/api-key')
  async getApiKey(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.organizationsService.assertRole(id, user.sub, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
    return this.organizationsService.getApiKey(id);
  }

  /**
   * Generate or regenerate API key for organization
   * POST /api/organizations/:id/api-key
   */
  @Post(':id/api-key')
  async generateApiKey(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.organizationsService.assertRole(id, user.sub, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
    return this.organizationsService.generateApiKey(id);
  }

  /**
   * Revoke API key for organization
   * DELETE /api/organizations/:id/api-key
   */
  @Delete(':id/api-key')
  @HttpCode(HttpStatus.OK)
  async revokeApiKey(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.organizationsService.assertRole(id, user.sub, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
    return this.organizationsService.revokeApiKey(id);
  }
}
