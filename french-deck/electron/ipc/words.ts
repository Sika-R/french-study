import { ipcMain } from 'electron';
import { getDb } from '../../server/db/client.js';
import { newCardRow } from '../../server/srs/fsrs.js';

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
      INSERT INTO words (lemma, surface, pos, gender, translation_zh, translation_en, example_fr, notes, created_at)
      VALUES (@lemma, @surface, @pos, @gender, @translation_zh, @translation_en, @example_fr, @notes, @created_at)
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
        created_at: now
      });
      const wordId = Number(info.lastInsertRowid);
      insertSrs.run(newCardRow(wordId));
      return wordId;
    });

    const id = tx(input);
    return { id, created_at: now, ...input };
  });

  /** 用户已存在 → 选择「覆盖」时调用：更新翻译 / 词性等，但保留 SRS 进度 */
  ipcMain.handle('words:update', (_e, id: number, patch: Partial<WordInput>): boolean => {
    const db = getDb();
    const fields = ['lemma', 'surface', 'pos', 'gender', 'translation_zh', 'translation_en', 'example_fr', 'notes'] as const;
    const sets: string[] = [];
    const params: any = { id };
    for (const f of fields) {
      if (patch[f] !== undefined) {
        sets.push(`${f} = @${f}`);
        params[f] = (patch as any)[f];
      }
    }
    if (sets.length === 0) return false;
    db.prepare(`UPDATE words SET ${sets.join(', ')} WHERE id = @id`).run(params);
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
    return true;
  });

  ipcMain.handle('words:count', () => {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) AS c FROM words').get() as { c: number };
    return row.c;
  });
}
