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
   * Get organization info by API key
   * GET /api/external/organization
   *
   * Authentication: X-API-Key header
   * Organization is automatically determined from API key
   */
  @Get('organization')
  async getOrganization(@Req() req: any) {
    const org = req.organization;
    return {
      id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      description: org.description,
      plan: org.plan,
      settings: org.settings,
      isActive: org.isActive,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }

  /**
   * List platform connections for the organization
   * GET /api/external/connections
   *
   * Authentication: X-API-Key header
   * Organization is automatically determined from API key
   */
  @Get('connections')
  async getConnections(@CurrentOrganization() organizationId: string) {
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
