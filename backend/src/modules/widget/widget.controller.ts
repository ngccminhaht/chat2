import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  NotFoundException,
  Header,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { WidgetService } from './widget.service';
import { Public, CurrentOrganization } from '@/common/decorators';
import { UpdateWidgetConfigDto } from './dto/update-widget-config.dto';
import { TenantGuard } from '@/common/guards/tenant.guard';

@Controller('widget')
export class WidgetController {
  private readonly logger = new Logger(WidgetController.name);

  constructor(private readonly widgetService: WidgetService) {}

  /**
   * GET /api/widget/config
   * Get widget configuration for the current user's organization
   */
  @UseGuards(TenantGuard)
  @Get('config')
  async getMyWidgetConfig(@CurrentOrganization() organizationId: string) {
    const config = await this.widgetService.getWidgetConfigByOrgId(
      organizationId,
    );
    if (!config) {
      throw new NotFoundException('Organization not found');
    }
    return config;
  }

  /**
   * PATCH /api/widget/config
   * Update widget configuration for the current user's organization
   */
  @UseGuards(TenantGuard)
  @Patch('config')
  async updateWidgetConfig(
    @CurrentOrganization() organizationId: string,
    @Body() dto: UpdateWidgetConfigDto,
  ) {
    return this.widgetService.updateWidgetConfig(organizationId, dto);
  }

  /**
   * GET /api/widget/:orgSlug/config
   * Public endpoint - no auth required
   * Returns widget configuration for embedding
   *
   * CORS: Allow all origins since widget can be embedded on any website
   * Widget config is intentionally public (non-sensitive display settings)
   * IMPORTANT: This route must be AFTER /config routes to avoid matching "config" as orgSlug
   */
  @Public()
  @Get(':orgSlug/config')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  async getWidgetConfig(@Param('orgSlug') orgSlug: string) {
    try {
      const config = await this.widgetService.getWidgetConfig(orgSlug);
      if (!config) {
        throw new NotFoundException('Organization not found');
      }
      return config;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to get widget config: ${error.message}`);
      throw error;
    }
  }
}
