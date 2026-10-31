import { AiFailureKind, AiProviderError, FetchLike } from './ai-provider';

/** Map a provider status and error body to a reason an admin can act on. Never echoes the body. */
export function classifyFailure(status: number, body: string): AiFailureKind {
  const t = body.toLowerCase();
  if (
    status === 402 ||
    /credit balance is too low|insufficient_quota|exceeded your current quota|insufficient credits|billing/.test(
      t,
    )
  ) {
    return 'no_credit';
  }
  if (
    status === 401 ||
    /invalid x-api-key|invalid api key|incorrect api key|invalid_api_key|api key not valid|authentication_error/.test(
      t,
    )
  ) {
    return 'invalid_key';
  }
  if (status === 429 || /rate.?limit|resource_exhausted|overloaded/.test(t)) return 'rate_limited';
  if (
    status === 404 ||
    /model_not_found|not_found_error|does not exist|no endpoints found/.test(t)
  ) {
    return 'model_unavailable';
  }
  if (status === 403 || /permission_denied|forbidden/.test(t)) return 'forbidden';
  if (status === 400 && /api key|api_key/.test(t)) return 'invalid_key';
  if (status >= 500) return 'provider_down';
  return 'bad_response';
}

/**
 * One request to a fixed provider URL. Redirects are never followed (a request that carries a
 * key must not be forwarded anywhere else) and a failure surfaces only as an `AiProviderError`.
 */
export async function requestJson(
  fetchFn: FetchLike,
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: unknown },
  signal: AbortSignal,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: init.method,
      headers:
        init.body === undefined
          ? init.headers
          : { ...init.headers, 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: 'manual',
      signal,
    });
  } catch {
    throw new AiProviderError(signal.aborted ? 'timeout' : 'network');
  }
  if (res.status >= 300 && res.status < 400) throw new AiProviderError('bad_response', res.status);
  let text: string;
  try {
    text = await res.text();
  } catch {
    throw new AiProviderError(signal.aborted ? 'timeout' : 'network', res.status);
  }
  if (!res.ok)
    throw new AiProviderError(classifyFailure(res.status, text.slice(0, 4000)), res.status);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AiProviderError('bad_response', res.status);
  }
}

type Raw = Record<string, unknown>;

export function asRecord(value: unknown): Raw {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};
}

export function asArray(value: unknown): Raw[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
