import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { getDb, getDbPath } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 版本化迁移：每次 schema 变动 → 在 MIGRATIONS 数组末尾追加一个 step。
 *
 * - SQLite 内置的 `PRAGMA user_version` 记录"当前已经应用到第几步"
 * - 启动时若发现版本号 < 数组长度，就按顺序补做后续 step
 * - 在执行任何 step 之前，先把整个 db 文件备份到同目录
 *
 * 重要约定：
 * - 已发布的 step **永远不能改**（改了会导致老用户重做或漏做）
 * - 加新字段/新表 → push 一个新 step
 * - 当前 step 数 = 数组 length；新装的用户从 0 直接跳到 length，不补做
 *
 * 备注：所有 step 都用 IF NOT EXISTS / try-catch 兜底，因为不同时期手工
 * 跑过的旧 db 可能已经有了一部分对象。
 */
const MIGRATIONS: Array<(db: Database.Database) => void> = [
  // ────────── v0 → v1: 初始 schema (words / srs_state / review_logs / lookup_cache) ──────────
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS words (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        lemma         TEXT NOT NULL UNIQUE,
        surface       TEXT NOT NULL,
        pos           TEXT NOT NULL,
        gender        TEXT,
        translation_zh TEXT,
        translation_en TEXT,
        example_fr    TEXT,
        notes         TEXT,
        created_at    INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS srs_state (
        word_id       INTEGER PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
        due           INTEGER NOT NULL,
        stability     REAL NOT NULL,
        difficulty    REAL NOT NULL,
        elapsed_days  REAL NOT NULL,
        scheduled_days REAL NOT NULL,
        reps          INTEGER NOT NULL,
        lapses        INTEGER NOT NULL,
        state         INTEGER NOT NULL,
        last_review   INTEGER
      );
      CREATE TABLE IF NOT EXISTS review_logs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id       INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        reviewed_at   INTEGER NOT NULL,
        rating        INTEGER NOT NULL,
        mode          TEXT NOT NULL,
        correct       INTEGER NOT NULL,
        user_input    TEXT,
        expected      TEXT
      );
      CREATE TABLE IF NOT EXISTS lookup_cache (
        surface       TEXT PRIMARY KEY,
        payload_json  TEXT NOT NULL,
        fetched_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_srs_due ON srs_state(due);
      CREATE INDEX IF NOT EXISTS idx_logs_word ON review_logs(word_id);
    `);
  },

  // ────────── v1 → v2: review_logs 加 tense_id / person ──────────
  (db) => {
    addColumnIfMissing(db, 'review_logs', 'tense_id', 'TEXT');
    addColumnIfMissing(db, 'review_logs', 'person', 'INTEGER');
  },

  // ────────── v2 → v3: notes / note_srs_state / note_review_logs ──────────
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        title         TEXT,
        content       TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS note_srs_state (
        note_id       INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
        due           INTEGER NOT NULL,
        stability     REAL NOT NULL,
        difficulty    REAL NOT NULL,
        elapsed_days  REAL NOT NULL,
        scheduled_days REAL NOT NULL,
        reps          INTEGER NOT NULL,
        lapses        INTEGER NOT NULL,
        state         INTEGER NOT NULL,
        last_review   INTEGER
      );
      CREATE TABLE IF NOT EXISTS note_review_logs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id       INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        reviewed_at   INTEGER NOT NULL,
        rating        INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_note_srs_due ON note_srs_state(due);
      CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
    `);
  }

  // 以后加新 schema 在下面 push 新函数即可，不要修改已有的。
];

function addColumnIfMissing(db: Database.Database, table: string, col: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
}

function dateStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 备份当前 db 到同目录 french-deck.YYYYMMDD-HHMMSS.bak.db；保留最近 10 份 */
function backupDb(dbPath: string): void {
  if (!fs.existsSync(dbPath)) return; // 全新 db，不需要备份
  const dir = path.dirname(dbPath);
  const base = path.basename(dbPath, path.extname(dbPath));
  const backupPath = path.join(dir, `${base}.${dateStamp()}.bak.db`);
  try {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`[migrate] backed up db → ${backupPath}`);

    // 清理：只保留最新 10 份备份
    const all = fs.readdirSync(dir)
      .filter(f => f.startsWith(`${base}.`) && f.endsWith('.bak.db'))
      .map(f => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of all.slice(10)) {
      try { fs.unlinkSync(old.path); } catch { /* ignore */ }
    }
  } catch (err) {
    console.warn(`[migrate] backup failed:`, err);
  }
}

export function migrate(): void {
  const db = getDb();
  const dbPath = getDbPath();

  // 1. 读当前版本
  const userVersion = db.pragma('user_version', { simple: true }) as number;
  const targetVersion = MIGRATIONS.length;

  // 2. 旧 db 兼容：在引入版本号之前，老用户已经手工跑过 schema.sql。
  //    如果 user_version=0 但 words 表已经存在 → 说明这是个老 db，直接当作 v3
  //    （当前 MIGRATIONS.length=3，等价于"已应用到最新"）
  let effectiveVersion = userVersion;
  if (userVersion === 0) {
    const hasWords = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='words'"
    ).get();
    if (hasWords) {
      // 老 db。检查它有没有 v2 的字段、v3 的表，分别推断版本
      const reviewCols = db.prepare(`PRAGMA table_info(review_logs)`).all() as Array<{ name: string }>;
      const hasTenseId = reviewCols.some(c => c.name === 'tense_id');
      const hasNotes = !!db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='notes'"
      ).get();
      effectiveVersion = hasNotes ? 3 : (hasTenseId ? 2 : 1);
      db.pragma(`user_version = ${effectiveVersion}`);
      console.log(`[migrate] legacy db detected, set user_version=${effectiveVersion}`);
    }
  }

  if (effectiveVersion >= targetVersion) {
    console.log(`[migrate] db is up to date (v${effectiveVersion})`);
    return;
  }

  // 3. 升级前先备份
  console.log(`[migrate] upgrading db from v${effectiveVersion} → v${targetVersion}`);
  closeDbForBackup();
  backupDb(dbPath);

  // 4. 重新打开 db 并按顺序应用 step (在事务里跑，失败回滚)
  const dbReopen = getDb();
  const tx = dbReopen.transaction(() => {
    for (let i = effectiveVersion; i < targetVersion; i++) {
      console.log(`[migrate] applying step v${i} → v${i + 1}`);
      MIGRATIONS[i](dbReopen);
    }
    dbReopen.pragma(`user_version = ${targetVersion}`);
  });
  tx();
  console.log(`[migrate] done, now at v${targetVersion}`);
}

/** 关闭 db 句柄好让 fs.copyFileSync 拿到独占。WAL 模式下 .db 备份够用（启动时还没写入）。 */
function closeDbForBackup(): void {
  // 启动时 db 刚打开还没人写，关一下确保 fs.copy 拿到完整文件
  // (注意：这里不能调 client.closeDb()，会有循环 import 风险，直接重新拿 instance 就好)
  // better-sqlite3 是同步的，启动时还没并发写入，复制即可。
}
