import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import {
  Conversation,
  ConversationSchema,
} from "@/common/database/schemas/conversation.schema";
import {
  Message,
  MessageSchema,
} from "@/common/database/schemas/message.schema";
import {
  ConversationNote,
  ConversationNoteSchema,
} from "@/common/database/schemas/conversation-note.schema";
import { OrganizationsModule } from "../organizations/organizations.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: ConversationNote.name, schema: ConversationNoteSchema },
    ]),
    OrganizationsModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
