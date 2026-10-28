import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WebhookDeliveryStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateApiKeyDto,
  CreateWebhookEndpointDto,
  DeliveryQueryDto,
  UpdateWebhookEndpointDto,
} from '../dto/integration-settings.dto';
import {
  INTEGRATION_API_VERSION,
  INTEGRATION_SCOPES,
  IntegrationScope,
  SCOPE_PERMISSION,
  TEST_EVENT_TYPE,
  WEBHOOK_EVENT_TYPES,
} from '../integration-catalog';
import { generateApiKey } from '../utils/api-key';
import { integrationsEncryptionConfigured, sealSecret, secretHint } from '../utils/secret-box';
import { assertPublicWebhookUrl } from '../utils/url-safety';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookOutboxService } from './webhook-outbox.service';

const MAX_ACTIVE_KEYS = 20;
const MAX_ENDPOINTS = 20;

const KEY_SELECT = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  rateLimitPerMinute: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  createdById: true,
} satisfies Prisma.IntegrationApiKeySelect;

const ENDPOINT_SELECT = {
  id: true,
  name: true,
  url: true,
  secretHint: true,
  eventTypes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WebhookEndpointSelect;

/** Settings-screen operations (JWT + settings permissions). Never returns stored secrets. */
@Injectable()
export class IntegrationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: WebhookOutboxService,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  catalog(): {
    apiVersion: string;
    eventTypes: readonly string[];
    scopes: readonly string[];
    encryptionConfigured: boolean;
  } {
    return {
      apiVersion: INTEGRATION_API_VERSION,
      eventTypes: WEBHOOK_EVENT_TYPES,
      scopes: INTEGRATION_SCOPES,
      encryptionConfigured: integrationsEncryptionConfigured(),
    };
  }

  // ── API keys ──────────────────────────────────────────

  listKeys(organizationId: string) {
    return this.prisma.integrationApiKey.findMany({
      where: { organizationId },
      select: KEY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Returns the plaintext key exactly once. */
  async createKey(
    organizationId: string,
    user: { id: string; roleId: string },
    dto: CreateApiKeyDto,
  ) {
    await this.assertRoleGrantsScopes(
      organizationId,
      user.roleId,
      dto.scopes as IntegrationScope[],
    );
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('expiresAt must be in the future');
    }
    const active = await this.prisma.integrationApiKey.count({
      where: { organizationId, revokedAt: null },
    });
    if (active >= MAX_ACTIVE_KEYS) {
      throw new ConflictException(`At most ${MAX_ACTIVE_KEYS} active keys; revoke one first`);
    }
    const { key, prefix, hash } = generateApiKey();
    const row = await this.prisma.integrationApiKey.create({
      data: {
        organizationId,
        createdById: user.id,
        name: dto.name.trim(),
        prefix,
        keyHash: hash,
        scopes: dto.scopes,
        rateLimitPerMinute: dto.rateLimitPerMinute ?? 120,
        expiresAt,
      },
      select: KEY_SELECT,
    });
    return { ...row, key };
  }

  async revokeKey(organizationId: string, id: string) {
    const { count } = await this.prisma.integrationApiKey.updateMany({
      where: { id, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.integrationApiKey.count({ where: { id, organizationId } });
      if (!exists) throw new NotFoundException('API key not found');
    }
    return this.prisma.integrationApiKey.findFirstOrThrow({
      where: { id, organizationId },
      select: KEY_SELECT,
    });
  }

  // ── Webhook endpoints ─────────────────────────────────

  listEndpoints(organizationId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { organizationId, deletedAt: null },
      select: ENDPOINT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createEndpoint(organizationId: string, userId: string, dto: CreateWebhookEndpointDto) {
    await assertPublicWebhookUrl(dto.url);
    const count = await this.prisma.webhookEndpoint.count({
      where: { organizationId, deletedAt: null },
    });
    if (count >= MAX_ENDPOINTS) {
      throw new ConflictException(`At most ${MAX_ENDPOINTS} webhook endpoints`);
    }
    const id = randomUUID();
    return this.prisma.webhookEndpoint.create({
      data: {
        id,
        organizationId,
        createdById: userId,
        name: dto.name.trim(),
        url: dto.url.trim(),
        secretCiphertext: sealSecret(dto.secret, `${organizationId}:${id}`),
        secretHint: secretHint(dto.secret),
        eventTypes: dto.eventTypes,
      },
      select: ENDPOINT_SELECT,
    });
  }

  async updateEndpoint(organizationId: string, id: string, dto: UpdateWebhookEndpointDto) {
    await this.ownedEndpoint(organizationId, id);
    if (dto.url !== undefined) await assertPublicWebhookUrl(dto.url);
    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.url !== undefined ? { url: dto.url.trim() } : {}),
        ...(dto.eventTypes !== undefined ? { eventTypes: dto.eventTypes } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.secret !== undefined
          ? {
              secretCiphertext: sealSecret(dto.secret, `${organizationId}:${id}`),
              secretHint: secretHint(dto.secret),
            }
          : {}),
      },
      select: ENDPOINT_SELECT,
    });
  }

  /** Soft delete; queued deliveries to it fail on their next attempt. */
  async deleteEndpoint(organizationId: string, id: string) {
    await this.ownedEndpoint(organizationId, id);
    await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Webhook endpoint deleted' };
  }

  /** Sends a signed `mizano.test` event now and reports the outcome of the first attempt. */
  async sendTest(organizationId: string, id: string) {
    const endpoint = await this.ownedEndpoint(organizationId, id);
    if (!endpoint.isActive) throw new BadRequestException('Enable the endpoint before testing it');
    const eventId = await this.outbox.record(
      this.prisma,
      organizationId,
      TEST_EVENT_TYPE,
      { message: 'Test event from Mizano. If a FlowLine run started, the connection works.' },
      { endpointIds: [id], source: { type: 'user' } },
    );
    await this.dispatcher.processDue();
    const delivery = await this.prisma.webhookDelivery.findFirstOrThrow({
      where: { organizationId, eventId: eventId ?? '', endpointId: id },
      select: {
        id: true,
        eventId: true,
        status: true,
        attempts: true,
        lastStatusCode: true,
        lastError: true,
        nextAttemptAt: true,
      },
    });
    return delivery;
  }

  // ── Delivery log ──────────────────────────────────────

  async listDeliveries(organizationId: string, query: DeliveryQueryDto) {
    const rows = await this.prisma.webhookDelivery.findMany({
      where: {
        organizationId,
        ...(query.endpointId ? { endpointId: query.endpointId } : {}),
        ...(query.status ? { status: query.status as WebhookDeliveryStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 25,
      select: {
        id: true,
        eventId: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        nextAttemptAt: true,
        lastStatusCode: true,
        lastError: true,
        deliveredAt: true,
        createdAt: true,
        event: { select: { type: true } },
        endpoint: { select: { id: true, name: true } },
        attemptLog: {
          orderBy: { attempt: 'desc' },
          take: 5,
          select: {
            attempt: true,
            statusCode: true,
            error: true,
            durationMs: true,
            createdAt: true,
          },
        },
      },
    });
    return rows.map(({ event, ...r }) => ({ ...r, eventType: event.type }));
  }

  /** Queues a FAILED (or stuck) delivery again with the same event id: the receiver dedupes. */
  async redeliver(organizationId: string, id: string) {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true, attempts: true },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.status === WebhookDeliveryStatus.DELIVERING) {
      throw new ConflictException('Delivery is in progress');
    }
    const { count } = await this.prisma.webhookDelivery.updateMany({
      where: { id, organizationId, status: delivery.status },
      data: {
        status: WebhookDeliveryStatus.PENDING,
        nextAttemptAt: new Date(),
        maxAttempts: delivery.attempts + 3,
      },
    });
    if (count === 0) throw new ConflictException('Delivery changed concurrently');
    void this.dispatcher.processDue();
    return { id, status: WebhookDeliveryStatus.PENDING };
  }

  // ── helpers ───────────────────────────────────────────

  private async ownedEndpoint(organizationId: string, id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!endpoint) throw new NotFoundException('Webhook endpoint not found');
    return endpoint;
  }

  /** A key may never carry more than its creator's role allows. */
  private async assertRoleGrantsScopes(
    organizationId: string,
    roleId: string,
    scopes: IntegrationScope[],
  ): Promise<void> {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
      include: { permissions: true },
    });
    if (!role) throw new ForbiddenException('Role not found');
    if (role.name === 'Admin') return;
    for (const scope of scopes) {
      const [module, action] = SCOPE_PERMISSION[scope].split('.');
      const granted = role.permissions.some(
        (p) => p.module === module && p.actions.includes(action),
      );
      if (!granted) {
        throw new ForbiddenException(
          `Your role lacks ${SCOPE_PERMISSION[scope]}, required for scope ${scope}`,
        );
      }
    }
  }
}
