import { Controller, Get, Post, Body, Param, Query, UseGuards, Request, Patch } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { GetMessagesDto } from './dto/get-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversation/:conversationId')
  findByConversation(
    @Param('conversationId') conversationId: string,
    @Query() dto: GetMessagesDto,
  ) {
    return this.messagesService.findByConversation(conversationId, dto);
  }

  @Post('send')
  send(@Request() req, @Body() dto: SendMessageDto) {
    const userId = req.user.userId;
    return this.messagesService.send(userId, dto);
  }

  @Patch('mark-read')
  markAsRead(@Request() req, @Body() dto: MarkReadDto) {
    const userId = req.user.userId;
    return this.messagesService.markAsRead(dto.conversationId, userId);
  }
}
