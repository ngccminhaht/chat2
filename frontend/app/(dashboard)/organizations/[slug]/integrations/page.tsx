'use client';

import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Alert,
  Divider,
} from '@mui/material';
import { ApiKeySection } from '@/features/organizations';
import CodeBlock from '@/components/common/CodeBlock';

interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  requestBody?: string;
  responseBody: string;
  curl: string;
}

const METHOD_COLORS: Record<string, 'success' | 'primary' | 'warning' | 'error'> = {
  GET: 'success',
  POST: 'primary',
  PATCH: 'warning',
  DELETE: 'error',
};

function ApiEndpointCard({ endpoint }: { endpoint: ApiEndpoint }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            label={endpoint.method}
            color={METHOD_COLORS[endpoint.method]}
            size="small"
            sx={{ fontWeight: 'bold', minWidth: 70 }}
          />
          <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
            {endpoint.path}
          </Typography>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {endpoint.description}
        </Typography>

        <Typography variant="subtitle2">cURL Example</Typography>
        <CodeBlock code={endpoint.curl} language="bash" />

        {endpoint.requestBody && (
          <>
            <Typography variant="subtitle2">Request Body</Typography>
            <CodeBlock code={endpoint.requestBody} language="json" />
          </>
        )}

        <Typography variant="subtitle2">Response</Typography>
        <CodeBlock code={endpoint.responseBody} language="json" />
      </Stack>
    </Paper>
  );
}

export default function IntegrationsPage() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

  const getOrganizationEndpoint: ApiEndpoint = {
    method: 'GET',
    path: '/external/organization',
    description: 'Get organization info. Organization is automatically determined from your API key.',
    responseBody: `{
  "id": "org_123",
  "name": "My Organization",
  "slug": "my-org",
  "description": "Organization description",
  "plan": "free",
  "settings": {...},
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-20T10:30:00Z"
}`,
    curl: `curl -X GET "${baseUrl}/external/organization" \\
  -H "X-API-Key: YOUR_API_KEY"`,
  };

  const getConnectionsEndpoint: ApiEndpoint = {
    method: 'GET',
    path: '/external/connections',
    description: 'List all platform connections for your organization. Organization is automatically determined from your API key.',
    responseBody: `[
  {
    "id": "conn_123",
    "platform": "facebook",
    "platformAccountId": "123456789",
    "platformAccountName": "My Page",
    "status": "active",
    "aiSettings": { "enabled": true },
    "createdAt": "2024-01-01T00:00:00Z"
  }
]`,
    curl: `curl -X GET "${baseUrl}/external/connections" \\
  -H "X-API-Key: YOUR_API_KEY"`,
  };

  const updateConversationEndpoint: ApiEndpoint = {
    method: 'PATCH',
    path: '/external/conversations/:id',
    description: 'Update conversation settings. Use aiEnabled to enable/disable AI auto-reply for this conversation. Organization is automatically determined from your API key.',
    requestBody: `{
  "aiEnabled": true
}`,
    responseBody: `{
  "_id": "conv_123",
  "platform": "facebook",
  "status": "open",
  "aiEnabled": true,
  "customerName": "John Doe",
  "updatedAt": "2024-01-20T10:30:00Z"
}`,
    curl: `curl -X PATCH "${baseUrl}/external/conversations/CONVERSATION_ID" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "aiEnabled": true
  }'`,
  };

  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Stack spacing={3} maxWidth={900} mx="auto" my={2}>
        <Paper sx={{ p: 3 }}>
          <Stack spacing={3}>
            <Typography variant="h5">API Integration</Typography>
            <Typography variant="body2" color="text.secondary">
              Integrate MiAgent with your external systems using our REST API.
            </Typography>

            <Divider />

            <ApiKeySection />
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            API Reference
          </Typography>

          <Alert severity="info" sx={{ mb: 2 }}>
            Use your API key in the <code>X-API-Key</code> header. Organization is automatically determined from your API key.
          </Alert>

          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle1" gutterBottom>Get Organization</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Retrieve your organization info.
              </Typography>
              <ApiEndpointCard endpoint={getOrganizationEndpoint} />
            </Box>

            <Box>
              <Typography variant="subtitle1" gutterBottom>List Connections</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Get all platform connections for your organization.
              </Typography>
              <ApiEndpointCard endpoint={getConnectionsEndpoint} />
            </Box>

            <Box>
              <Typography variant="subtitle1" gutterBottom>Update Conversation</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Enable or disable AI auto-reply for a specific conversation.
              </Typography>
              <ApiEndpointCard endpoint={updateConversationEndpoint} />
            </Box>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
