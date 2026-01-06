import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Public } from '@/common/decorators';
import { MediaService, PresignedUrlResult, GetPresignedUrlResult } from './media.service';

const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Archives
  'application/zip',
  'application/x-rar-compressed',
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  // Video
  'video/mp4',
  'video/webm',
];

interface PresignedUploadDto {
  filename: string;
  contentType: string;
  folder?: string;
}

@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaService: MediaService) {}

  /**
   * Check if media service is available
   */
  @Get('status')
  @Public()
  getStatus(): { configured: boolean } {
    return { configured: this.mediaService.isS3Configured() };
  }

  /**
   * Get presigned URL for uploading a file
   * Frontend calls this first, then uses the returned URL to upload directly to S3
   */
  @Post('presign/upload')
  async getPresignedUploadUrl(
    @Body() dto: PresignedUploadDto,
  ): Promise<PresignedUrlResult> {
    if (!this.mediaService.isS3Configured()) {
      throw new ServiceUnavailableException('Media upload is not configured');
    }

    if (!dto.filename || !dto.contentType) {
      throw new BadRequestException('filename and contentType are required');
    }

    if (!ALLOWED_MIME_TYPES.includes(dto.contentType)) {
      throw new BadRequestException(
        `File type '${dto.contentType}' is not allowed`,
      );
    }

    // Determine folder based on content type if not provided
    let folder = dto.folder || 'files';
    if (!dto.folder) {
      if (dto.contentType.startsWith('image/')) {
        folder = 'images';
      } else if (dto.contentType.startsWith('audio/')) {
        folder = 'audio';
      } else if (dto.contentType.startsWith('video/')) {
        folder = 'video';
      }
    }

    this.logger.log(
      `📁 Presigned upload request: ${dto.filename} (${dto.contentType}) -> ${folder}`,
    );

    return this.mediaService.getPresignedUploadUrl(
      dto.filename,
      dto.contentType,
      folder,
    );
  }

  /**
   * Get presigned URL for downloading/viewing a private file
   */
  @Get('presign/download')
  async getPresignedDownloadUrl(
    @Query('key') key: string,
  ): Promise<GetPresignedUrlResult> {
    if (!this.mediaService.isS3Configured()) {
      throw new ServiceUnavailableException('Media service is not configured');
    }

    if (!key) {
      throw new BadRequestException('key is required');
    }

    this.logger.log(`📁 Presigned download request: ${key}`);

    return this.mediaService.getPresignedDownloadUrl(key);
  }
}
