import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Delete,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { GetConversationsDto } from './dto/get-conversations.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Controller('organizations/:organizationId/conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  findAll(
    @Param('organizationId') organizationId: string,
    @Query() dto: GetConversationsDto,
  ) {
    return this.conversationsService.findAll(organizationId, dto);
  }

  @Get(':id')
  findOne(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.conversationsService.findOne(organizationId, id);
  }

  @Patch(':id')
  update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(organizationId, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.conversationsService.remove(organizationId, id);
  }

  @Delete()
  removeAll(@Param('organizationId') organizationId: string) {
    return this.conversationsService.removeAll(organizationId);
  }
}
