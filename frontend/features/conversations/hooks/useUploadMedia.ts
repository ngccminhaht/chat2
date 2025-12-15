import { useMutation } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';

interface PresignedUrlResponse {
  uploadUrl: string;
  fileUrl: string;
  key: string;
  expiresIn: number;
}

export interface UploadResult {
  url: string;
  key: string;
  contentType: string;
  size: number;
}

export function useUploadMedia() {
  return useMutation<UploadResult, Error, File>({
    mutationFn: async (file: File) => {
      // Step 1: Get presigned URL from backend
      const { data: presigned } = await apiClient.post<PresignedUrlResponse>(
        '/media/presign/upload',
        {
          filename: file.name,
          contentType: file.type,
        }
      );

      // Step 2: Upload file directly to S3 using presigned URL
      await fetch(presigned.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      return {
        url: presigned.fileUrl,
        key: presigned.key,
        contentType: file.type,
        size: file.size,
      };
    },
  });
}
