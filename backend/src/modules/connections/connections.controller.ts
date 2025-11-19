import {
  Controller,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ConnectionsService } from './connections.service';

@Controller('connections')
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(
    private readonly connectionsService: ConnectionsService,
  ) {}

  /**
   * Get all platform connections for current user
   * GET /api/connections
   */
  @Get()
  findAll(@Request() req) {
    const userId = req.user.userId;
    return this.connectionsService.findAllByUser(userId);
  }

  /**
   * Get a specific platform connection
   * GET /api/connections/:id
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.connectionsService.findOne(id);
  }

  /**
   * Update platform connection status
   * PATCH /api/connections/:id/status
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'inactive' | 'expired' },
  ) {
    if (!body.status) {
      throw new BadRequestException('Status is required');
    }

    const connection = await this.connectionsService.updateStatus(
      id,
      body.status,
    );

    if (!connection) {
      throw new BadRequestException('Platform connection not found');
    }

    return { success: true, connection };
  }

  /**
   * Delete a platform connection
   * DELETE /api/connections/:id
   */
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.connectionsService.delete(id);
    return { success: true };
  }
}
