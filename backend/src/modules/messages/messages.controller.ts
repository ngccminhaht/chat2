import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { GetMessagesDto } from './dto/get-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { JwtAuthGuard } from '@/common/guards';
import { CurrentUser } from '@/common/decorators';

@Controller('organizations/:organizationId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversation/:conversationId')
  findByConversation(
    @Param('organizationId') organizationId: string,
    @Param('conversationId') conversationId: string,
    @Query() dto: GetMessagesDto,
  ) {
    return this.messagesService.findByConversation(
      organizationId,
      conversationId,
      dto,
    );
  }

  @Post('send')
  send(
    @Param('organizationId') organizationId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.send(organizationId, userId, dto);
  }

  @Patch('mark-read')
  markAsRead(
    @Param('organizationId') organizationId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.messagesService.markAsRead(
      organizationId,
      dto.conversationId,
      userId,
    );
  }
}
