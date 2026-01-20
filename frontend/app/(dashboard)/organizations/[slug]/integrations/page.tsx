'use client';

import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Tabs,
  Tab,
  Chip,
  Alert,
  Divider,
} from '@mui/material';
import { ApiKeySection } from '@/features/organizations';
import { useAuthStore } from '@/features/auth/stores/authStore';
import CodeBlock from '@/components/common/CodeBlock';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null;
}

interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  auth: boolean;
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
          {endpoint.auth && (
            <Chip label="Auth Required" size="small" variant="outlined" />
          )}
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
  const [tab, setTab] = useState(0);
  const organizationId = useAuthStore((state) => state.organizationId);
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

  const webhookEndpoints: ApiEndpoint[] = [
    {
      method: 'POST',
      path: '/webhooks/external',
      description: 'Receive messages from external systems. Messages will be processed and routed to the appropriate conversation.',
      auth: true,
      requestBody: `{
  "platform": "external",
  "conversationId": "conv_123",
  "message": {
    "text": "Hello from external system",
    "senderId": "user_456",
    "senderName": "John Doe"
  },
  "metadata": {
    "source": "crm",
    "ticketId": "TICKET-001"
  }
}`,
      responseBody: `{
  "success": true,
  "messageId": "msg_789",
  "conversationId": "conv_123"
}`,
      curl: `curl -X POST "${baseUrl}/webhooks/external" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "platform": "external",
    "conversationId": "conv_123",
    "message": {
      "text": "Hello from external system",
      "senderId": "user_456",
      "senderName": "John Doe"
    }
  }'`,
    },
    {
      method: 'POST',
      path: '/webhooks/status',
      description: 'Update message delivery status (sent, delivered, read, failed).',
      auth: true,
      requestBody: `{
  "messageId": "msg_789",
  "status": "delivered",
  "timestamp": "2024-01-20T10:30:00Z"
}`,
      responseBody: `{
  "success": true
}`,
      curl: `curl -X POST "${baseUrl}/webhooks/status" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "messageId": "msg_789",
    "status": "delivered",
    "timestamp": "2024-01-20T10:30:00Z"
  }'`,
    },
  ];

  const conversationEndpoints: ApiEndpoint[] = [
    {
      method: 'GET',
      path: `/organizations/${organizationId || ':orgId'}/conversations`,
      description: 'List all conversations for the organization with pagination and filtering.',
      auth: true,
      responseBody: `{
  "data": [
    {
      "_id": "conv_123",
      "platform": "facebook",
      "status": "open",
      "customerName": "John Doe",
      "lastMessage": {
        "text": "Hello",
        "timestamp": "2024-01-20T10:00:00Z"
      },
      "unreadCount": 2
    }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}`,
      curl: `curl -X GET "${baseUrl}/organizations/${organizationId || ':orgId'}/conversations?status=open&page=1&limit=20" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`,
    },
    {
      method: 'PATCH',
      path: `/organizations/${organizationId || ':orgId'}/conversations/:id`,
      description: 'Update conversation status, tags, or AI settings.',
      auth: true,
      requestBody: `{
  "status": "resolved",
  "tags": ["vip", "urgent"],
  "aiEnabled": false
}`,
      responseBody: `{
  "_id": "conv_123",
  "status": "resolved",
  "tags": ["vip", "urgent"],
  "aiEnabled": false
}`,
      curl: `curl -X PATCH "${baseUrl}/organizations/${organizationId || ':orgId'}/conversations/conv_123" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -d '{
    "status": "resolved",
    "tags": ["vip", "urgent"]
  }'`,
    },
  ];

  const messageEndpoints: ApiEndpoint[] = [
    {
      method: 'POST',
      path: `/organizations/${organizationId || ':orgId'}/messages/send`,
      description: 'Send a message to a conversation. The message will be delivered to the customer via the appropriate platform.',
      auth: true,
      requestBody: `{
  "conversationId": "conv_123",
  "content": {
    "type": "text",
    "text": "Thank you for contacting us!"
  }
}`,
      responseBody: `{
  "_id": "msg_456",
  "conversationId": "conv_123",
  "status": "pending",
  "content": {
    "type": "text",
    "text": "Thank you for contacting us!"
  },
  "createdAt": "2024-01-20T10:30:00Z"
}`,
      curl: `curl -X POST "${baseUrl}/organizations/${organizationId || ':orgId'}/messages/send" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -d '{
    "conversationId": "conv_123",
    "content": {
      "type": "text",
      "text": "Thank you for contacting us!"
    }
  }'`,
    },
  ];

  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Stack spacing={3} maxWidth={900} mx="auto" my={2}>
        <Paper sx={{ p: 3 }}>
          <Stack spacing={3}>
            <Typography variant="h5">API Integration</Typography>
            <Typography variant="body2" color="text.secondary">
              Integrate MiAgent with your external systems using our REST API. Use your API key to authenticate webhook requests.
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
            All API requests require authentication. Use <code>Authorization: Bearer TOKEN</code> for user-authenticated endpoints
            or <code>X-API-Key: YOUR_API_KEY</code> for webhook endpoints.
          </Alert>

          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Webhooks" />
            <Tab label="Conversations" />
            <Tab label="Messages" />
          </Tabs>

          <TabPanel value={tab} index={0}>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Webhook endpoints allow external systems to send messages and status updates to MiAgent.
                These endpoints use API Key authentication via the <code>X-API-Key</code> header.
              </Typography>
              {webhookEndpoints.map((endpoint, i) => (
                <ApiEndpointCard key={i} endpoint={endpoint} />
              ))}
            </Stack>
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Manage conversations programmatically. These endpoints use Bearer token authentication.
              </Typography>
              {conversationEndpoints.map((endpoint, i) => (
                <ApiEndpointCard key={i} endpoint={endpoint} />
              ))}
            </Stack>
          </TabPanel>

          <TabPanel value={tab} index={2}>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Send messages to customers through the unified messaging API.
              </Typography>
              {messageEndpoints.map((endpoint, i) => (
                <ApiEndpointCard key={i} endpoint={endpoint} />
              ))}
            </Stack>
          </TabPanel>
        </Paper>
      </Stack>
    </Box>
  );
}
