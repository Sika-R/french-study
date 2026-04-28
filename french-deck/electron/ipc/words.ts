import { ipcMain } from 'electron';
import { getDb } from '../../server/db/client.js';
import { newCardRow } from '../../server/srs/fsrs.js';
import { scheduleSync } from '../sync/trigger.js';

export interface WordInput {
  lemma: string;
  surface: string;
  pos: string;
  gender?: 'm' | 'f' | null;
  translation_zh?: string | null;
  translation_en?: string | null;
  example_fr?: string | null;
  notes?: string | null;
}

export interface WordRow extends WordInput {
  id: number;
  created_at: number;
}

export class DuplicateLemmaError extends Error {
  code = 'DUPLICATE_LEMMA';
  constructor(public lemma: string, public existingId: number) {
    super(`已经录入过 lemma="${lemma}" (id=${existingId})`);
  }
}

export function registerWordHandlers(): void {
  ipcMain.handle('words:create', (_e, input: WordInput): WordRow | { error: 'DUPLICATE_LEMMA'; existingId: number; lemma: string } => {
    const db = getDb();
    const now = Date.now();

    // 显式查重：返回结构化错误对象，避免 throw 后 Electron 打满 stderr
    const existing = db.prepare('SELECT id FROM words WHERE lemma = ?').get(input.lemma) as { id: number } | undefined;
    if (existing) {
      return { error: 'DUPLICATE_LEMMA', existingId: existing.id, lemma: input.lemma };
    }

    const insertWord = db.prepare(`
      INSERT INTO words (lemma, surface, pos, gender, translation_zh, translation_en, example_fr, notes, created_at, updated_at)
      VALUES (@lemma, @surface, @pos, @gender, @translation_zh, @translation_en, @example_fr, @notes, @created_at, @updated_at)
    `);
    const insertSrs = db.prepare(`
      INSERT INTO srs_state (word_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review)
      VALUES (@word_id, @due, @stability, @difficulty, @elapsed_days, @scheduled_days, @reps, @lapses, @state, @last_review)
    `);

    const tx = db.transaction((data: WordInput) => {
      const info = insertWord.run({
        lemma: data.lemma,
        surface: data.surface,
        pos: data.pos,
        gender: data.gender ?? null,
        translation_zh: data.translation_zh ?? null,
        translation_en: data.translation_en ?? null,
        example_fr: data.example_fr ?? null,
        notes: data.notes ?? null,
        created_at: now,
        updated_at: now
      });
      const wordId = Number(info.lastInsertRowid);
      insertSrs.run(newCardRow(wordId));
      return wordId;
    });

    const id = tx(input);
    scheduleSync();
    return { id, created_at: now, ...input };
  });

  /** 用户已存在 → 选择「覆盖」时调用：更新翻译 / 词性等，但保留 SRS 进度 */
  ipcMain.handle('words:update', (_e, id: number, patch: Partial<WordInput>): boolean => {
    const db = getDb();
    const fields = ['lemma', 'surface', 'pos', 'gender', 'translation_zh', 'translation_en', 'example_fr', 'notes'] as const;
    const sets: string[] = [];
    const params: any = { id, updated_at: Date.now() };
    for (const f of fields) {
      if (patch[f] !== undefined) {
        sets.push(`${f} = @${f}`);
        params[f] = (patch as any)[f];
      }
    }
    if (sets.length === 0) return false;
    sets.push(`updated_at = @updated_at`);
    db.prepare(`UPDATE words SET ${sets.join(', ')} WHERE id = @id`).run(params);
    scheduleSync();
    return true;
  });

  ipcMain.handle('words:list', (_e, opts: { limit?: number; offset?: number; search?: string } = {}) => {
    const db = getDb();
    const limit = Math.min(opts.limit ?? 100, 500);
    const offset = opts.offset ?? 0;
    if (opts.search) {
      return db.prepare(`
        SELECT * FROM words
        WHERE lemma LIKE ? OR surface LIKE ? OR translation_zh LIKE ? OR translation_en LIKE ?
        ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).all(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`, limit, offset);
    }
    return db.prepare('SELECT * FROM words ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  });

  ipcMain.handle('words:delete', (_e, id: number) => {
    const db = getDb();
    // 防御式删除：即使 ON DELETE CASCADE 因为某种原因未触发，也手动把关联行清掉
    const tx = db.transaction((wordId: number) => {
      db.prepare('DELETE FROM review_logs WHERE word_id = ?').run(wordId);
      db.prepare('DELETE FROM srs_state WHERE word_id = ?').run(wordId);
      db.prepare('DELETE FROM words WHERE id = ?').run(wordId);
    });
    tx(id);
    scheduleSync();
    return true;
  });

  ipcMain.handle('words:count', () => {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) AS c FROM words').get() as { c: number };
    return row.c;
  });

  /** 按"录入日期"分组，返回 [{ day: 'YYYY-MM-DD', count, ids:[...] }] */
  ipcMain.handle('words:byDate', () => {
    const db = getDb();
    return db.prepare(`
      SELECT date(created_at/1000, 'unixepoch', 'localtime') AS day,
             COUNT(*) AS count,
             group_concat(id) AS ids
      FROM words
      GROUP BY day
      ORDER BY day DESC
    `).all().map((r: any) => ({
      day: r.day,
      count: r.count,
      ids: r.ids.split(',').map((x: string) => parseInt(x, 10))
    }));
  });

  /** 推荐：按 FSRS due 排序，到期/即将到期的全部 word_id（按到期升序） */
  ipcMain.handle('words:recommended', () => {
    const db = getDb();
    const now = Date.now();
    // 先到期的，加上 7 天内将到期的
    const horizon = now + 7 * 24 * 60 * 60 * 1000;
    return db.prepare(`
      SELECT w.id FROM srs_state s JOIN words w ON w.id = s.word_id
      WHERE s.due <= ?
      ORDER BY s.due ASC
    `).all(horizon).map((r: any) => r.id as number);
  });

  /** 给定一组 ids，返回完整 word 行（用于"开始复习"前预览） */
  ipcMain.handle('words:byIds', (_e, ids: number[]) => {
    if (!ids || ids.length === 0) return [];
    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM words WHERE id IN (${placeholders})`).all(...ids);
  });

  /** 给定一组 lemma，返回 lemma → 本地 id 的映射；用于跨机器恢复 session（id 跨机不稳定） */
  ipcMain.handle('words:idsByLemmas', (_e, lemmas: string[]) => {
    if (!lemmas || lemmas.length === 0) return {};
    const db = getDb();
    const placeholders = lemmas.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, lemma FROM words WHERE lemma IN (${placeholders})`)
      .all(...lemmas) as { id: number; lemma: string }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.lemma] = r.id;
    return out;
  });
}
