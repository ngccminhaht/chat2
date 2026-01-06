import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentOrganization } from '@/common/decorators/current-organization.decorator';
import { QuickRepliesService } from './quick-replies.service';
import { CreateQuickReplyDto } from './dto/create-quick-reply.dto';
import { UpdateQuickReplyDto } from './dto/update-quick-reply.dto';

@Controller('quick-replies')
export class QuickRepliesController {
  constructor(private readonly quickRepliesService: QuickRepliesService) {}

  @Post()
  create(
    @CurrentOrganization() organizationId: string,
    @CurrentUser('_id') userId: string,
    @Body() dto: CreateQuickReplyDto,
  ) {
    return this.quickRepliesService.create(organizationId, userId, dto);
  }

  @Get()
  findAll(
    @CurrentOrganization() organizationId: string,
    @CurrentUser('_id') userId: string,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.quickRepliesService.findAll(organizationId, userId, {
      search,
      tag,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('shortcut/:shortcut')
  findByShortcut(
    @CurrentOrganization() organizationId: string,
    @CurrentUser('_id') userId: string,
    @Param('shortcut') shortcut: string,
  ) {
    return this.quickRepliesService.findByShortcut(organizationId, userId, `/${shortcut}`);
  }

  @Get(':id')
  findOne(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.quickRepliesService.findOne(organizationId, id);
  }

  @Patch(':id')
  update(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateQuickReplyDto,
  ) {
    return this.quickRepliesService.update(organizationId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.quickRepliesService.remove(organizationId, id);
  }

  @Post(':id/use')
  incrementUsage(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.quickRepliesService.incrementUsage(organizationId, id);
  }
}
