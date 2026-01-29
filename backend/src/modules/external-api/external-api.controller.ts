import { Controller, Get, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import { Unprotected } from 'nest-keycloak-connect';
import { ApiKeyAuthGuard } from '@/common/guards';
import { CurrentOrganization } from '@/common/decorators';
import { ConnectionsService } from '@/modules/connections/connections.service';
import { ConversationsService } from '@/modules/conversations/conversations.service';
import { UpdateConversationDto } from '@/modules/conversations/dto/update-conversation.dto';

/**
 * External API Controller
 * Uses API Key authentication instead of JWT
 * Organization is derived from API key, not URL
 */
@Controller('external')
@Unprotected() // Skip Keycloak global guards
@UseGuards(ApiKeyAuthGuard) // Use API key auth instead
export class ExternalApiController {
  constructor(
    private readonly connectionsService: ConnectionsService,
    private readonly conversationsService: ConversationsService,
  ) {}

  /**
   * List all organizations accessible by API key
   * GET /api/external/organizations
   *
   * Authentication: X-API-Key header
   * Returns array of organizations (currently only the one associated with API key)
   */
  @Get('organizations')
  async getOrganizations(@Req() req: any) {
    const org = req.organization;
    return [
      {
        id: org._id.toString(),
        name: org.name,
        slug: org.slug,
        description: org.description,
        plan: org.plan,
        settings: org.settings,
        isActive: org.isActive,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      },
    ];
  }

  /**
   * List platform connections for a specific organization
   * GET /api/external/organizations/:id/connections
   *
   * Authentication: X-API-Key header
   */
  @Get('organizations/:id/connections')
  async getConnections(
    @Param('id') organizationId: string,
    @Req() req: any,
  ) {
    // Verify user has access to this organization (must match API key's org)
    if (req.organization._id.toString() !== organizationId) {
      return [];
    }
    return this.connectionsService.findAllByOrganization(organizationId);
  }

  /**
   * Update conversation (external API)
   * PATCH /api/external/conversations/:id
   *
   * Authentication: X-API-Key header
   * Organization is automatically determined from API key
   */
  @Patch('conversations/:id')
  updateConversation(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(organizationId, id, dto);
  }
}
