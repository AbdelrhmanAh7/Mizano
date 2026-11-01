import { readdirSync } from 'fs';
import { join } from 'path';
import { CRUMBS_WITHOUT_PAGE } from './breadcrumb-paths';

const root = join(__dirname, '..', 'app', '[locale]', '(dashboard)');

/** Folders that hold other folders but no page.tsx (the breadcrumb would link to a 404). */
function foldersWithoutPage(dir: string, prefix = ''): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory());
  const subfolders = folders.filter((e) => !e.name.startsWith('['));
  const found: string[] = [];
  // A folder holding only a [id] page (a details page) still has a crumb of its own.
  if (prefix && folders.length > 0 && !entries.some((e) => e.name === 'page.tsx')) {
    found.push(prefix);
  }
  for (const folder of subfolders) {
    found.push(...foldersWithoutPage(join(dir, folder.name), `${prefix}/${folder.name}`));
  }
  return found;
}

describe('breadcrumb links (#632)', () => {
  it('lists every dashboard folder that has no page of its own', () => {
    expect(foldersWithoutPage(root).sort()).toEqual([...CRUMBS_WITHOUT_PAGE].sort());
  });
});
