// service-c: works with tags, which live on the same shared schema. No copy
// of the schema, no migrations — just `import { prisma } from '@myorg/db-schema'`.

import express from 'express';
import { prisma } from '@myorg/db-schema';

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3003);
const SERVICE = process.env.SERVICE_NAME ?? 'service-c';

app.get('/health', (_req, res) => {
  res.json({ service: SERVICE, status: 'ok' });
});

app.get('/tags', async (_req, res) => {
  try {
    const tags = await prisma.tag.findMany({
      include: { item: true },
      orderBy: { name: 'asc' },
    });
    res.json({ service: SERVICE, tags });
  } catch (err) {
    res.status(500).json({ service: SERVICE, error: (err as Error).message });
  }
});

app.post('/tags', async (req, res) => {
  try {
    const { name, itemId } = req.body ?? {};
    const tag = await prisma.tag.create({
      data: {
        name: String(name ?? 'untagged'),
        itemId: String(itemId),
      },
      include: { item: true },
    });
    res.status(201).json({ service: SERVICE, tag });
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
