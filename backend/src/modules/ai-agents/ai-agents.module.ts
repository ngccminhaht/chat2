import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiAgentsController } from './ai-agents.controller';
import { AiAgentsService } from './ai-agents.service';
import { AiAgent, AiAgentSchema } from './ai-agent.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiAgent.name, schema: AiAgentSchema },
    ]),
  ],
  controllers: [AiAgentsController],
  providers: [AiAgentsService],
  exports: [AiAgentsService],
})
export class AiAgentsModule {}
