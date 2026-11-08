// service-a: reads and creates items. The PrismaClient comes from the shared
// @myorg/db-schema package — this service owns no schema and no migrations.

import express from 'express';
import { prisma } from '@myorg/db-schema';

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3001);
const SERVICE = process.env.SERVICE_NAME ?? 'service-a';

app.get('/health', (_req, res) => {
  res.json({ service: SERVICE, status: 'ok' });
});

app.get('/items', async (_req, res) => {
  try {
    const items = await prisma.item.findMany({
      include: { tags: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ service: SERVICE, items });
  } catch (err) {
    res.status(500).json({ service: SERVICE, error: (err as Error).message });
  }
});

app.post('/items', async (req, res) => {
  try {
    const { name, quantity } = req.body ?? {};
    const item = await prisma.item.create({
      data: {
        name: String(name ?? 'untitled'),
        quantity: Number(quantity) || 0,
      },
    });
    res.status(201).json({ service: SERVICE, item });
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
