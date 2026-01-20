import { Controller, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { ApiKeyAuthGuard } from '@/common/guards';
import { CurrentOrganization } from '@/common/decorators';

/**
 * External API Controller for Conversations
 * Uses API Key authentication instead of JWT
 * Organization is derived from API key, not URL
 */
@Controller('external/conversations')
@UseGuards(ApiKeyAuthGuard)
export class ExternalApiController {
  constructor(private readonly conversationsService: ConversationsService) {}

  /**
   * Update conversation (external API)
   * PATCH /api/external/conversations/:id
   *
   * Authentication: X-API-Key header
   * Organization is automatically determined from API key
   */
  @Patch(':id')
  update(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(organizationId, id, dto);
  }
}
