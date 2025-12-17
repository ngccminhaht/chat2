import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  NotFoundException,
  Header,
  Logger,
} from '@nestjs/common';
import { WidgetService } from './widget.service';
import { Public, CurrentOrganization } from '@/common/decorators';
import { UpdateWidgetConfigDto } from './dto/update-widget-config.dto';

@Controller('widget')
export class WidgetController {
  private readonly logger = new Logger(WidgetController.name);

  constructor(private readonly widgetService: WidgetService) {}

  /**
   * GET /api/widget/:orgSlug/config
   * Public endpoint - no auth required
   * Returns widget configuration for embedding
   *
   * Note: CORS is handled globally in main.ts for widget endpoints
   * Widget config is intentionally public (non-sensitive display settings)
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

  /**
   * GET /api/widget/config
   * Get widget configuration for the current user's organization
   */
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
  @Patch('config')
  async updateWidgetConfig(
    @CurrentOrganization() organizationId: string,
    @Body() dto: UpdateWidgetConfigDto,
  ) {
    return this.widgetService.updateWidgetConfig(organizationId, dto);
  }
}
