import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";
import { ConversationNote } from "../types/conversation.types";
import { useAuthStore } from "@/features/auth/stores/authStore";

interface UseConversationNotesParams {
  conversationId: string;
}

export function useConversationNotes({
  conversationId,
}: UseConversationNotesParams) {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useQuery<ConversationNote[]>({
    queryKey: ["conversation-notes", organizationId, conversationId],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/organizations/${organizationId}/conversations/${conversationId}/notes`
      );
      return data;
    },
    enabled: !!organizationId && !!conversationId,
  });
}

interface CreateNoteData {
  content: string;
  isPrivate?: boolean;
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation({
    mutationFn: async ({
      conversationId,
      data,
    }: {
      conversationId: string;
      data: CreateNoteData;
    }) => {
      const response = await apiClient.post(
        `/organizations/${organizationId}/conversations/${conversationId}/notes`,
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [
          "conversation-notes",
          organizationId,
          variables.conversationId,
        ],
      });
    },
  });
}

interface UpdateNoteData {
  content?: string;
  isPrivate?: boolean;
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation({
    mutationFn: async ({
      conversationId,
      noteId,
      data,
    }: {
      conversationId: string;
      noteId: string;
      data: UpdateNoteData;
    }) => {
      const response = await apiClient.patch(
        `/organizations/${organizationId}/conversations/${conversationId}/notes/${noteId}`,
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [
          "conversation-notes",
          organizationId,
          variables.conversationId,
        ],
      });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation({
    mutationFn: async ({
      conversationId,
      noteId,
    }: {
      conversationId: string;
      noteId: string;
    }) => {
      const response = await apiClient.delete(
        `/organizations/${organizationId}/conversations/${conversationId}/notes/${noteId}`
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [
          "conversation-notes",
          organizationId,
          variables.conversationId,
        ],
      });
    },
  });
}
