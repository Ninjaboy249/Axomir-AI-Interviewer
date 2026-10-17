import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { AuditEventSchema, Db, DbSchema, emptyDb, nowIso } from "./domain";

const dbFile = () => path.resolve(process.cwd(), process.env.APP_DATA_FILE ?? ".data/interviewer-db.json");
const shouldUseMemoryStore = () => process.env.STORE_DRIVER === "memory" || process.env.VERCEL === "1";

declare global {
  var __axomirInterviewDb: Db | undefined;
}

function memoryDb() {
  globalThis.__axomirInterviewDb = DbSchema.parse(globalThis.__axomirInterviewDb ?? emptyDb());
  return globalThis.__axomirInterviewDb;
}

async function ensureDb() {
  const file = dbFile();
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await readFile(file, "utf8");
  } catch {
    await writeFile(file, JSON.stringify(emptyDb(), null, 2), "utf8");
  }
}

export async function readDb(): Promise<Db> {
  if (shouldUseMemoryStore()) return memoryDb();
  await ensureDb();
  const raw = await readFile(dbFile(), "utf8");
  return DbSchema.parse(JSON.parse(raw));
}

export async function writeDb(db: Db) {
  const parsed = DbSchema.parse(db);
  if (shouldUseMemoryStore()) {
    globalThis.__axomirInterviewDb = parsed;
    return;
  }
  await ensureDb();
  await writeFile(dbFile(), JSON.stringify(parsed, null, 2), "utf8");
}

export async function mutateDb<T>(mutator: (db: Db) => T | Promise<T>) {
  const db = await readDb();
  const result = await mutator(db);
  await writeDb(db);
  return result;
}

export async function audit(db: Db, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  db.auditEvents.push(AuditEventSchema.parse({
    id: uuid(),
    actor: "development-recruiter",
    action,
    entityType,
    entityId,
    details,
    createdAt: nowIso()
  }));
}
