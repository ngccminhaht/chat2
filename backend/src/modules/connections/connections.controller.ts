import {
  Controller,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ConnectionsService } from './connections.service';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('organizations/:organizationId/connections')
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(
    private readonly connectionsService: ConnectionsService,
  ) {}

  /**
   * Get all platform connections for organization
   * GET /api/organizations/:organizationId/connections
   */
  @Get()
  findAll(@Param('organizationId') organizationId: string) {
    return this.connectionsService.findAllByOrganization(organizationId);
  }

  /**
   * Get a specific platform connection
   * GET /api/organizations/:organizationId/connections/:id
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.connectionsService.findOne(id);
  }

  /**
   * Update platform connection status
   * PATCH /api/organizations/:organizationId/connections/:id/status
   */
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    const connection = await this.connectionsService.updateStatus(id, dto.status);

    if (!connection) {
      throw new BadRequestException('Platform connection not found');
    }

    return { success: true, connection };
  }

  /**
   * Delete a platform connection
   * DELETE /api/organizations/:organizationId/connections/:id
   */
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.connectionsService.delete(id);
    return { success: true };
  }
}
