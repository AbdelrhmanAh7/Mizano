/**
 * Configuration regression test for .github/workflows/deploy.yml (#113, MZ #102).
 * The GCP deploy host is unreachable, so an automatic deploy after every green
 * CI run on master fails its SSH step and turns master red. Deploys stay
 * manual until DEPLOY #25 re-enables them after a connectivity check.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('Deploy workflow triggers', () => {
  let workflowPath = '';
  let currentDir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(currentDir, '.github', 'workflows', 'deploy.yml');
    if (fs.existsSync(candidate)) {
      workflowPath = candidate;
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  if (!workflowPath) {
    throw new Error('Could not find .github/workflows/deploy.yml in parent directories');
  }

  const workflow = yaml.load(fs.readFileSync(workflowPath, 'utf8')) as Record<string, unknown>;
  const triggers = workflow.on as Record<string, unknown>;

  it('runs only on manual dispatch, never after CI or on push, release or pull request', () => {
    expect(Object.keys(triggers)).toEqual(['workflow_dispatch']);
  });

  it('points to the issue that owns re-enabling automatic deploys', () => {
    expect(fs.readFileSync(workflowPath, 'utf8')).toMatch(/DEPLOY #25/);
  });
});
