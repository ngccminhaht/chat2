import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

describe('MediaController', () => {
  let controller: MediaController;
  let mediaService: jest.Mocked<MediaService>;

  const mockMediaService = {
    upload: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: mockMediaService }],
    }).compile();

    controller = module.get<MediaController>(MediaController);
    mediaService = module.get(MediaService);

    jest.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload file and return result', async () => {
      const mockFile = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      const mockResult = {
        url: 'https://storage.example.com/files/test.pdf',
        filename: 'test.pdf',
        size: 1024,
      };

      mockMediaService.upload.mockResolvedValue(mockResult);

      const result = await controller.uploadFile(mockFile);

      expect(result).toEqual(mockResult);
      expect(mockMediaService.upload).toHaveBeenCalledWith(mockFile, 'files');
    });

    it('should upload image to images folder', async () => {
      const mockFile = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 2048,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      mockMediaService.upload.mockResolvedValue({ url: 'test' });

      await controller.uploadFile(mockFile);

      expect(mockMediaService.upload).toHaveBeenCalledWith(mockFile, 'images');
    });

    it('should upload audio to audio folder', async () => {
      const mockFile = {
        originalname: 'audio.mp3',
        mimetype: 'audio/mpeg',
        size: 4096,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      mockMediaService.upload.mockResolvedValue({ url: 'test' });

      await controller.uploadFile(mockFile);

      expect(mockMediaService.upload).toHaveBeenCalledWith(mockFile, 'audio');
    });

    it('should upload video to video folder', async () => {
      const mockFile = {
        originalname: 'video.mp4',
        mimetype: 'video/mp4',
        size: 8192,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      mockMediaService.upload.mockResolvedValue({ url: 'test' });

      await controller.uploadFile(mockFile);

      expect(mockMediaService.upload).toHaveBeenCalledWith(mockFile, 'video');
    });

    it('should throw BadRequestException when no file provided', async () => {
      await expect(controller.uploadFile(undefined as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for disallowed file type', async () => {
      const mockFile = {
        originalname: 'malware.exe',
        mimetype: 'application/x-msdownload',
        size: 1024,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      await expect(controller.uploadFile(mockFile)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('uploadImage', () => {
    it('should upload image file', async () => {
      const mockFile = {
        originalname: 'photo.png',
        mimetype: 'image/png',
        size: 2048,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      const mockResult = {
        url: 'https://storage.example.com/images/photo.png',
        filename: 'photo.png',
        size: 2048,
      };

      mockMediaService.upload.mockResolvedValue(mockResult);

      const result = await controller.uploadImage(mockFile);

      expect(result).toEqual(mockResult);
      expect(mockMediaService.upload).toHaveBeenCalledWith(mockFile, 'images');
    });

    it('should throw BadRequestException when no file provided', async () => {
      await expect(controller.uploadImage(undefined as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for non-image file', async () => {
      const mockFile = {
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      await expect(controller.uploadImage(mockFile)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
