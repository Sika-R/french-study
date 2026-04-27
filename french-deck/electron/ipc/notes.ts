import { ipcMain } from 'electron';
import { getDb } from '../../server/db/client.js';
import { newCardRow, applyReview, type SrsRow } from '../../server/srs/fsrs.js';

export interface NoteRow {
  id: number;
  title: string | null;
  content: string;
  created_at: number;
  updated_at: number;
}

export interface NoteInput {
  title?: string | null;
  content: string;
}

/** 笔记的 srs_state（适配 fsrs.ts 里以 word_id 为主键的接口） */
function noteSrsRowFromDb(noteId: number, row: any): SrsRow {
  return {
    word_id: noteId,
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review
  };
}

export function registerNoteHandlers(): void {
  /** 新建笔记 */
  ipcMain.handle('notes:create', (_e, input: NoteInput): NoteRow => {
    const db = getDb();
    const now = Date.now();
    const insertNote = db.prepare(`
      INSERT INTO notes (title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    const insertSrs = db.prepare(`
      INSERT INTO note_srs_state (note_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review)
      VALUES (@word_id, @due, @stability, @difficulty, @elapsed_days, @scheduled_days, @reps, @lapses, @state, @last_review)
    `);
    const tx = db.transaction(() => {
      const info = insertNote.run(input.title ?? null, input.content, now, now);
      const id = Number(info.lastInsertRowid);
      insertSrs.run(newCardRow(id));
      return id;
    });
    const id = tx();
    return { id, title: input.title ?? null, content: input.content, created_at: now, updated_at: now };
  });

  /** 编辑笔记内容（不重置 SRS） */
  ipcMain.handle('notes:update', (_e, id: number, patch: Partial<NoteInput>): boolean => {
    const db = getDb();
    const sets: string[] = [];
    const params: any = { id, updated_at: Date.now() };
    if (patch.title !== undefined) { sets.push('title = @title'); params.title = patch.title; }
    if (patch.content !== undefined) { sets.push('content = @content'); params.content = patch.content; }
    if (sets.length === 0) return false;
    sets.push('updated_at = @updated_at');
    db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return true;
  });

  /** 删除笔记（CASCADE 会清掉 srs / logs） */
  ipcMain.handle('notes:delete', (_e, id: number) => {
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM note_review_logs WHERE note_id = ?').run(id);
      db.prepare('DELETE FROM note_srs_state WHERE note_id = ?').run(id);
      db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    });
    tx();
    return true;
  });

  /** 列表（按 created_at desc） */
  ipcMain.handle('notes:list', (_e, opts: { limit?: number; offset?: number } = {}) => {
    const db = getDb();
    const limit = Math.min(opts.limit ?? 200, 1000);
    const offset = opts.offset ?? 0;
    return db.prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  });

  ipcMain.handle('notes:get', (_e, id: number): NoteRow | null => {
    const db = getDb();
    return (db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined) ?? null;
  });

  /** 按日期分组：[{ day, count, ids }]，用于「按日期」复习模式 */
  ipcMain.handle('notes:byDate', () => {
    const db = getDb();
    return db.prepare(`
      SELECT date(created_at/1000, 'unixepoch', 'localtime') AS day,
             COUNT(*) AS count,
             group_concat(id) AS ids
      FROM notes
      GROUP BY day
      ORDER BY day DESC
    `).all().map((r: any) => ({
      day: r.day,
      count: r.count,
      ids: r.ids.split(',').map((x: string) => parseInt(x, 10))
    }));
  });

  /** 推荐：FSRS 到期 + 7 天内将到期的笔记 id（按 due asc） */
  ipcMain.handle('notes:recommended', () => {
    const db = getDb();
    const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return db.prepare(`
      SELECT n.id FROM note_srs_state s JOIN notes n ON n.id = s.note_id
      WHERE s.due <= ? ORDER BY s.due ASC
    `).all(horizon).map((r: any) => r.id as number);
  });

  /** 拉一组 ids 的完整笔记 */
  ipcMain.handle('notes:byIds', (_e, ids: number[]): NoteRow[] => {
    if (!ids || ids.length === 0) return [];
    const db = getDb();
    const ph = ids.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM notes WHERE id IN (${ph})`).all(...ids) as NoteRow[];
  });

  /** 复习提交：写日志 + 更新 FSRS */
  ipcMain.handle('notes:submit', (_e, args: { note_id: number; rating: 1 | 2 | 3 | 4 }) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM note_srs_state WHERE note_id = ?').get(args.note_id) as any;
    if (!row) throw new Error('note srs_state not found for ' + args.note_id);
    const next = applyReview(noteSrsRowFromDb(args.note_id, row), args.rating);
    db.prepare(`
      UPDATE note_srs_state SET
        due=@due, stability=@stability, difficulty=@difficulty,
        elapsed_days=@elapsed_days, scheduled_days=@scheduled_days,
        reps=@reps, lapses=@lapses, state=@state, last_review=@last_review
      WHERE note_id=@word_id
    `).run(next);
    db.prepare('INSERT INTO note_review_logs (note_id, reviewed_at, rating) VALUES (?, ?, ?)')
      .run(args.note_id, Date.now(), args.rating);
    return { ok: true };
  });
}
