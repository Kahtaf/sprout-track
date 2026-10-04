// Bindings only: don't replace the browser DOM's Request/Response declarations
// throughout the React app with Worker-specific global runtime types.
type D1Database = import('@cloudflare/workers-types').D1Database;
type ExecutionContext = import('@cloudflare/workers-types').ExecutionContext;
type Fetcher = import('@cloudflare/workers-types').Fetcher;
