import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { init, parse } from 'es-module-lexer';

await init;

const root = resolve('dist/server');
const config = JSON.parse(readFileSync(join(root, 'wrangler.json'), 'utf8'));
assert(existsSync(join(root, config.main)), 'Generated Worker entry must exist');
assert(existsSync(join(root, 'ssr/index.js')), 'SSR loader must address an emitted module');

function modules(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? modules(file) : /\.(?:js|mjs)$/.test(file) ? [file] : [];
  });
}

let checked = 0;
for (const file of modules(root)) {
  const source = readFileSync(file, 'utf8');
  // Verify literal relative static/dynamic imports, including imports kept
  // external between Vite's RSC and SSR environments. Local Vite can resolve
  // extensions differently from Cloudflare's deployed module registry.
  const [imports] = parse(source);
  for (const entry of imports) {
    // specifier is null for dynamic expressions and template literals;
    // accept constant backtick imports emitted by Rolldown as well.
    const expression = source.slice(entry.start, entry.end);
    const specifier = entry.specifier ?? (/^`[^`$]+`$/.test(expression) ? expression.slice(1, -1) : undefined);
    if (!specifier || !/^\.{1,2}\//.test(specifier)) continue;
    const target = resolve(dirname(file), specifier);
    assert(existsSync(target), `Missing emitted module ${specifier} imported by ${file}`);
    checked++;
  }
}
console.log(`Verified ${checked} emitted Worker module references`);
