import { OrganizationConfig } from './types';

export class WidgetAPI {
  constructor(private apiUrl: string) {}

  async fetchConfig(orgSlug: string): Promise<OrganizationConfig> {
    // Add cache busting timestamp
    const response = await fetch(
      `${this.apiUrl}/widget/${orgSlug}/config?_t=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (!response.ok) {
      throw new Error('Failed to fetch widget configuration');
    }
    return response.json();
  }
}
