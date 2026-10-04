import { PrismaClient } from '@prisma/client/edge';
import { PrismaD1 } from '@prisma/adapter-d1';
import { getDatabaseBinding, getRequestDatabaseClients } from '@/src/lib/cloudflare/runtime';
import { lazyRequestClient } from '@/prisma/request-client';

// Routes import this without database I/O. Each request owns its own client.
const prisma = lazyRequestClient<PrismaClient>(() => {
  const clients = getRequestDatabaseClients();
  let client = clients.get('main') as PrismaClient | undefined;
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaD1(getDatabaseBinding()), log: ['error'] });
    clients.set('main', client);
  }
  return client;
});

// D1 restore is managed by Wrangler/Cloudflare, not local file replacement.
export async function reconnectPrisma() { await prisma.$disconnect(); }
export default prisma;
