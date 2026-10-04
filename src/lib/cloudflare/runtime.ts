import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestDatabaseScope {
  binding: D1Database;
  clients: Map<string, unknown>;
}

const requests = new AsyncLocalStorage<RequestDatabaseScope>();

/** Keep Prisma adapters within the request that owns their D1 binding. */
export function withDatabaseScope<T>(binding: D1Database, run: () => T): T {
  return requests.run({ binding, clients: new Map() }, run);
}

export function getDatabaseBinding(): D1Database {
  const scope = requests.getStore();
  if (!scope) throw new Error('Database access requires a Worker request scope');
  return scope.binding;
}

export function getRequestDatabaseClients(): Map<string, unknown> {
  const scope = requests.getStore();
  if (!scope) throw new Error('Database access requires a Worker request scope');
  return scope.clients;
}
