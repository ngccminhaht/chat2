import { useMutation } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  contentType: string;
  size: number;
}

export function useUploadMedia() {
  return useMutation<UploadResult, Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await apiClient.post<UploadResult>('/media/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return data;
    },
  });
}
