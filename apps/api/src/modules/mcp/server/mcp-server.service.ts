import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  UnprocessableEntityException,
} from '@nestjs/common';
import { toNodeHandler } from '@modelcontextprotocol/node';
import {
  AuthInfo,
  CallToolResult,
  McpHttpHandler,
  McpServer,
  createMcpHandler,
  fromJsonSchema,
} from '@modelcontextprotocol/server';
import { IncomingMessage, ServerResponse } from 'http';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { describeError } from '../../../common/utils/redact';
import { PrismaService } from '../../../prisma/prisma.service';
import { scopeSatisfied } from '../mcp.config';
import { McpPrincipal } from '../oauth/mcp-oauth.service';
import { MCP_TOOLS, McpToolDef, MissingPermission } from './mcp-tool-catalog';
import { MCP_TEXT, say } from './mcp-text';
import { Args, McpToolsService, ToolInputError, ToolNotFoundError } from './mcp-tools.service';

const INSTRUCTIONS =
  'Mizano is the accounting system of this business. Use the find_* tools to get ids before ' +
  'preparing drafts. Amounts are decimal strings in the organization currency. Draft tools only ' +
  'save drafts: a person reviews and posts them in Mizano, so share the returned link. Answer ' +
  'in the language the user writes in.';

type ToolOutcome = { result: CallToolResult; errorCode: string | null };

/**
 * The MCP endpoint behind /mcp: one stateless McpServer per request (createMcpHandler), so a
 * request can only ever see the tools and organization of the token that sent it.
 */
@Injectable()
export class McpServerService implements OnModuleDestroy {
  private readonly logger = new Logger(McpServerService.name);
  private readonly handler: McpHttpHandler;
  private readonly nodeHandler: (
    req: IncomingMessage,
    res: ServerResponse,
    body?: unknown,
  ) => Promise<void>;

  constructor(
    private readonly tools: McpToolsService,
    private readonly permissions: PermissionsGuard,
    private readonly prisma: PrismaService,
  ) {
    const onerror = (error: Error): void =>
      this.logger.warn(`MCP transport: ${describeError(error, { includeMessage: false })}`);
    this.handler = createMcpHandler(({ authInfo }) => this.build(authInfo), { onerror });
    this.nodeHandler = toNodeHandler(this.handler, { onerror });
  }

  async onModuleDestroy(): Promise<void> {
    await this.handler.close();
  }

  /** Serve one verified request; `auth` carries the principal (set by McpController). */
  handle(
    req: IncomingMessage & { auth?: AuthInfo },
    res: ServerResponse,
    body: unknown,
  ): Promise<void> {
    return this.nodeHandler(req, res, body);
  }

  /** Only the tools this connection may use are listed: its access and the person's role. */
  private async build(authInfo: AuthInfo | undefined): Promise<McpServer> {
    const server = new McpServer(
      { name: 'mizano', title: 'Mizano', version: '1.0.0' },
      { instructions: INSTRUCTIONS },
    );
    const principal = authInfo?.extra?.principal as McpPrincipal | undefined;
    if (!principal) return server;
    for (const def of MCP_TOOLS) {
      if (!scopeSatisfied(principal.scopes, def.scope)) continue;
      if (
        def.permissions.length &&
        !(await this.permissions.roleHolds(principal.roleId, def.permissions))
      ) {
        continue;
      }
      server.registerTool(
        def.name,
        {
          title: def.title,
          description: def.description,
          inputSchema: fromJsonSchema<Args>(def.input),
          annotations: {
            title: def.title,
            readOnlyHint: def.readOnly,
            // Drafts add a record and change nothing that exists; no tool deletes or posts.
            destructiveHint: false,
            idempotentHint: def.readOnly,
            openWorldHint: false,
          },
        },
        (args: Args) => this.call(def, principal, args),
      );
    }
    return server;
  }

  /** Runs one tool: checks again (defence in depth), answers in the request language, logs. */
  async call(def: McpToolDef, p: McpPrincipal, args: Args): Promise<CallToolResult> {
    const started = Date.now();
    const outcome = await this.run(def, p, args);
    const durationMs = Date.now() - started;
    this.logger.log(
      `mcp tool=${def.name} org=${p.organizationId} grant=${p.grantId} ${outcome.errorCode ?? 'ok'} ${durationMs}ms`,
    );
    await this.prisma.mcpToolCall
      .create({
        data: {
          organizationId: p.organizationId,
          userId: p.userId,
          grantId: p.grantId,
          tool: def.name,
          success: outcome.errorCode === null,
          errorCode: outcome.errorCode,
          durationMs,
        },
      })
      .catch((e: unknown) =>
        this.logger.warn(`mcp tool log failed: ${describeError(e, { includeMessage: false })}`),
      );
    return outcome.result;
  }

  private async run(def: McpToolDef, p: McpPrincipal, args: Args): Promise<ToolOutcome> {
    const fail = (errorCode: string, message: { ar: string; en: string }): ToolOutcome => ({
      errorCode,
      result: { isError: true, content: [{ type: 'text', text: say(message, p.locale) }] },
    });
    try {
      if (!scopeSatisfied(p.scopes, def.scope)) {
        return fail('INSUFFICIENT_SCOPE', MCP_TEXT.noPermission(def.scope));
      }
      for (const permission of def.permissions) {
        if (!(await this.permissions.roleHolds(p.roleId, [permission]))) {
          return fail('NO_PERMISSION', MCP_TEXT.noPermission(permission));
        }
      }
      const can = (permission: string): Promise<boolean> =>
        this.permissions.roleHolds(p.roleId, [permission]);
      const answer = await def.run(this.tools, p, args ?? {}, can);
      return {
        errorCode: null,
        result: {
          content: [
            {
              type: 'text',
              text: `${say(answer.summary, p.locale)}\n${JSON.stringify(answer.data)}`,
            },
          ],
          structuredContent: answer.data,
        },
      };
    } catch (error) {
      if (error instanceof ToolInputError)
        return fail('INVALID_INPUT', MCP_TEXT.invalid(error.fields.join(', ')));
      if (error instanceof MissingPermission)
        return fail('NO_PERMISSION', MCP_TEXT.noPermission(error.permission));
      if (error instanceof ToolNotFoundError || error instanceof NotFoundException) {
        return fail('NOT_FOUND', MCP_TEXT.notFound);
      }
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof UnprocessableEntityException
      ) {
        // Domain refusals (unknown customer, locked period, wrong currency…) name no values.
        return fail('REFUSED', MCP_TEXT.refused(refusalText(error)));
      }
      this.logger.error(
        `mcp tool ${def.name} failed: ${describeError(error, { includeMessage: false })}`,
      );
      return fail('INTERNAL', MCP_TEXT.failed);
    }
  }
}

function refusalText(
  error: BadRequestException | ConflictException | UnprocessableEntityException,
): string {
  const body = error.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.filter((m) => typeof m === 'string').join('; ');
  return typeof message === 'string' ? message : error.message;
}
