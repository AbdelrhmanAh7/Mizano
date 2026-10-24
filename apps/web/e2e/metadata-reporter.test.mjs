import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import MetadataReporter from './metadata-reporter.mjs';

test('failure reporter emits status and location without raw payloads', () => {
  const output = [];
  const write = mock.method(process.stdout, 'write', (chunk) => {
    output.push(chunk);
    return true;
  });
  try {
    const reporter = new MetadataReporter();
    reporter.onTestEnd(
      { title: 'synthetic journey' },
      {
        status: 'failed',
        error: { stack: 'private token; total 987654.3210 at accountant.journey.mjs:12:3' },
        attachments: [
          {
            name: 'failed-route-metadata',
            body: Buffer.from(
              'POST /api/bills/fixture/approve 503\nprivate token total 987654.3210',
            ),
          },
        ],
      },
    );
    reporter.onStepEnd(
      {},
      {},
      {
        error: { message: 'private token total 987654.3210' },
        title: 'private token total 987654.3210',
        location: { line: 12, column: 3 },
      },
    );
    reporter.onEnd({ status: 'failed' });
    assert.deepEqual(output, [
      'synthetic journey: failed accountant.journey.mjs:12:3\n',
      'Failed route: POST /api/bills/fixture/approve 503\n',
      'Failed browser step: 12:3\n',
      'Browser failure kind: other\n',
      'Playwright run status: failed\n',
    ]);
  } finally {
    write.mock.restore();
  }
});
