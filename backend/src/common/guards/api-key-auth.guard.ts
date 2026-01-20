import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  CanActivate,
} from '@nestjs/common';
import { OrganizationsService } from '@/modules/organizations/organizations.service';

/**
 * API Key Auth Guard
 * Validates X-API-Key header and attaches organization to request
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private organizationsService: OrganizationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const organization = await this.organizationsService.validateApiKey(apiKey);

    if (!organization) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Attach organization to request
    request.organization = organization;
    request.organizationId = organization._id.toString();

    return true;
  }
}
