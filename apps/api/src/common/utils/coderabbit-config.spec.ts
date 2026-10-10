/**
 * Configuration regression test for .coderabbit.yaml
 * Ensures the CodeRabbit configuration matches the intended policy.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('CodeRabbit configuration', () => {
  // Find the repo root by looking for .coderabbit.yaml
  let configPath = '';
  let currentDir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(currentDir, '.coderabbit.yaml');
    if (fs.existsSync(candidate)) {
      configPath = candidate;
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  if (!configPath) {
    throw new Error('Could not find .coderabbit.yaml in parent directories');
  }

  it('should have auto_incremental_review enabled to match PR description', () => {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents) as Record<string, unknown>;

    const reviews = config.reviews as Record<string, unknown>;
    const autoReview = reviews.auto_review as Record<string, unknown>;
    const autoIncrementalReview = autoReview.auto_incremental_review;

    // PR description: "auto-review on non-draft PRs of master with incremental reviews"
    expect(autoIncrementalReview).toBe(true);
  });

  it('should have request_changes_workflow enabled for blocking reviews', () => {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents) as Record<string, unknown>;

    const reviews = config.reviews as Record<string, unknown>;
    const requestChangesWorkflow = reviews.request_changes_workflow;

    expect(requestChangesWorkflow).toBe(true);
  });

  it('should have auto_review enabled for non-draft PRs on master', () => {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents) as Record<string, unknown>;

    const reviews = config.reviews as Record<string, unknown>;
    const autoReview = reviews.auto_review as Record<string, unknown>;

    expect(autoReview.enabled).toBe(true);
    expect(autoReview.drafts).toBe(false);
    expect(autoReview.base_branches).toEqual(['master']);
  });

  it('should have path_filters configured to skip lockfiles and build output', () => {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents) as Record<string, unknown>;

    const reviews = config.reviews as Record<string, unknown>;
    const pathFilters = reviews.path_filters as string[];

    expect(pathFilters).toContain('!**/*.lock');
    expect(pathFilters).toContain('!**/pnpm-lock.yaml');
    expect(pathFilters).toContain('!**/package-lock.json');
    expect(pathFilters).toContain('!**/node_modules/**');
    expect(pathFilters).toContain('!**/dist/**');
    expect(pathFilters).toContain('!**/build/**');
  });

  it('should have free linters enabled', () => {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents) as Record<string, unknown>;

    const reviews = config.reviews as Record<string, unknown>;
    const tools = reviews.tools as Record<string, unknown>;

    expect(tools.eslint).toEqual({ enabled: true });
    expect(tools.ruff).toEqual({ enabled: true });
    expect(tools.hadolint).toEqual({ enabled: true });
    expect(tools.shellcheck).toEqual({ enabled: true });
    expect(tools.yamllint).toEqual({ enabled: true });
    expect(tools.gitleaks).toEqual({ enabled: true });
    expect(tools.actionlint).toEqual({ enabled: true });
    expect(tools.markdownlint).toEqual({ enabled: true });
  });
});
