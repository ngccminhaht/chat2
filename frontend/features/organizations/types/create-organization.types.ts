export interface CreateOrganizationRequest {
  name: string;
  slug: string;
  description?: string;
}

export interface CreateOrganizationResponse {
  id: string;
  name: string;
  slug: string;
  plan: string;
}
