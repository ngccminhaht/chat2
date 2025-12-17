export interface QuickReply {
  _id: string;
  organizationId: string;
  userId?: string;
  title: string;
  shortcut: string;
  content: string;
  tags: string[];
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuickRepliesResponse {
  data: QuickReply[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreateQuickReplyDto {
  title: string;
  shortcut: string;
  content: string;
  tags?: string[];
  isPersonal?: boolean;
}

export interface UpdateQuickReplyDto {
  title?: string;
  shortcut?: string;
  content?: string;
  tags?: string[];
  isActive?: boolean;
}
