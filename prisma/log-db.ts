import { PrismaClient as LogPrismaClient } from '.prisma/log-client/edge';
import { PrismaD1 } from '@prisma/adapter-d1';
import { getDatabaseBinding, getRequestDatabaseClients } from '@/src/lib/cloudflare/runtime';
import { lazyRequestClient } from './request-client';

// Optional logs share primary D1. Keep ENABLE_LOG off for cost/data minimization.
export default lazyRequestClient<LogPrismaClient>(() => {
  const clients = getRequestDatabaseClients();
  let client = clients.get('logs') as LogPrismaClient | undefined;
  if (!client) {
    client = new LogPrismaClient({ adapter: new PrismaD1(getDatabaseBinding()), log: ['error'] });
    clients.set('logs', client);
  }
  return client;
});
