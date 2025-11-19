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
import { PlatformConnectionsService } from './platform-connections.service';

@Controller('platform-connections')
@UseGuards(JwtAuthGuard)
export class PlatformConnectionsController {
  constructor(
    private readonly platformConnectionsService: PlatformConnectionsService,
  ) {}

  /**
   * Get all platform connections for current user
   * GET /api/platform-connections
   */
  @Get()
  findAll(@Request() req) {
    const userId = req.user.userId;
    return this.platformConnectionsService.findAllByUser(userId);
  }

  /**
   * Get a specific platform connection
   * GET /api/platform-connections/:id
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.platformConnectionsService.findOne(id);
  }

  /**
   * Update platform connection status
   * PATCH /api/platform-connections/:id/status
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'inactive' | 'expired' },
  ) {
    if (!body.status) {
      throw new BadRequestException('Status is required');
    }

    const connection = await this.platformConnectionsService.updateStatus(
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
   * DELETE /api/platform-connections/:id
   */
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.platformConnectionsService.delete(id);
    return { success: true };
  }
}
