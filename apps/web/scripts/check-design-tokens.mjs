#!/usr/bin/env node
// Design-token guard (docs/DESIGN-SYSTEM.md): fails when code uses a raw Tailwind palette color
// (bg-blue-600, text-red-500, from-teal-50 …) or a hex color literal instead of a token
// (bg-primary, text-destructive, hsl(var(--chart-1)) …). Colors live in app/globals.css only;
// PDF/email colors come from BRAND_COLORS in @mizano/shared-types.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIRS = ['app', 'components', 'lib'];
const EXT = /\.(tsx?|css)$/;
// Tests may hold color strings as data; the tokens file is where colors are defined.
const SKIP = [/\.(spec|test)\.tsx?$/, /^app\/globals\.css$/];
// Files allowed to keep a literal, with the reason. Keep this list short.
const ALLOW = new Map([]);

const PALETTE =
  /(?<![\w-])(?:[a-z0-9-]+(?:\[[^\]]+\])?:)*(?:bg|text|border|ring|ring-offset|from|to|via|fill|stroke|outline|divide|placeholder|accent|caret|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?(?![\w-])/g;
const HEX = /(?:['"`[]|:\s*)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.test(name)) yield p;
  }
}

const problems = [];
for (const d of DIRS) {
  for (const file of walk(join(root, d))) {
    const rel = relative(root, file).split('\\').join('/');
    if (SKIP.some((re) => re.test(rel)) || ALLOW.has(rel)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const re of [PALETTE, HEX]) {
          for (const m of line.matchAll(re)) problems.push(`${rel}:${i + 1}  ${m[0].trim()}`);
        }
      });
  }
}

if (problems.length) {
  console.error(
    `Design tokens: ${problems.length} raw color(s). Use a token (bg-primary, text-destructive, ` +
      `bg-success/10, hsl(var(--chart-1)) …), see docs/DESIGN-SYSTEM.md.\n` +
      problems.join('\n'),
  );
  process.exit(1);
}
console.log('Design tokens: no raw palette colors or hex literals.');
