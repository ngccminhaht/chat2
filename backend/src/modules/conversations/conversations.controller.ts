import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { GetConversationsDto } from './dto/get-conversations.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  findAll(@Query() dto: GetConversationsDto) {
    return this.conversationsService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(id);
  }
}
