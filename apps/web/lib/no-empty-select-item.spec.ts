/**
 * Regression for #629: a Radix Select item with an empty value throws and replaced the whole
 * vendor-credit page with an error. Say "nothing to choose" in plain text instead.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const web = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory())
      return e.name === 'node_modules' || e.name === '.next' ? [] : sources(path);
    return /\.tsx$/.test(e.name) && !/\.spec\.tsx$/.test(e.name) ? [path] : [];
  });
}

describe('Select items', () => {
  it('never use an empty string as their value', () => {
    const offenders = ['app', 'components']
      .flatMap((d) => sources(join(web, d)))
      .filter((file) =>
        /<SelectItem[^>]*\bvalue=(""|''|\{''\}|\{""\})/.test(readFileSync(file, 'utf8')),
      );
    expect(offenders).toEqual([]);
  });
});
