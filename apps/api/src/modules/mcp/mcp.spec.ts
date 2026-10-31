import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { containsPattern, normalizeArabic } from '../../common/utils/arabic-search';
import { PrismaService } from '../../prisma/prisma.service';
import { McpConfig } from './mcp.config';
import { ConsentUser, McpOAuthService, McpPrincipal, OAuthError } from './oauth/mcp-oauth.service';
import { redirectUriAllowed } from './oauth/redirect-uri';
import { MCP_TOOLS } from './server/mcp-tool-catalog';
import { McpServerService } from './server/mcp-server.service';
import { McpToolsService } from './server/mcp-tools.service';

type Row = Record<string, unknown> & { id: string };

/** Just enough of Prisma for the OAuth service: rows in maps, simple equality filters. */
function memoryPrisma() {
  const tables: Record<string, Row[]> = {
    mcpClient: [],
    mcpAuthRequest: [],
    mcpGrant: [],
    mcpAuthCode: [],
    mcpToken: [],
    user: [],
    organization: [],
  };
  let seq = 0;
  const matches = (row: Row, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
        const op = v as Record<string, unknown>;
        if ('gt' in op) return (row[k] as Date) > (op.gt as Date);
        if ('lt' in op) return (row[k] as Date) < (op.lt as Date);
        if ('in' in op) return (op.in as unknown[]).includes(row[k]);
        return true;
      }
      return row[k] === v;
    });
  const withInclude = (name: string, row: Row | undefined, include?: Record<string, unknown>) => {
    if (!row || !include) return row ?? null;
    const out: Row = { ...row };
    if (include.grant) {
      const grant = tables.mcpGrant.find((g) => g.id === row.grantId);
      out.grant = (include.grant as { include?: unknown }).include
        ? { ...grant, client: tables.mcpClient.find((c) => c.id === grant?.clientId) }
        : grant;
    }
    if (include.client) out.client = tables.mcpClient.find((c) => c.id === row.clientId);
    return out;
  };
  const model = (name: string) => ({
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `${name}-${++seq}`, createdAt: new Date(), ...data } as Row;
      for (const key of ['usedAt', 'consumedAt', 'revokedAt', 'lastUsedAt']) row[key] ??= null;
      tables[name].push(row);
      return row;
    }),
    createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      for (const d of data)
        tables[name].push({ id: `${name}-${++seq}`, usedAt: null, ...d } as Row);
      return { count: data.length };
    }),
    findUnique: jest.fn(
      async ({
        where,
        include,
      }: {
        where: Record<string, unknown>;
        include?: Record<string, unknown>;
      }) =>
        withInclude(
          name,
          tables[name].find((r) => matches(r, where)),
          include,
        ),
    ),
    findUniqueOrThrow: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const row = tables[name].find((r) => matches(r, where));
      if (!row) throw new Error('not found');
      return row;
    }),
    findFirst: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        tables[name].find((r) => matches(r, where)) ?? null,
    ),
    findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      tables[name]
        .filter((r) => matches(r, where))
        .map((r) => withInclude(name, r, { client: true })),
    ),
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const row = tables[name].find((r) => matches(r, where));
        if (row) Object.assign(row, data);
        return row;
      },
    ),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const rows = tables[name].filter((r) => matches(r, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    ),
    deleteMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const before = tables[name].length;
      tables[name] = tables[name].filter((r) => !matches(r, where));
      return { count: before - tables[name].length };
    }),
  });
  const prisma: Record<string, unknown> = Object.fromEntries(
    Object.keys(tables).map((name) => [name, model(name)]),
  );
  prisma.$transaction = jest.fn(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
  return { prisma: prisma as unknown as PrismaService, tables };
}

const ISSUER = 'https://api.mizano.test';
function mcpConfig(): McpConfig {
  const values: Record<string, string> = {
    MCP_PUBLIC_URL: ISSUER,
    FRONTEND_URL: 'https://app.mizano.test',
    NODE_ENV: 'test',
  };
  return new McpConfig({ get: (k: string) => values[k] } as unknown as ConfigService);
}

const ALICE: ConsentUser = {
  id: 'u-a',
  email: 'a@x',
  name: 'Alice',
  organizationId: 'org-a',
  roleId: 'role-a',
};
const BOB: ConsentUser = {
  id: 'u-b',
  email: 'b@x',
  name: 'Bob',
  organizationId: 'org-b',
  roleId: 'role-b',
};
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function setup() {
  const { prisma, tables } = memoryPrisma();
  tables.user.push(
    { id: ALICE.id, organizationId: 'org-a', status: 'ACTIVE', roleId: 'role-a', name: 'Alice' },
    { id: BOB.id, organizationId: 'org-b', status: 'ACTIVE', roleId: 'role-b', name: 'Bob' },
  );
  tables.organization.push({ id: 'org-a', name: 'A' }, { id: 'org-b', name: 'B' });
  const permissions = {
    roleHolds: jest.fn().mockResolvedValue(false),
  } as unknown as PermissionsGuard;
  const service = new McpOAuthService(prisma, mcpConfig(), permissions);
  const client = await service.register({
    client_name: 'Claude',
    redirect_uris: [REDIRECT, 'http://127.0.0.1:33418/callback'],
    token_endpoint_auth_method: 'none',
  });
  return { service, tables, clientId: client.client_id as string };
}

/** authorize → consent → code, as an AI app and the person would. */
async function authorizeAndApprove(
  s: Awaited<ReturnType<typeof setup>>,
  access: 'read' | 'drafts' = 'read',
  user: ConsentUser = ALICE,
) {
  const { verifier, challenge } = pkcePair();
  const outcome = await s.service.authorize(
    {
      response_type: 'code',
      client_id: s.clientId,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'st-1',
      resource: `${ISSUER}/mcp`,
    },
    'en',
  );
  if (!('redirect' in outcome)) throw new Error(`unexpected ${outcome.errorPage}`);
  const handle = outcome.redirect.split('/connect-ai/')[1];
  const { redirectUrl } = await s.service.approve(handle, user, access);
  const back = new URL(redirectUrl);
  expect(back.searchParams.get('state')).toBe('st-1');
  expect(back.searchParams.get('iss')).toBe(ISSUER);
  return { code: back.searchParams.get('code') as string, verifier, handle };
}

describe('MCP OAuth', () => {
  it('requires the PKCE verifier and lets a code be used once (reuse revokes the grant)', async () => {
    const s = await setup();
    const { code, verifier } = await authorizeAndApprove(s);
    const body = {
      grant_type: 'authorization_code',
      client_id: s.clientId,
      code,
      redirect_uri: REDIRECT,
    };

    await expect(
      s.service.token({ ...body, code_verifier: pkcePair().verifier }, undefined),
    ).rejects.toMatchObject({
      error: 'invalid_grant',
    });
    const tokens = await s.service.token({ ...body, code_verifier: verifier }, undefined);
    expect(tokens).toMatchObject({ token_type: 'Bearer', scope: 'mizano:read' });
    expect(await s.service.verifyAccessToken(tokens.access_token as string)).toMatchObject({
      organizationId: 'org-a',
      userId: ALICE.id,
    });

    await expect(
      s.service.token({ ...body, code_verifier: verifier }, undefined),
    ).rejects.toMatchObject({
      error: 'invalid_grant',
    });
    // The replay ended everything the code produced.
    expect(await s.service.verifyAccessToken(tokens.access_token as string)).toBeNull();
    expect(s.tables.mcpGrant[0].revokeReason).toBe('CODE_REUSE');
  });

  it('refuses plain PKCE and missing challenges back to the app, never elsewhere', async () => {
    const s = await setup();
    const outcome = await s.service.authorize(
      {
        response_type: 'code',
        client_id: s.clientId,
        redirect_uri: REDIRECT,
        code_challenge: 'x'.repeat(43),
        code_challenge_method: 'plain',
      },
      undefined,
    );
    expect('redirect' in outcome && new URL(outcome.redirect).searchParams.get('error')).toBe(
      'invalid_request',
    );
  });

  it('checks redirect addresses exactly (loopback may change only the port)', async () => {
    const s = await setup();
    const registered = [REDIRECT, 'http://127.0.0.1:33418/callback'];
    expect(redirectUriAllowed(REDIRECT, registered)).toBe(true);
    expect(redirectUriAllowed(`${REDIRECT}/`, registered)).toBe(false);
    expect(
      redirectUriAllowed('https://claude.ai.evil.test/api/mcp/auth_callback', registered),
    ).toBe(false);
    expect(redirectUriAllowed(`${REDIRECT}?next=x`, registered)).toBe(false);
    expect(redirectUriAllowed('http://127.0.0.1:50123/callback', registered)).toBe(true);
    expect(redirectUriAllowed('http://127.0.0.1:50123/other', registered)).toBe(false);

    // An unregistered address is never redirected to: the person sees an error page instead.
    const outcome = await s.service.authorize(
      {
        response_type: 'code',
        client_id: s.clientId,
        redirect_uri: 'https://evil.test/cb',
        code_challenge: pkcePair().challenge,
        code_challenge_method: 'S256',
      },
      undefined,
    );
    expect(outcome).toEqual({ errorPage: 'bad_redirect' });
    await expect(
      s.service.register({
        redirect_uris: ['http://evil.test/cb'],
        token_endpoint_auth_method: 'none',
      }),
    ).rejects.toBeInstanceOf(OAuthError);

    // The token request must repeat the same address.
    const { code, verifier } = await authorizeAndApprove(s);
    await expect(
      s.service.token(
        {
          grant_type: 'authorization_code',
          client_id: s.clientId,
          code,
          code_verifier: verifier,
          redirect_uri: 'http://127.0.0.1:33418/callback',
        },
        undefined,
      ),
    ).rejects.toMatchObject({ error: 'invalid_grant' });
  });

  it('rotates refresh tokens and revokes the grant when a used one comes back', async () => {
    const s = await setup();
    const { code, verifier } = await authorizeAndApprove(s);
    const first = await s.service.token(
      {
        grant_type: 'authorization_code',
        client_id: s.clientId,
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT,
      },
      undefined,
    );
    const second = await s.service.token(
      { grant_type: 'refresh_token', client_id: s.clientId, refresh_token: first.refresh_token },
      undefined,
    );
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(await s.service.verifyAccessToken(second.access_token as string)).not.toBeNull();

    // The old refresh token again: someone holds a copy, so the whole connection ends.
    await expect(
      s.service.token(
        { grant_type: 'refresh_token', client_id: s.clientId, refresh_token: first.refresh_token },
        undefined,
      ),
    ).rejects.toMatchObject({ error: 'invalid_grant' });
    expect(await s.service.verifyAccessToken(second.access_token as string)).toBeNull();
    await expect(
      s.service.token(
        { grant_type: 'refresh_token', client_id: s.clientId, refresh_token: second.refresh_token },
        undefined,
      ),
    ).rejects.toMatchObject({ error: 'invalid_grant' });
    expect(s.tables.mcpGrant[0].revokeReason).toBe('REFRESH_REUSE');
  });

  it('binds a grant to the signed-in organization and refuses other organizations', async () => {
    const s = await setup();
    const { code, verifier } = await authorizeAndApprove(s, 'read', ALICE);
    const tokens = await s.service.token(
      {
        grant_type: 'authorization_code',
        client_id: s.clientId,
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT,
      },
      undefined,
    );
    const grantId = s.tables.mcpGrant[0].id;
    expect(s.tables.mcpGrant[0].organizationId).toBe('org-a');

    // Bob (org B) neither sees nor can disconnect Alice's connection.
    expect((await s.service.listConnections(BOB)).connections).toEqual([]);
    await expect(s.service.revokeConnection(BOB, grantId)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    // If Alice's user row stops belonging to org A, the token stops working there.
    s.tables.user[0].organizationId = 'org-b';
    expect(await s.service.verifyAccessToken(tokens.access_token as string)).toBeNull();
  });

  it('accepts a token only for this server (audience) and answers a request once', async () => {
    const s = await setup();
    const { code, verifier, handle } = await authorizeAndApprove(s);
    await expect(s.service.approve(handle, ALICE, 'drafts')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const tokens = await s.service.token(
      {
        grant_type: 'authorization_code',
        client_id: s.clientId,
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT,
      },
      undefined,
    );
    s.tables.mcpToken.forEach((t) => (t.resource = 'https://other.test/mcp'));
    expect(await s.service.verifyAccessToken(tokens.access_token as string)).toBeNull();
  });
});

describe('MCP tools', () => {
  const principal = (scopes: string[]): McpPrincipal => ({
    grantId: 'g-1',
    organizationId: 'org-a',
    userId: ALICE.id,
    roleId: 'role-a',
    scopes,
    clientId: 'c',
    locale: 'en',
    expiresAt: new Date(Date.now() + 60_000),
  });

  function server() {
    const tools = {
      draftInvoice: jest
        .fn()
        .mockResolvedValue({ summary: { ar: 'م', en: 'd' }, data: { id: 'inv-1' } }),
      findCustomers: jest
        .fn()
        .mockResolvedValue({ summary: { ar: 'ع', en: 'c' }, data: { customers: [] } }),
    } as unknown as McpToolsService;
    const permissions = {
      roleHolds: jest.fn().mockResolvedValue(true),
    } as unknown as PermissionsGuard;
    const prisma = {
      mcpToolCall: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    return { svc: new McpServerService(tools, permissions, prisma), tools, prisma };
  }

  it('a read-only connection cannot create drafts and does not even see the draft tools', async () => {
    const { svc, tools, prisma } = server();
    const draft = MCP_TOOLS.find((t) => t.name === 'draft_invoice')!;
    const result = await svc.call(draft, principal(['mizano:read']), {
      customerId: 'c-1',
      lines: [],
    });
    expect(result.isError).toBe(true);
    expect(tools.draftInvoice).not.toHaveBeenCalled();
    expect((prisma.mcpToolCall.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
      tool: 'draft_invoice',
      success: false,
      errorCode: 'INSUFFICIENT_SCOPE',
      organizationId: 'org-a',
    });

    // Over the real SDK: tools/list for a read-only token has no draft_* tool.
    const handler = (
      svc as unknown as { handler: { fetch: (r: Request, o: unknown) => Promise<Response> } }
    ).handler;
    const authInfo = {
      token: 't',
      clientId: 'c',
      scopes: ['mizano:read'],
      extra: { principal: principal(['mizano:read']) },
    };
    const response = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      }),
      { authInfo },
    );
    // The 2025-era stateless answer is a one-event stream: `event: message` + `data: {…}`.
    const raw = await response.text();
    const json = raw.trimStart().startsWith('{') ? raw : (/^data: (.*)$/m.exec(raw)?.[1] ?? '{}');
    const body = JSON.parse(json) as {
      result?: { tools: Array<{ name: string; annotations?: Record<string, unknown> }> };
    };
    const names = body.result?.tools.map((t) => t.name) ?? [];
    expect(names).toContain('find_customers');
    expect(names.some((n) => n.startsWith('draft_'))).toBe(false);
    expect(body.result?.tools.find((t) => t.name === 'find_customers')?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
  });

  it('a drafts connection can prepare a draft, and every call is logged without its arguments', async () => {
    const { svc, tools, prisma } = server();
    const draft = MCP_TOOLS.find((t) => t.name === 'draft_invoice')!;
    const result = await svc.call(draft, principal(['mizano:read', 'mizano:drafts']), {
      customerId: 'c-1',
    });
    expect(result.isError).toBeUndefined();
    expect(tools.draftInvoice).toHaveBeenCalled();
    const logged = (prisma.mcpToolCall.create as jest.Mock).mock.calls[0][0].data;
    expect(Object.keys(logged).sort()).toEqual(
      ['durationMs', 'errorCode', 'grantId', 'organizationId', 'success', 'tool', 'userId'].sort(),
    );
  });
});

describe('Arabic search keys', () => {
  it('folds hamza, alef maqsura, taa marbuta, tashkeel, tatweel and Arabic-Indic digits', () => {
    expect(normalizeArabic('أحمَـد')).toBe(normalizeArabic('احمد'));
    expect(normalizeArabic('مكتبة إيمان')).toBe('مكتبه ايمان');
    expect(normalizeArabic('مصطفى ٣٤')).toBe('مصطفي 34');
    expect(containsPattern('50%_off')).toBe('%50\\%\\_off%');
  });
});
