import { get } from 'http';

/** Container readiness must examine the body: /health returns 200 on failure. */
export function probeApiHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      finish(false);
      request.destroy();
    }, 5000);
    function finish(healthy: boolean): void {
      clearTimeout(timer);
      resolve(healthy);
    }
    const request = get('http://127.0.0.1:6001/api/health', (response) => {
      if (response.statusCode !== 200) {
        finish(false);
        response.destroy();
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
        if (body.length > 16384) {
          finish(false);
          response.destroy();
        }
      });
      response.on('error', () => finish(false));
      response.on('aborted', () => finish(false));
      response.on('end', () => {
        try {
          const data: unknown = JSON.parse(body);
          finish(
            typeof data === 'object' &&
              data !== null &&
              'status' in data &&
              data.status === 'healthy',
          );
        } catch {
          finish(false);
        }
      });
    });
    request.on('error', () => finish(false));
  });
}

if (require.main === module) {
  void probeApiHealth().then((healthy) => {
    process.exitCode = healthy ? 0 : 1;
  });
}
