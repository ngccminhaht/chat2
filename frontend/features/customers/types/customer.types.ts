export interface DeviceInfo {
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
  timezone?: string;
}

export interface LocationInfo {
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
}

export interface PlatformIdentity {
  platform: string;
  platformUserId: string;
  displayName?: string;
  avatar?: string;
}

export interface Customer {
  _id: string;
  organizationId: string;
  name?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  platformIdentities: PlatformIdentity[];
  widgetSessionId?: string;
  firstSeenDomain?: string;
  lastSeenDomain?: string;
  domains: string[];
  referrer?: string;
  landingPage?: string;
  deviceInfo?: DeviceInfo;
  location?: LocationInfo;
  ipAddress?: string;
  totalConversations: number;
  totalMessages: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastContactedAt?: string;
  tags: string[];
  customFields: Record<string, any>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GetCustomersParams {
  search?: string;
  domain?: string;
  tag?: string;
  page?: number;
  limit?: number;
  sortBy?: 'lastSeenAt' | 'createdAt' | 'totalMessages';
  sortOrder?: 'asc' | 'desc';
}

export interface CustomersResponse {
  data: Customer[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface UpdateCustomerData {
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  notes?: string;
  customFields?: Record<string, any>;
}
