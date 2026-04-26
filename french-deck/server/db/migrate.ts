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
    // Fallback: read from source tree (dev)
    sql = fs.readFileSync(path.join(process.cwd(), 'server/db/schema.sql'), 'utf-8');
  }
  db.exec(sql);
}
