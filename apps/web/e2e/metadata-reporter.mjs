/** Report status and source locations without response bodies or financial values. */
export default class MetadataReporter {
  onError() {
    process.stdout.write('Browser infrastructure/setup failure; no payload diagnostics retained\n');
  }
  onStepEnd(_test, _result, step) {
    if (step.error && step.location) {
      process.stdout.write(`Failed browser step: ${step.location.line}:${step.location.column}\n`);
      const kind = step.error.message?.includes('strict mode violation')
        ? 'ambiguous'
        : step.error.message?.includes('unexpected value')
          ? 'mismatch'
          : step.error.message?.includes('element(s) not found')
            ? 'missing'
            : 'other';
      process.stdout.write(`Browser failure kind: ${kind}\n`);
    }
  }
  onBegin(_config, suite) {
    process.stdout.write(`Selected browser cases: ${suite.allTests().length}\n`);
  }
  onTestEnd(test, result) {
    const rowCount = result.attachments
      ?.find((attachment) => attachment.name === 'aging-row-count')
      ?.body?.toString();
    if (rowCount && /^\d+$/.test(rowCount))
      process.stdout.write(`Aging row matches: ${rowCount}\n`);
    const routesFromFailure = (result.error?.stack ?? '').matchAll(
      /Required route: (GET|POST|PATCH|DELETE|PUT) (\/[a-zA-Z0-9/_-]+) returned (\d{3}) expected (\d{3})/g,
    );
    for (const match of routesFromFailure) process.stdout.write(`${match[0]}\n`);
    const locations = [
      ...(result.error?.stack ?? '').matchAll(/accountant\.journey\.mjs:\d+:\d+/g),
    ].map((match) => match[0]);
    process.stdout.write(`${test.title}: ${result.status} ${[...new Set(locations)].join(', ')}\n`);
    const lastPath = result.attachments
      ?.find((attachment) => attachment.name === 'last-page-path')
      ?.body?.toString();
    if (lastPath && /^\/[a-zA-Z0-9/_-]*$/.test(lastPath))
      process.stdout.write(`Last page path: ${lastPath}\n`);
    const routes = result.attachments
      ?.find((attachment) => attachment.name === 'failed-route-metadata')
      ?.body?.toString();
    for (const route of (routes ?? '').split('\n')) {
      if (/^(GET|POST|PATCH|DELETE|PUT) \/[a-zA-Z0-9/_-]+ [45]\d{2}$/.test(route))
        process.stdout.write(`Failed route: ${route}\n`);
    }
  }

  onEnd(result) {
    process.stdout.write(`Playwright run status: ${result.status}\n`);
  }
}
