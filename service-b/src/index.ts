// service-b: reports on items. Same shared client, same shared database,
// different responsibility — and still zero migrations of its own.

import express from 'express';
import { prisma } from '@myorg/db-schema';

const app = express();

const PORT = Number(process.env.PORT ?? 3002);
const SERVICE = process.env.SERVICE_NAME ?? 'service-b';

app.get('/health', (_req, res) => {
  res.json({ service: SERVICE, status: 'ok' });
});

app.get('/items', async (_req, res) => {
  try {
    const items = await prisma.item.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json({ service: SERVICE, items });
  } catch (err) {
    res.status(500).json({ service: SERVICE, error: (err as Error).message });
  }
});

app.get('/items/count', async (_req, res) => {
  try {
    const count = await prisma.item.count();
    res.json({ service: SERVICE, count });
  } catch (err) {
    res.status(500).json({ service: SERVICE, error: (err as Error).message });
  }
});

async function main() {
  await prisma.$connect();
  app.listen(PORT, () => {
    console.log(`[${SERVICE}] listening on :${PORT}`);
  });
}

main().catch(async (err) => {
  console.error(`[${SERVICE}] failed to start`, err);
  await prisma.$disconnect();
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
