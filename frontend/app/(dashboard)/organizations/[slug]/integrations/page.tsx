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
import PageContainer from '@/components/layout/PageContainer';

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
    <PageContainer
      title="Tích hợp API"
      helpText="Trợ giúp về REST API Integration"
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Tích hợp miAgent với hệ thống bên ngoài của bạn thông qua REST API.
          </Typography>

          <ApiKeySection />
        </Box>

        <Divider />

        <Box>
          <Typography variant="h6" sx={{ fontSize: '15px', fontWeight: 600, mb: 1 }}>
            API Reference
          </Typography>

          <Alert severity="info" sx={{ mb: 2 }}>
            Sử dụng API key trong header <code>X-API-Key</code>. Tổ chức được tự động xác định từ API key của bạn.
          </Alert>

          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '13.5px', mb: 0.5 }}>
                Cập nhật hội thoại
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Bật hoặc tắt tính năng tự động trả lời bằng AI cho một hội thoại cụ thể.
              </Typography>
              <ApiEndpointCard endpoint={updateConversationEndpoint} />
            </Box>
          </Stack>
        </Box>
      </Stack>
    </PageContainer>
  );
}
