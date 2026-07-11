import { desc, eq } from "drizzle-orm";
import { db } from "./index.js";
import { sessionSync } from "./schema.js";

export const SESSION_SYNC_USER_ID = "11111111-1111-1111-1111-111111111111";

type SessionSyncInput = {
  userId: string;
  lastSyncData: unknown;
};

export async function upsertSessionSync(input: SessionSyncInput) {
  const [savedSync] = await db.insert(sessionSync).values({
    userId: input.userId,
    lastSyncData: input.lastSyncData,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: sessionSync.userId,
    set: {
      lastSyncData: input.lastSyncData,
      updatedAt: new Date(),
    },
  }).returning();

  return savedSync;
}

export async function fetchFleetRows() {
  return db.select().from(sessionSync).orderBy(desc(sessionSync.updatedAt));
}

export async function getFleetRow(userId = SESSION_SYNC_USER_ID) {
  const [row] = await db.select().from(sessionSync).where(eq(sessionSync.userId, userId)).limit(1);
  return row;
}
