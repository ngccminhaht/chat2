import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards';
import { CurrentUser } from '@/common/decorators';
import { OrganizationsService } from './organizations.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  InviteMemberDto,
} from './dto';
import { UsersService } from '../users/users.service';
import { OrganizationRole } from '@/common/database/schemas';

// JWT payload interface
interface JwtPayload {
  sub: string; // userId
  email: string;
  organizationId?: string; // active org
}

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly usersService: UsersService,
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
}
