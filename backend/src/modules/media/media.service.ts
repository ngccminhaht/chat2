import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EnvService } from '@/common/env';
import { v4 as uuidv4 } from 'uuid';

export interface PresignedUrlResult {
  uploadUrl: string;
  fileUrl: string;
  key: string;
  expiresIn: number;
}

export interface GetPresignedUrlResult {
  url: string;
  expiresIn: number;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private s3Client: S3Client | null = null;
  private bucket: string;
  private publicUrl: string;
  private isConfigured: boolean = false;

  constructor(private readonly envService: EnvService) {
    this.initializeS3();
  }

  private initializeS3(): void {
    const endpoint = this.envService.get('S3_ENDPOINT');
    const region = this.envService.get('S3_REGION');
    const accessKeyId = this.envService.get('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.envService.get('S3_SECRET_ACCESS_KEY');
    this.bucket = this.envService.get('S3_BUCKET');
    this.publicUrl = this.envService.get('S3_PUBLIC_URL');

    // Check if S3 is configured
    if (!accessKeyId || !secretAccessKey || !this.bucket) {
      this.logger.warn('⚠️ S3 not configured - media upload will be disabled');
      return;
    }

    const s3Config: any = {
      region: region || 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };

    // If custom endpoint (MinIO, DigitalOcean Spaces, etc.)
    if (endpoint) {
      s3Config.endpoint = endpoint;
      s3Config.forcePathStyle = true;
    }

    this.s3Client = new S3Client(s3Config);
    this.isConfigured = true;

    this.logger.log('📦 S3 client initialized:', {
      endpoint: endpoint || 'AWS S3',
      bucket: this.bucket,
      region: region || 'us-east-1',
    });
  }

  /**
   * Check if S3 is configured
   */
  isS3Configured(): boolean {
    return this.isConfigured;
  }

  /**
   * Generate presigned URL for uploading a file
   * Frontend will use this URL to upload directly to S3
   */
  async getPresignedUploadUrl(
    filename: string,
    contentType: string,
    folder: string = 'uploads',
    expiresIn: number = 3600, // 1 hour default
  ): Promise<PresignedUrlResult> {
    if (!this.s3Client) {
      throw new Error('S3 is not configured');
    }

    const ext = this.getFileExtension(filename);
    const key = `${folder}/${uuidv4()}${ext}`;

    this.logger.log(`🔗 Generating presigned upload URL for: ${filename} -> ${key}`);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    // Generate the public URL for the file after upload
    const fileUrl = this.publicUrl
      ? `${this.publicUrl}/${key}`
      : `https://${this.bucket}.s3.amazonaws.com/${key}`;

    this.logger.log(`✅ Presigned URL generated, expires in ${expiresIn}s`);

    return {
      uploadUrl,
      fileUrl,
      key,
      expiresIn,
    };
  }

  /**
   * Generate presigned URL for downloading/viewing a file
   * Use this for private files that need temporary access
   */
  async getPresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600,
  ): Promise<GetPresignedUrlResult> {
    if (!this.s3Client) {
      throw new Error('S3 is not configured');
    }

    this.logger.log(`🔗 Generating presigned download URL for: ${key}`);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.s3Client, command, { expiresIn });

    return {
      url,
      expiresIn,
    };
  }

  /**
   * Get the public URL for a file (if bucket is public)
   */
  getPublicUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.slice(lastDot) : '';
  }
}
