import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService, UploadResult } from './media.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
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

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type '${file.mimetype}' is not allowed`,
      );
    }

    this.logger.log(
      `📁 Received file: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`,
    );

    // Determine folder based on file type
    let folder = 'files';
    if (file.mimetype.startsWith('image/')) {
      folder = 'images';
    } else if (file.mimetype.startsWith('audio/')) {
      folder = 'audio';
    } else if (file.mimetype.startsWith('video/')) {
      folder = 'video';
    }

    return this.mediaService.upload(file, folder);
  }

  @Post('upload/image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for images
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }

    this.logger.log(
      `🖼️ Received image: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`,
    );

    return this.mediaService.upload(file, 'images');
  }
}
