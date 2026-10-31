import { ConfigService } from '@nestjs/config';
import { McpConfig } from './mcp.config';

function config(values: Record<string, string> = {}): McpConfig {
  const settings = new ConfigService();
  const isolated = { NODE_ENV: 'production', ...values } as Record<string, string>;
  jest.spyOn(settings, 'get').mockImplementation((key: string) => isolated[key]);
  return new McpConfig(settings);
}

describe('MCP public origin', () => {
  it('prefers the explicit MCP origin over both existing API settings', () => {
    expect(
      config({
        MCP_PUBLIC_URL: ' https://MCP.example.com/ ',
        PUBLIC_API_URL: 'https://pi.example.com/api',
        NEXT_PUBLIC_API_URL: 'https://server.example.com/api',
      }).issuer,
    ).toBe('https://mcp.example.com');
  });

  it('uses the Pi public API address before the server setting', () => {
    const subject = config({
      MCP_PUBLIC_URL: ' ',
      PUBLIC_API_URL: ' https://Pi.example.com/api/ ',
      NEXT_PUBLIC_API_URL: 'https://server.example.com/api',
    });
    expect(subject.issuer).toBe('https://pi.example.com');
    expect(subject.resource).toBe('https://pi.example.com/mcp');
    expect(subject.resourceMetadataUrl).toBe(
      'https://pi.example.com/.well-known/oauth-protected-resource/mcp',
    );
  });

  it('uses the existing server URL with its REST prefix removed', () => {
    expect(config({ NEXT_PUBLIC_API_URL: 'https://server.example.com:8443/api' }).issuer).toBe(
      'https://server.example.com:8443',
    );
  });

  it.each(['https://api.example.com', 'https://api.example.com/'])(
    'also accepts a public API origin: %s',
    (url) => {
      expect(config({ PUBLIC_API_URL: url }).issuer).toBe('https://api.example.com');
    },
  );

  it.each([
    'https://api.example.com/other',
    'https://user:pass@api.example.com/api',
    'https://api.example.com/api?secret=value',
    'https://api.example.com/api#fragment',
    'file:///api',
    '/api',
  ])('keeps MCP off for an invalid fallback without failing the API: %s', (url) => {
    expect(config({ PUBLIC_API_URL: url }).issuer).toBeNull();
  });

  it('does not relax the explicit origin validation', () => {
    expect(() => config({ MCP_PUBLIC_URL: 'https://api.example.com/api' }).issuer).toThrow();
  });

  it('keeps production off for the legacy HTTP API fallback', () => {
    expect(config({ NEXT_PUBLIC_API_URL: 'http://203.0.113.5:6001/api' }).enabled).toBe(false);
    expect(config({ PUBLIC_API_URL: 'http://203.0.113.5:6001/api' }).resource).toBeNull();
  });

  it('allows HTTP fallback addresses during local development', () => {
    expect(
      config({ NODE_ENV: 'development', PUBLIC_API_URL: 'http://localhost:6001/api' }).issuer,
    ).toBe('http://localhost:6001');
  });

  it('keeps production off when no public API address exists', () => {
    expect(config().enabled).toBe(false);
  });

  it('keeps the local port fallback', () => {
    expect(config({ NODE_ENV: 'development', API_PORT: '6002' }).issuer).toBe(
      'http://localhost:6002',
    );
  });
});
