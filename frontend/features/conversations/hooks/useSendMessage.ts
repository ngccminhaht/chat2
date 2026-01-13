import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";
import { Message, MessageContent } from "../types/conversation.types";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { useConversationStore } from "../stores/conversationStore";

interface SendMessageParams {
  conversationId: string;
  type: "text" | "image" | "video" | "file" | "sticker" | "audio" | "location";
  content: MessageContent;
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);
  const addMessage = useConversationStore((state) => state.addMessage);

  return useMutation<Message, Error, SendMessageParams>({
    mutationFn: async (params) => {
      const { data } = await apiClient.post(
        `/organizations/${organizationId}/messages/send`,
        params
      );
      return data;
    },
    retry: false,
    onSuccess: (data, variables) => {
      // Optimistically add message to store for immediate UI update
      // This ensures message appears immediately without waiting for WebSocket
      if (data && data._id) {
        // Ensure message has all required fields
        const messageToAdd: Message = {
          ...data,
          conversationId: data.conversationId || variables.conversationId,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
        };
        addMessage(variables.conversationId, messageToAdd);
      }

      // Invalidate queries to ensure data consistency (will refetch if needed)
      queryClient.invalidateQueries({
        queryKey: ["messages", organizationId, variables.conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
