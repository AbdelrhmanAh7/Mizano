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

  it('should not auto-review every push (incremental reviews off, hub requests re-reviews)', () => {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents) as Record<string, unknown>;

    const reviews = config.reviews as Record<string, unknown>;
    const autoReview = reviews.auto_review as Record<string, unknown>;

    // Essentials plan: 5 reviews/hour/repo. One automatic review per PR; follow-up
    // pushes are re-reviewed only when the hub posts `@coderabbitai review`.
    expect(autoReview.auto_incremental_review).toBe(false);
    // Pausing only applies to automatic incremental reviews, so it must stay unset.
    expect(autoReview).not.toHaveProperty('auto_pause_after_reviewed_commits');
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

  it('should never block merges: every pre-merge check is warning-only and noise is off', () => {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents) as Record<string, unknown>;

    const reviews = config.reviews as Record<string, unknown>;
    const preMergeChecks = reviews.pre_merge_checks as Record<string, unknown>;
    const customChecks = preMergeChecks.custom_checks as Array<{ name: string; mode: string }>;

    expect(reviews.profile).toBe('assertive');
    expect(reviews.high_level_summary).toBe(false);
    expect(reviews.poem).toBe(false);
    expect(preMergeChecks.issue_assessment).toEqual({ mode: 'warning' });
    expect(customChecks.length).toBeGreaterThan(0);
    for (const check of customChecks) {
      expect({ name: check.name, mode: check.mode }).toEqual({ name: check.name, mode: 'warning' });
    }
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
