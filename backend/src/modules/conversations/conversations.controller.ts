import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  Delete,
} from "@nestjs/common";
import { ConversationsService } from "./conversations.service";
import { GetConversationsDto } from "./dto/get-conversations.dto";
import { UpdateConversationDto } from "./dto/update-conversation.dto";
import { CreateConversationNoteDto } from "./dto/create-conversation-note.dto";
import { UpdateConversationNoteDto } from "./dto/update-conversation-note.dto";
import { CurrentUser } from "@/common/decorators";

@Controller("organizations/:organizationId/conversations")
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  findAll(
    @Param("organizationId") organizationId: string,
    @Query() dto: GetConversationsDto
  ) {
    return this.conversationsService.findAll(organizationId, dto);
  }

  @Get(":id")
  findOne(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string
  ) {
    return this.conversationsService.findOne(organizationId, id);
  }

  @Patch(":id")
  update(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() dto: UpdateConversationDto
  ) {
    return this.conversationsService.update(organizationId, id, dto);
  }

  @Post(":id/mark-seen")
  markAsSeen(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string
  ) {
    return this.conversationsService.markAsSeen(organizationId, id);
  }

  @Delete(":id")
  remove(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string
  ) {
    return this.conversationsService.remove(organizationId, id);
  }

  @Delete()
  removeAll(@Param("organizationId") organizationId: string) {
    return this.conversationsService.removeAll(organizationId);
  }

  // Notes endpoints
  @Get(":id/notes")
  getNotes(
    @Param("organizationId") organizationId: string,
    @Param("id") conversationId: string,
    @CurrentUser("sub") userId: string
  ) {
    return this.conversationsService.getNotes(
      organizationId,
      conversationId,
      userId
    );
  }

  @Post(":id/notes")
  createNote(
    @Param("organizationId") organizationId: string,
    @Param("id") conversationId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: CreateConversationNoteDto
  ) {
    return this.conversationsService.createNote(
      organizationId,
      conversationId,
      userId,
      dto
    );
  }

  @Patch(":id/notes/:noteId")
  updateNote(
    @Param("organizationId") organizationId: string,
    @Param("noteId") noteId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: UpdateConversationNoteDto
  ) {
    return this.conversationsService.updateNote(
      organizationId,
      noteId,
      userId,
      dto
    );
  }

  @Delete(":id/notes/:noteId")
  deleteNote(
    @Param("organizationId") organizationId: string,
    @Param("noteId") noteId: string,
    @CurrentUser("sub") userId: string
  ) {
    return this.conversationsService.deleteNote(organizationId, noteId, userId);
  }
}
