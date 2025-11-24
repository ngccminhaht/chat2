import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { EnvService } from '@/common/env';
import { v4 as uuidv4 } from 'uuid';

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  contentType: string;
  size: number;
}

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);
  private s3Client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor(private readonly envService: EnvService) {
    const endpoint = this.envService.get('MINIO_ENDPOINT');
    const port = this.envService.get('MINIO_PORT');
    const accessKey = this.envService.get('MINIO_ACCESS_KEY');
    const secretKey = this.envService.get('MINIO_SECRET_KEY');

    this.bucket = this.envService.get('MINIO_BUCKET');
    this.publicUrl =
      this.envService.get('MINIO_PUBLIC_URL') ||
      `http://${endpoint}:${port}/${this.bucket}`;

    this.s3Client = new S3Client({
      endpoint: `http://${endpoint}:${port}`,
      region: 'us-east-1', // MinIO doesn't care about region
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`✅ Bucket '${this.bucket}' exists`);
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        this.logger.log(`Creating bucket '${this.bucket}'...`);
        await this.s3Client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`✅ Bucket '${this.bucket}' created`);
      } else {
        this.logger.warn(`Could not check bucket: ${error.message}`);
      }
    }
  }

  async upload(
    file: Express.Multer.File,
    folder: string = 'uploads',
  ): Promise<UploadResult> {
    const ext = this.getFileExtension(file.originalname);
    const key = `${folder}/${uuidv4()}${ext}`;

    this.logger.log(`📤 Uploading file: ${file.originalname} -> ${key}`);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      }),
    );

    const url = `${this.publicUrl}/${key}`;

    this.logger.log(`✅ File uploaded: ${url}`);

    return {
      url,
      key,
      bucket: this.bucket,
      contentType: file.mimetype,
      size: file.size,
    };
  }

  async uploadBuffer(
    buffer: Buffer,
    filename: string,
    contentType: string,
    folder: string = 'uploads',
  ): Promise<UploadResult> {
    const ext = this.getFileExtension(filename);
    const key = `${folder}/${uuidv4()}${ext}`;

    this.logger.log(`📤 Uploading buffer: ${filename} -> ${key}`);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read',
      }),
    );

    const url = `${this.publicUrl}/${key}`;

    this.logger.log(`✅ Buffer uploaded: ${url}`);

    return {
      url,
      key,
      bucket: this.bucket,
      contentType,
      size: buffer.length,
    };
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.slice(lastDot) : '';
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }
}
