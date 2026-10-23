import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('Root Files Hygiene Guard', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const aiQuestionsPath = path.join(rootDir, 'AI_QUESTIONS.md');
  const gitignorePath = path.join(rootDir, '.gitignore');

  it('asserts AI_QUESTIONS.md is not tracked in git repository index', () => {
    const tracked = execSync('git ls-files AI_QUESTIONS.md', {
      cwd: rootDir,
      encoding: 'utf8',
    }).trim();
    expect(tracked).toBe('');
  });

  it('asserts AI_QUESTIONS.md does not exist at repository root', () => {
    const exists = fs.existsSync(aiQuestionsPath);
    expect(exists).toBe(false);
  });

  it('asserts .gitignore contains /AI_QUESTIONS.md ignore rule', () => {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const hasIgnoreRule = gitignoreContent
      .split('\n')
      .map((line) => line.trim())
      .some((line) => line === '/AI_QUESTIONS.md' || line === 'AI_QUESTIONS.md');
    expect(hasIgnoreRule).toBe(true);
  });

  it('asserts local AI_QUESTIONS.md scratch file is ignored by git status', () => {
    const dummyContent = '# Temporary scratch questions\n';
    const existedBefore = fs.existsSync(aiQuestionsPath);

    try {
      if (!existedBefore) {
        fs.writeFileSync(aiQuestionsPath, dummyContent, 'utf8');
      }

      const gitStatus = execSync('git status --porcelain AI_QUESTIONS.md', {
        cwd: rootDir,
        encoding: 'utf8',
      }).trim();

      // Because /AI_QUESTIONS.md is ignored, git status should report nothing
      expect(gitStatus).toBe('');
    } finally {
      if (!existedBefore && fs.existsSync(aiQuestionsPath)) {
        fs.unlinkSync(aiQuestionsPath);
      }
    }
  });
});
