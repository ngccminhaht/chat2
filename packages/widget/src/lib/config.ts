export interface WidgetConfig {
  organizationId: string;
  organizationName: string;
  primaryColor: string;
  position: 'left' | 'right';
  greeting: string;
  logo?: string;
  offlineMessage: string;
  preChatForm: boolean;
  preChatFields: string[];
}

export async function fetchConfig(orgSlug: string): Promise<WidgetConfig> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/widget/${orgSlug}/config`);

  if (!response.ok) {
    throw new Error(`Failed to fetch widget config: ${response.status}`);
  }

  return response.json();
}

function getApiBaseUrl(): string {
  // In production, injected by CDN
  return (window as any).__MIAGENT_API_URL__ || 'http://localhost:3000';
}
