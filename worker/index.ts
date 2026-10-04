import app from 'vinext/server/fetch-handler';
import { withDatabaseScope } from '../src/lib/cloudflare/runtime';

export default {
  fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    return withDatabaseScope(env.DB, () => app.fetch(request, env, ctx));
  },
};
