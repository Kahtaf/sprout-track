import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

execFileSync(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'types',
  '--include-runtime=false', '--strict-vars=false',
  '--env-interface', 'CloudflareEnv', 'cloudflare-env.d.ts',
], { stdio: 'inherit' });

// Node build tools and tests don't receive Worker bindings. Keep their process
// environment optional while CloudflareEnv retains required request bindings.
const output = readFileSync('cloudflare-env.d.ts', 'utf8').replace(
  /interface ProcessEnv extends (StringifyValues<Pick<Cloudflare\.Env, [^\n]+>>) \{\}/,
  'interface ProcessEnv extends Partial<$1> {}',
);
writeFileSync('cloudflare-env.d.ts', output);
