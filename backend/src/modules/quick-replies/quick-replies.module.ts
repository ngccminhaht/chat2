import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuickRepliesController } from './quick-replies.controller';
import { QuickRepliesService } from './quick-replies.service';
import { QuickReply, QuickReplySchema } from './quick-reply.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QuickReply.name, schema: QuickReplySchema },
    ]),
  ],
  controllers: [QuickRepliesController],
  providers: [QuickRepliesService],
  exports: [QuickRepliesService],
})
export class QuickRepliesModule {}
