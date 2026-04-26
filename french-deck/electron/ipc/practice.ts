import { ipcMain } from 'electron';
import { getDb } from '../../server/db/client.js';
import { verbiste } from '../../server/dict/verbiste.js';
import { TENSES, tenseById, PERSONS_FULL } from '../../server/dict/tenses.js';

export interface VerbCard {
  id: number;
  lemma: string;
  translation_zh: string | null;
  translation_en: string | null;
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export function registerPracticeHandlers(): void {
  /** 列出所有时态供前端选择 */
  ipcMain.handle('practice:tenses', () => TENSES);

  /** 列出已录入的动词（lemma 在 Verbiste 中能找到的才出现） */
  ipcMain.handle('practice:verbs', () => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, lemma, translation_zh, translation_en
      FROM words WHERE pos = 'verb' ORDER BY lemma ASC
    `).all() as VerbCard[];
    return rows.filter(r => verbiste.getInfinitive(r.lemma) !== null);
  });

  /** 给定 verb + tense，返回完整的 6 (或 3/0) 个变位形式（用于"展示标准答案"） */
  ipcMain.handle('practice:conjugationTable', (_e, infinitive: string, tenseId: string) => {
    const t = tenseById(tenseId);
    if (!t) return null;
    const persons = t.persons.length > 0 ? t.persons : [0]; // 0 = 无人称
    const out: { person: number; expected: string | null }[] = [];
    for (const p of persons) {
      if (p === 0) {
        // 分词：直接调 conjugate(.., 1) 因为 Verbiste 把分词存在第 1 个 slot
        const value = verbiste.conjugate(infinitive, t.mode, t.tense, 1);
        out.push({ person: 0, expected: value });
      } else {
        const value = verbiste.conjugate(infinitive, t.mode, t.tense, p);
        out.push({ person: p, expected: value });
      }
    }
    return out;
  });

  /**
   * 模式 1: 全表填空提交
   * 一次提交一个 (verb, tense) 下用户填的全部 6 (或 3/1) 格答案，逐格写入 review_logs
   */
  ipcMain.handle('practice:submitTable', (_e, args: {
    word_id: number;
    verb: string;
    tense_id: string;
    answers: Record<number, string>; // person -> user input ; person=0 表示无人称
  }) => {
    const t = tenseById(args.tense_id);
    if (!t) throw new Error('Unknown tense ' + args.tense_id);
    const db = getDb();
    const persons = t.persons.length > 0 ? t.persons : [0];

    const insertLog = db.prepare(`
      INSERT INTO review_logs (word_id, reviewed_at, rating, mode, correct, user_input, expected, tense_id, person)
      VALUES (?, ?, ?, 'drill-table', ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const results: { person: number; correct: boolean; expected: string | null; user_input: string }[] = [];

    const tx = db.transaction(() => {
      for (const p of persons) {
        const sourcePerson = p === 0 ? 1 : p;
        const expected = verbiste.conjugate(args.verb, t.mode, t.tense, sourcePerson);
        const userInput = (args.answers[p] ?? '').trim();
        const correct = expected != null && fold(userInput) === fold(expected);
        insertLog.run(
          args.word_id, now,
          correct ? 3 : 1,
          correct ? 1 : 0,
          userInput, expected ?? '',
          args.tense_id, p === 0 ? null : p
        );
        results.push({ person: p, correct, expected, user_input: userInput });
      }
    });
    tx();
    return results;
  });

  /**
   * 模式 2: 单题 drill - 给 (verb, tense, person)，用户填变位
   * 模式 3: reverse - 给变位形式，用户写主语 + 翻译
   * 都通过 practice:submitOne 写库
   */
  ipcMain.handle('practice:submitOne', (_e, args: {
    word_id: number;
    mode: 'drill' | 'reverse';
    tense_id: string;
    person: number;       // 0 = 无人称分词
    user_input: string;
    expected: string;     // 期望答案（drill 模式 = 变位；reverse 模式 = "person|zh"）
    correct: boolean;     // 由前端比对（reverse 模式涉及多字段，前端处理）
  }) => {
    const db = getDb();
    db.prepare(`
      INSERT INTO review_logs (word_id, reviewed_at, rating, mode, correct, user_input, expected, tense_id, person)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      args.word_id, Date.now(),
      args.correct ? 3 : 1,
      args.mode === 'drill' ? 'drill-single' : 'drill-reverse',
      args.correct ? 1 : 0,
      args.user_input, args.expected,
      args.tense_id, args.person === 0 ? null : args.person
    );
    return { correct: args.correct };
  });

  /** 错误率统计：按 (tense_id, person) 聚合 */
  ipcMain.handle('practice:errorStatsByTense', (_e, opts: { minAttempts?: number } = {}) => {
    const db = getDb();
    const min = opts.minAttempts ?? 1;
    return db.prepare(`
      SELECT tense_id, person,
             SUM(1 - correct) * 1.0 / COUNT(*) AS error_rate,
             COUNT(*) AS attempts
      FROM review_logs
      WHERE tense_id IS NOT NULL
      GROUP BY tense_id, person
      HAVING attempts >= ?
      ORDER BY error_rate DESC, attempts DESC
    `).all(min);
  });

  /** 给定动词 + 已学时态集合，随机抽一道 drill 题 (verb, tense, person) */
  ipcMain.handle('practice:pickDrill', (_e, opts: {
    word_ids: number[];           // 候选动词
    tense_ids: string[];          // 已学时态
  }) => {
    if (opts.word_ids.length === 0 || opts.tense_ids.length === 0) return null;
    const db = getDb();
    const wid = opts.word_ids[Math.floor(Math.random() * opts.word_ids.length)];
    const word = db.prepare('SELECT id, lemma, translation_zh, translation_en FROM words WHERE id = ?').get(wid) as VerbCard | undefined;
    if (!word) return null;

    const tid = opts.tense_ids[Math.floor(Math.random() * opts.tense_ids.length)];
    const t = tenseById(tid);
    if (!t) return null;

    const persons = t.persons.length > 0 ? t.persons : [0];
    // 多次尝试：避免该动词该时态此人称在 Verbiste 中没有变位
    for (let i = 0; i < 6; i++) {
      const p = persons[Math.floor(Math.random() * persons.length)];
      const sourcePerson = p === 0 ? 1 : p;
      const expected = verbiste.conjugate(word.lemma, t.mode, t.tense, sourcePerson);
      if (expected) {
        return {
          word,
          tense: t,
          person: p,
          expected
        };
      }
    }
    return null;
  });

  /**
   * Reverse 模式：取一个 (verb, tense, person)，给出变位形式让用户猜原型/人称
   * 返回时不带 expected，让前端比对（用户要写主语 + 翻译）
   */
  ipcMain.handle('practice:pickReverse', (_e, opts: {
    word_ids: number[];
    tense_ids: string[];
  }) => {
    if (opts.word_ids.length === 0 || opts.tense_ids.length === 0) return null;
    const db = getDb();
    const wid = opts.word_ids[Math.floor(Math.random() * opts.word_ids.length)];
    const word = db.prepare('SELECT id, lemma, translation_zh, translation_en FROM words WHERE id = ?').get(wid) as VerbCard | undefined;
    if (!word) return null;

    const tid = opts.tense_ids[Math.floor(Math.random() * opts.tense_ids.length)];
    const t = tenseById(tid);
    if (!t) return null;

    const persons = t.persons.length > 0 ? t.persons : [0];
    for (let i = 0; i < 6; i++) {
      const p = persons[Math.floor(Math.random() * persons.length)];
      const sourcePerson = p === 0 ? 1 : p;
      const conjugated = verbiste.conjugate(word.lemma, t.mode, t.tense, sourcePerson);
      if (conjugated) {
        return {
          word,            // 含 lemma + 翻译，用于 UI 比对答案
          tense: t,
          person: p,
          conjugated
        };
      }
    }
    return null;
  });
}
