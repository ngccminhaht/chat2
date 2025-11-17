import { Controller, Get, Param, Query, Delete, UseGuards } from '@nestjs/common';
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.conversationsService.remove(id);
  }

  @Delete()
  removeAll() {
    return this.conversationsService.removeAll();
  }
}
