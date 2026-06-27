// Storage wrapper. Uses Vercel KV in production (when KV_REST_API_URL /
// KV_REST_API_TOKEN are set, which Vercel injects automatically once you
// attach a KV store to your project). Falls back to an in-memory store for
// local development so `npm run dev` works without any setup.
//
// Every key is namespaced by Clerk user ID so each signed-in user gets their
// own goals, milestones, steps, daily logs, weekly reviews, and stats.

type KVLike = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown) => Promise<unknown>;
};

let memoryStore: Map<string, unknown> | null = null;

function getMemoryStore(): KVLike {
  if (!memoryStore) memoryStore = new Map();
  const store = memoryStore;
  return {
    async get<T>(key: string) {
      return (store.has(key) ? (store.get(key) as T) : null) as T | null;
    },
    async set(key: string, value: unknown) {
      store.set(key, value);
      return "OK";
    },
  };
}

async function getKv(): Promise<KVLike> {
  const hasVercelKv = Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  );

  if (hasVercelKv) {
    const { kv } = await import("@vercel/kv");
    return kv as unknown as KVLike;
  }

  return getMemoryStore();
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const kv = await getKv();
  const value = await kv.get<T>(key);
  return value ?? null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const kv = await getKv();
  await kv.set(key, value);
}

export const KEYS = {
  profile: (userId: string) => `cos:${userId}:profile`,
  meta: (userId: string) => `cos:${userId}:meta`,
  dailyLog: (userId: string, date: string) => `cos:${userId}:daily:${date}`,
  weeklyReview: (userId: string, weekEnd: string) =>
    `cos:${userId}:weekly:${weekEnd}`,
  stats: (userId: string) => `cos:${userId}:stats`,
};
