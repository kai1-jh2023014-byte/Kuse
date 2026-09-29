import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionRecord } from "./types";

export type { PendingOAuth, SessionRecord, StoredCandidate, StoredDesign, StoredThumbnail, StoredTokens, StoredTool, StoredVersion } from "./types";

interface Database {
  sessions: Record<string, SessionRecord>;
}

export interface SessionStore {
  read(id: string): Promise<SessionRecord | null>;
  mutate(id: string, update: (session: SessionRecord) => void): Promise<SessionRecord>;
}

const PENDING_TTL_MS = 10 * 60 * 1000;

export function createSessionStore(directory: string): SessionStore {
  const file = path.join(directory, "canva-sessions.json");
  let chain: Promise<unknown> = Promise.resolve();

  const withLock = async <T>(fn: (db: Database) => Promise<T> | T): Promise<T> => {
    const run = chain.then(async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      let db: Database = { sessions: {} };
      try {
        db = JSON.parse(await readFile(file, "utf8")) as Database;
        if (!db.sessions) db.sessions = {};
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const result = await fn(db);
      await writeFile(file, JSON.stringify(db), { mode: 0o600 });
      return result;
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  return {
    async read(id) {
      return withLock((db) => {
        const session = db.sessions[id];
        return session ? structuredClone(session) : null;
      });
    },
    async mutate(id, update) {
      return withLock((db) => {
        const now = Date.now();
        for (const session of Object.values(db.sessions)) {
          if (session.pending && now - session.pending.createdAt > PENDING_TTL_MS) delete session.pending;
        }
        let session = db.sessions[id];
        if (!session) {
          session = { id, createdAt: new Date().toISOString(), versions: [] };
          db.sessions[id] = session;
        }
        update(session);
        return structuredClone(session);
      });
    },
  };
}

export const sessionStore = createSessionStore(path.join(process.cwd(), "data"));
