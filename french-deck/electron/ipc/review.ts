import { ipcMain } from 'electron';
import { getDb } from '../../server/db/client.js';
import { applyReview, type SrsRating, type SrsRow } from '../../server/srs/fsrs.js';
import { verbiste } from '../../server/dict/verbiste.js';
import { scheduleSync } from '../sync/trigger.js';

export interface QueueCard {
  id: number;
  lemma: string;
  surface: string;
  pos: string;
  gender: 'm' | 'f' | null;
  translation_zh: string | null;
  translation_en: string | null;
  due: number;
  state: number;
  reps: number;
}

const PRIORITY_PERSONS = [1, 2, 3, 4, 5, 6];
const PRIORITY_TENSES: { mode: string; tense: string }[] = [
  { mode: 'indicative', tense: 'present' },
  { mode: 'indicative', tense: 'imperfect' },
  { mode: 'indicative', tense: 'future' },
  { mode: 'indicative', tense: 'simple-past' },
  { mode: 'conditional', tense: 'present' },
  { mode: 'subjunctive', tense: 'present' }
];

/** 归一化字符串（小写 + 去除变音符号）用于宽松比对 */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export function registerReviewHandlers(): void {
  /** 取到期复习卡片，最多 limit 张 */
  ipcMain.handle('review:queue', (_e, limit: number = 30): QueueCard[] => {
    const db = getDb();
    const now = Date.now();
    return db.prepare(`
      SELECT w.id, w.lemma, w.surface, w.pos, w.gender, w.translation_zh, w.translation_en,
             s.due, s.state, s.reps
      FROM srs_state s JOIN words w ON w.id = s.word_id
      WHERE s.due <= ?
      ORDER BY s.due ASC
      LIMIT ?
    `).all(now, limit) as QueueCard[];
  });

  /** 给定动词，挑一个时态/人称作为变位题 */
  ipcMain.handle('review:pickConjugation', (_e, infinitive: string) => {
    const tenses = verbiste.listTenses(infinitive);
    if (tenses.length === 0) return null;
    // 优先选常见时态
    const prioritized = tenses.filter(t =>
      PRIORITY_TENSES.some(p => p.mode === t.mode && p.tense === t.tense)
    );
    const pool = prioritized.length > 0 ? prioritized : tenses;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    // 选人称：很多模式只 6 个 slot，挑一个有变位的
    for (let i = 0; i < 12; i++) {
      const person = PRIORITY_PERSONS[Math.floor(Math.random() * PRIORITY_PERSONS.length)];
      const expected = verbiste.conjugate(infinitive, choice.mode, choice.tense, person);
      if (expected) return { mode: choice.mode, tense: choice.tense, person, expected };
    }
    return null;
  });

  /**
   * 提交复习结果。
   * - mode='spell': expected = lemma 或 surface (调用方传入)
   * - mode='conjugation': expected = 变位形式
   * 拼写正确强宽松比对（忽略变音）则视为 correct，否则 incorrect。
   * rating 由前端传入；若不传则按 correct -> Good(3)，错 -> Again(1)。
   */
  ipcMain.handle('review:submit', (_e, args: {
    word_id: number;
    mode: 'spell' | 'conjugation';
    user_input: string;
    expected: string;
    rating?: SrsRating;
  }) => {
    const db = getDb();
    const correct = normalize(args.user_input) === normalize(args.expected) ? 1 : 0;
    const rating: SrsRating = args.rating ?? (correct ? 3 : 1);

    const row = db.prepare('SELECT * FROM srs_state WHERE word_id = ?').get(args.word_id) as SrsRow | undefined;
    if (!row) throw new Error('SRS state missing for word ' + args.word_id);

    const updated = applyReview(row, rating);
    db.prepare(`
      UPDATE srs_state SET due=@due, stability=@stability, difficulty=@difficulty,
        elapsed_days=@elapsed_days, scheduled_days=@scheduled_days,
        reps=@reps, lapses=@lapses, state=@state, last_review=@last_review
      WHERE word_id=@word_id
    `).run(updated);

    db.prepare(`
      INSERT INTO review_logs (word_id, reviewed_at, rating, mode, correct, user_input, expected)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(args.word_id, Date.now(), rating, args.mode, correct, args.user_input, args.expected);

    scheduleSync();
    return { correct, due: updated.due, rating };
  });

  /** 错误率 Top N，至少复习过 minAttempts 次 */
  ipcMain.handle('review:errorRateTop', (_e, opts: { limit?: number; minAttempts?: number } = {}) => {
    const db = getDb();
    const limit = opts.limit ?? 50;
    const minAttempts = opts.minAttempts ?? 3;
    return db.prepare(`
      SELECT w.id, w.lemma, w.surface, w.pos, w.gender, w.translation_zh, w.translation_en,
             SUM(1 - r.correct) * 1.0 / COUNT(*) AS error_rate,
             COUNT(*) AS attempts
      FROM review_logs r JOIN words w ON w.id = r.word_id
      GROUP BY r.word_id
      HAVING attempts >= ?
      ORDER BY error_rate DESC, attempts DESC
      LIMIT ?
    `).all(minAttempts, limit);
  });

  /** 拼写错误率：仅 mode='spell'，按 word 聚合 */
  ipcMain.handle('review:errorRateSpell', (_e, opts: { limit?: number; minAttempts?: number } = {}) => {
    const db = getDb();
    const limit = opts.limit ?? 50;
    const minAttempts = opts.minAttempts ?? 1;
    return db.prepare(`
      SELECT w.id, w.lemma, w.surface, w.pos, w.gender, w.translation_zh, w.translation_en,
             SUM(1 - r.correct) * 1.0 / COUNT(*) AS error_rate,
             COUNT(*) AS attempts,
             (SELECT expected FROM review_logs r2
              WHERE r2.word_id = w.id AND r2.mode = 'spell'
              ORDER BY r2.reviewed_at DESC LIMIT 1) AS expected
      FROM review_logs r JOIN words w ON w.id = r.word_id
      WHERE r.mode = 'spell'
      GROUP BY r.word_id
      HAVING attempts >= ?
      ORDER BY error_rate DESC, attempts DESC
      LIMIT ?
    `).all(minAttempts, limit);
  });

  /** 变位错误率：按 (word, tense_id, person) 三元组（同一动词不同人称分开） */
  ipcMain.handle('review:errorRateConjugation', (_e, opts: { limit?: number; minAttempts?: number } = {}) => {
    const db = getDb();
    const limit = opts.limit ?? 100;
    const minAttempts = opts.minAttempts ?? 1;
    return db.prepare(`
      SELECT w.id, w.lemma, w.translation_zh, w.translation_en,
             r.tense_id, r.person,
             SUM(1 - r.correct) * 1.0 / COUNT(*) AS error_rate,
             COUNT(*) AS attempts,
             (SELECT expected FROM review_logs r2
              WHERE r2.word_id = w.id AND r2.tense_id = r.tense_id
                AND COALESCE(r2.person, -1) = COALESCE(r.person, -1)
              ORDER BY r2.reviewed_at DESC LIMIT 1) AS expected
      FROM review_logs r JOIN words w ON w.id = r.word_id
      WHERE r.mode IN ('drill-table', 'drill-single') AND r.tense_id IS NOT NULL
      GROUP BY w.id, r.tense_id, r.person
      HAVING attempts >= ?
      ORDER BY error_rate DESC, attempts DESC
      LIMIT ?
    `).all(minAttempts, limit);
  });

  /** 阴阳错误率：mode IN (adj-form, noun-gender)，按 word */
  ipcMain.handle('review:errorRateGender', (_e, opts: { limit?: number; minAttempts?: number } = {}) => {
    const db = getDb();
    const limit = opts.limit ?? 50;
    const minAttempts = opts.minAttempts ?? 1;
    return db.prepare(`
      SELECT w.id, w.lemma, w.gender, w.pos, w.translation_zh, w.translation_en,
             r.mode,
             SUM(1 - r.correct) * 1.0 / COUNT(*) AS error_rate,
             COUNT(*) AS attempts,
             (SELECT expected FROM review_logs r2
              WHERE r2.word_id = w.id AND r2.mode = r.mode
              ORDER BY r2.reviewed_at DESC LIMIT 1) AS expected
      FROM review_logs r JOIN words w ON w.id = r.word_id
      WHERE r.mode IN ('adj-form', 'noun-gender')
      GROUP BY r.word_id, r.mode
      HAVING attempts >= ?
      ORDER BY error_rate DESC, attempts DESC
      LIMIT ?
    `).all(minAttempts, limit);
  });

  /** 30 天复习曲线 */
  ipcMain.handle('review:dailyCounts', (_e, days: number = 30) => {
    const db = getDb();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    // SQLite 用 date(reviewed_at/1000, 'unixepoch', 'localtime') 分组
    return db.prepare(`
      SELECT date(reviewed_at/1000, 'unixepoch', 'localtime') AS day,
             COUNT(*) AS total,
             SUM(correct) AS correct
      FROM review_logs
      WHERE reviewed_at >= ?
      GROUP BY day
      ORDER BY day ASC
    `).all(since);
  });

  /** 概览：今日待复习 + 总数 + 已学 */
  ipcMain.handle('review:summary', () => {
    const db = getDb();
    const now = Date.now();
    const dueNow = (db.prepare('SELECT COUNT(*) AS c FROM srs_state WHERE due <= ?').get(now) as { c: number }).c;
    const total = (db.prepare('SELECT COUNT(*) AS c FROM words').get() as { c: number }).c;
    const learned = (db.prepare('SELECT COUNT(*) AS c FROM srs_state WHERE state >= 2').get() as { c: number }).c;
    return { dueNow, total, learned };
  });
}
