import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

let db: Database.Database | null = null;
let cachedDbPath: string | null = null;

/** 数据库文件的绝对路径（Windows: %APPDATA%/<productName>/french-deck.db） */
export function getDbPath(): string {
  if (cachedDbPath) return cachedDbPath;
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  cachedDbPath = path.join(userData, 'french-deck.db');
  return cachedDbPath;
}

export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = getDbPath();
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
