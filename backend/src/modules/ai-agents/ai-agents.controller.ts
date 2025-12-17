import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentOrganization } from '@/common/decorators/current-organization.decorator';
import { AiAgentsService } from './ai-agents.service';
import { CreateAiAgentDto } from './dto/create-ai-agent.dto';
import { UpdateAiAgentDto } from './dto/update-ai-agent.dto';
import { AiAgentStatus } from './ai-agent.schema';

@Controller('ai-agents')
@UseGuards(JwtAuthGuard)
export class AiAgentsController {
  constructor(private readonly aiAgentsService: AiAgentsService) {}

  @Post()
  create(
    @CurrentOrganization() organizationId: string,
    @Body() dto: CreateAiAgentDto,
  ) {
    return this.aiAgentsService.create(organizationId, dto);
  }

  @Get()
  findAll(
    @CurrentOrganization() organizationId: string,
    @Query('status') status?: AiAgentStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.aiAgentsService.findAll(organizationId, {
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('active')
  findActiveAgents(@CurrentOrganization() organizationId: string) {
    return this.aiAgentsService.findActiveAgents(organizationId);
  }

  @Get(':id')
  findOne(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.aiAgentsService.findOne(organizationId, id);
  }

  @Patch(':id')
  update(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAiAgentDto,
  ) {
    return this.aiAgentsService.update(organizationId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.aiAgentsService.remove(organizationId, id);
  }
}
