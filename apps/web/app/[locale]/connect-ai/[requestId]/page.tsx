'use client';

import { McpConsent } from '@/components/settings/mcp-consent';

/** The consent screen an AI app (Claude, ChatGPT, Codex, Gemini) sends the person to. */
export default function ConnectAiPage({ params }: { params: { requestId: string } }) {
  return <McpConsent requestId={params.requestId} />;
}
