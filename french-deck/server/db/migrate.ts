import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function migrate(): void {
  const db = getDb();
  // schema.sql is colocated with this file in the build output
  const schemaPath = path.join(__dirname, 'schema.sql');
  let sql: string;
  try {
    sql = fs.readFileSync(schemaPath, 'utf-8');
  } catch {
    sql = fs.readFileSync(path.join(process.cwd(), 'server/db/schema.sql'), 'utf-8');
  }
  db.exec(sql);

  // 增量迁移：给已存在的 review_logs 表加 tense_id / person 列
  const cols = db.prepare("PRAGMA table_info(review_logs)").all() as Array<{ name: string }>;
  const colNames = new Set(cols.map(c => c.name));
  if (!colNames.has('tense_id')) {
    db.exec('ALTER TABLE review_logs ADD COLUMN tense_id TEXT');
  }
  if (!colNames.has('person')) {
    db.exec('ALTER TABLE review_logs ADD COLUMN person INTEGER');
  }
}
