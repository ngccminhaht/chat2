export interface WidgetConfig {
  orgSlug: string;
  apiUrl: string;
}

export interface OrganizationConfig {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  // Appearance
  buttonStyle: 'circle' | 'pill' | 'square';
  buttonSize: number;
  buttonIcon: 'chat' | 'message' | 'messenger' | 'custom';
  customIconUrl?: string;
  position: 'left' | 'right';
  marginRight: number;
  marginBottom: number;
  marginBottomMobile: number;
  // Colors
  primaryColor: string;
  textColor: 'light' | 'dark';
  // Avatar
  avatarName?: string;
  avatarUrl?: string;
  // Window size
  windowHeightMobile: number;
  windowHeight: number;
  windowHeightUnit: '%' | 'px';
  // Messages
  greeting: string;
  offlineMessage: string;
  // Pre-chat form
  preChatForm: boolean;
  preChatFields: string[];
  // Legacy
  logo?: string;
}

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot' | 'agent';
  timestamp: Date;
}

export interface VisitorInfo {
  name?: string;
  email?: string;
  phone?: string;
}
