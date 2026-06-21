import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://favoritq:favoritq_pass@db:5432/favoritq";

// マネージド Postgres（Render 外部URLなど）向けの SSL 設定。
// 接続文字列に sslmode=require が含まれる、または DATABASE_SSL=true のとき有効化。
// Render の内部接続URLは SSL 不要なので既定はオフ。
const needsSsl =
  /sslmode=require/.test(connectionString) ||
  process.env.DATABASE_SSL === "true";

export const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * 複数クエリを1トランザクションで実行する。
 * コールバックが投げれば ROLLBACK、正常終了で COMMIT。
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Wait for the database to accept connections. The postgres healthcheck in
 * docker-compose gates `depends_on`, but this gives a clearer error locally.
 */
export async function waitForDb(retries = 10, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`[db] not ready (attempt ${attempt}/${retries}), retrying...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/**
 * スキーマ（db/init.sql）を起動時に適用する。
 * postgres の Docker イメージは初回起動時に init.sql を自動適用するが、Render などの
 * マネージド Postgres では自動適用されないため、ここで実行する。
 * init.sql は全て `CREATE TABLE IF NOT EXISTS` のため毎起動しても冪等。
 * ファイルが見つからない場合（ローカル compose 等）はスキップする。
 */
export async function runSchema(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath =
    process.env.SCHEMA_PATH ?? path.join(__dirname, "../db/init.sql");
  try {
    const sql = await readFile(schemaPath, "utf8");
    await pool.query(sql);
    console.log(`[db] schema applied from ${schemaPath}`);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      console.log(`[db] schema file not found (${schemaPath}); skipping`);
      return;
    }
    throw err;
  }
}

/**
 * 一定時間より古いルームを削除する（メンバー・お題・選択肢は CASCADE で連鎖削除）。
 * 古いデータが無限に蓄積するのを防ぐ。デフォルト 24 時間。
 * @returns 削除したルーム数
 */
export async function cleanupStaleRooms(maxAgeHours = 24): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM rooms WHERE created_at < now() - ($1 || ' hours')::interval`,
    [String(maxAgeHours)]
  );
  if (rowCount && rowCount > 0) {
    console.log(`[db] cleaned up ${rowCount} stale room(s) older than ${maxAgeHours}h`);
  }
  return rowCount ?? 0;
}

