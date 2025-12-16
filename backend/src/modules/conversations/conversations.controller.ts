import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { GetConversationsDto } from './dto/get-conversations.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { JwtAuthGuard, TenantGuard } from '@/common/guards';
import { CurrentOrganization } from '@/common/decorators';

@Controller('conversations')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  findAll(
    @CurrentOrganization() organizationId: string,
    @Query() dto: GetConversationsDto,
  ) {
    return this.conversationsService.findAll(organizationId, dto);
  }

  @Get(':id')
  findOne(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.conversationsService.findOne(organizationId, id);
  }

  @Patch(':id')
  update(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(organizationId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.conversationsService.remove(organizationId, id);
  }

  @Delete()
  removeAll(@CurrentOrganization() organizationId: string) {
    return this.conversationsService.removeAll(organizationId);
  }
}
