import api from '@/lib/api';
import { unwrap } from '@/lib/api/integrations';

/**
 * Contract of /mcp-oauth and /mcp-connections: the organization's own AI app (Claude, ChatGPT,
 * Codex, Gemini) connected to Mizano. The app works through Mizano's tools; it never posts.
 */
export const MCP_ACCESS = ['read', 'drafts'] as const;
export type McpAccess = (typeof MCP_ACCESS)[number];

export interface McpAuthRequest {
  requestId: string;
  clientName: string;
  redirectHost: string;
  requestedAccess: McpAccess;
  organization: { id: string; name: string };
  user: { name: string; email: string };
  expiresAt: string;
}

export interface McpConnection {
  id: string;
  clientName: string;
  access: McpAccess;
  userName: string;
  isMine: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface McpConnections {
  /** null: the operator has not turned the AI app connection on for this server. */
  serverUrl: string | null;
  connections: McpConnection[];
  canManageAll: boolean;
}

const requests = '/mcp-oauth/requests';
const connections = '/mcp-connections';
const id = (value: string) => encodeURIComponent(value);

export const mcpApi = {
  getRequest: async (requestId: string): Promise<McpAuthRequest> =>
    unwrap((await api.get(`${requests}/${id(requestId)}`)).data),
  approve: async (input: {
    requestId: string;
    access: McpAccess;
  }): Promise<{ redirectUrl: string }> =>
    unwrap(
      (await api.post(`${requests}/${id(input.requestId)}/approve`, { access: input.access })).data,
    ),
  deny: async (requestId: string): Promise<{ redirectUrl: string }> =>
    unwrap((await api.post(`${requests}/${id(requestId)}/deny`)).data),
  connections: async (): Promise<McpConnections> => unwrap((await api.get(connections)).data),
  revoke: async (connectionId: string): Promise<{ revoked: true }> =>
    unwrap((await api.post(`${connections}/${id(connectionId)}/revoke`)).data),
};
