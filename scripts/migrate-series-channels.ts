/**
 * One-time migration: collapse per-meeting channels for recurring series into
 * a single shared series channel.
 *
 * For each seriesId:
 *   1. Find all meetings in the series that have an individual channel (meetingId set).
 *   2. Pick the oldest channel as the canonical series channel.
 *   3. Re-attribute all messages from the other channels to the canonical one.
 *   4. Update all meetings in the series to set seriesChannelId = canonical channel id.
 *   5. Null out meetingId on the canonical channel (it now belongs to the series, not one meeting).
 *   6. Delete the redundant per-meeting channels.
 *
 * Run with:
 *   npx tsx scripts/migrate-series-channels.ts
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (!existsSync(".env")) throw new Error("No .env file found");
  const content = readFileSync(".env", "utf8");
  const match = content.match(/^DATABASE_URL=(.*)$/m);
  if (!match) throw new Error("DATABASE_URL not found in .env");
  return match[1].trim().replace(/^["']|["']$/g, "");
}

const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  // Find all series that still have per-meeting channels
  const seriesMeetings = await prisma.meeting.findMany({
    where: {
      seriesId: { not: null },
      channel: { isNot: null },
    },
    select: {
      id: true,
      seriesId: true,
      channel: { select: { id: true, createdAt: true } },
    },
    orderBy: { seriesIndex: "asc" },
  });

  // Group by seriesId
  const bySeriesId = new Map<string, typeof seriesMeetings>();
  for (const m of seriesMeetings) {
    if (!m.seriesId) continue;
    const arr = bySeriesId.get(m.seriesId) ?? [];
    arr.push(m);
    bySeriesId.set(m.seriesId, arr);
  }

  console.log(`Found ${bySeriesId.size} series to migrate.`);

  for (const [seriesId, meetings] of bySeriesId) {
    // Sort by channel.createdAt ascending — pick oldest as canonical
    const sorted = meetings
      .filter((m) => m.channel)
      .sort((a, b) => a.channel!.createdAt.getTime() - b.channel!.createdAt.getTime());

    if (sorted.length === 0) continue;

    const canonical = sorted[0].channel!;
    const redundant = sorted.slice(1).map((m) => m.channel!.id);
    console.log(
      `Series ${seriesId}: canonical channel ${canonical.id}, collapsing ${redundant.length} channels.`,
    );

    await prisma.$transaction(async (tx) => {
      // Move messages from redundant channels to canonical
      if (redundant.length > 0) {
        await tx.message.updateMany({
          where: { channelId: { in: redundant } },
          data: { channelId: canonical.id },
        });

        // Move ChannelLastRead records (keep the most recent per user)
        const lastReads = await tx.channelLastRead.findMany({
          where: { channelId: { in: redundant } },
        });
        for (const lr of lastReads) {
          await tx.channelLastRead.upsert({
            where: { channelId_userId: { channelId: canonical.id, userId: lr.userId } },
            create: { channelId: canonical.id, userId: lr.userId, readAt: lr.readAt },
            update: { readAt: lr.readAt },
          });
        }

        // Delete redundant channels (cascades reactions, polls)
        await tx.channel.deleteMany({ where: { id: { in: redundant } } });
      }

      // Detach canonical channel from its specific meeting (it now belongs to the series)
      await tx.channel.update({
        where: { id: canonical.id },
        data: { meetingId: null },
      });

      // Point all meetings in this series to the canonical channel
      await tx.meeting.updateMany({
        where: { seriesId },
        data: { seriesChannelId: canonical.id },
      });
    });

    console.log(`  Done.`);
  }

  console.log("Migration complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
