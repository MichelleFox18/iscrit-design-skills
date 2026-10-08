import 'server-only';
import { Pool, type PoolClient } from 'pg';
const globalDb = globalThis as unknown as { designPool?: Pool };
export const pool = globalDb.designPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
if (process.env.NODE_ENV !== 'production') globalDb.designPool = pool;
export async function withDb<T>(userId: string | null, run: (db: PoolClient) => Promise<T>, reason = ''): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT set_config('app.user_id',$1,true),set_config('app.reason',$2,true)", [userId ?? '', reason]);
    const value = await run(db);
    await db.query('COMMIT');
    return value;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
