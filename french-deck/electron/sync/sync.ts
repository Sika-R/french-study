/**
 * 简单云同步引擎：
 * - dump 本地 → snapshot → push 到 GitHub Gist
 * - fetch remote snapshot → 按行合并到本地（last-write-wins per row）
 * - review_logs / note_review_logs append-only：按复合键去重
 *
 * snapshot schema 见 SCHEMA_VERSION 注释。
 */

import { getDb } from '../../server/db/client.js';
import { loadConfig, saveConfig } from './config.js';
import { fetchGist, patchGist, createGist, listMyGists, type GistFiles } from './gist.js';

const SCHEMA_VERSION = 9;
const GIST_DESCRIPTION = 'french-deck-sync';

interface WordRow {
  lemma: string;
  surface: string;
  pos: string;
  gender: string | null;
  translation_zh: string | null;
  translation_en: string | null;
  example_fr: string | null;
  notes: string | null;
  impersonal: number;
  lemma_plural: string | null;
  lemma_feminine: string | null;
  created_at: number;
  updated_at: number;
}

interface SrsStateRowSerialized {
  lemma: string;     // 关联到 words
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
}

interface NoteRowSerialized {
  uuid: string;
  title: string | null;
  content: string;
  created_at: number;
  updated_at: number;
}

interface NoteSrsStateRowSerialized {
  uuid: string;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
}

interface ReviewLogSerialized {
  lemma: string;
  reviewed_at: number;
  rating: number;
  mode: string;
  correct: number;
  user_input: string | null;
  expected: string | null;
  tense_id: string | null;
  person: number | null;
}

interface NoteReviewLogSerialized {
  note_uuid: string;
  reviewed_at: number;
  rating: number;
}

interface AdjFormSerialized {
  lemma: string;
  form_kind: string;
  surface: string;
}

interface Snapshot {
  schemaVersion: number;
  exportedAt: number;
  words: WordRow[];
  srs_state: SrsStateRowSerialized[];
  notes: NoteRowSerialized[];
  note_srs_state: NoteSrsStateRowSerialized[];
  review_logs: ReviewLogSerialized[];
  note_review_logs: NoteReviewLogSerialized[];
  adj_forms: AdjFormSerialized[];
}

interface SpellSessionFile {
  savedAt: number;
  payload: string; // 原样的 localStorage JSON 字符串
}

// ── snapshot dump ──────────────────────────────────────────────

function dumpSnapshot(): Snapshot {
  const db = getDb();
  const words = db.prepare(`
    SELECT lemma, surface, pos, gender, translation_zh, translation_en,
           example_fr, notes, COALESCE(impersonal, 0) AS impersonal,
           lemma_plural, lemma_feminine,
           created_at, COALESCE(updated_at, created_at) AS updated_at
    FROM words
  `).all() as WordRow[];

  const srs = db.prepare(`
    SELECT w.lemma AS lemma, s.due, s.stability, s.difficulty,
           s.elapsed_days, s.scheduled_days, s.reps, s.lapses, s.state, s.last_review
    FROM srs_state s JOIN words w ON w.id = s.word_id
  `).all() as SrsStateRowSerialized[];

  const notes = db.prepare(`
    SELECT uuid, title, content, created_at, updated_at
    FROM notes WHERE uuid IS NOT NULL AND uuid != ''
  `).all() as NoteRowSerialized[];

  const noteSrs = db.prepare(`
    SELECT n.uuid AS uuid, s.due, s.stability, s.difficulty,
           s.elapsed_days, s.scheduled_days, s.reps, s.lapses, s.state, s.last_review
    FROM note_srs_state s JOIN notes n ON n.id = s.note_id
    WHERE n.uuid IS NOT NULL AND n.uuid != ''
  `).all() as NoteSrsStateRowSerialized[];

  const logs = db.prepare(`
    SELECT w.lemma AS lemma, r.reviewed_at, r.rating, r.mode, r.correct,
           r.user_input, r.expected, r.tense_id, r.person
    FROM review_logs r JOIN words w ON w.id = r.word_id
  `).all() as ReviewLogSerialized[];

  const noteLogs = db.prepare(`
    SELECT n.uuid AS note_uuid, r.reviewed_at, r.rating
    FROM note_review_logs r JOIN notes n ON n.id = r.note_id
    WHERE n.uuid IS NOT NULL AND n.uuid != ''
  `).all() as NoteReviewLogSerialized[];

  const adjForms = db.prepare(`
    SELECT w.lemma AS lemma, a.form_kind, a.surface
    FROM adj_forms a JOIN words w ON w.id = a.word_id
  `).all() as AdjFormSerialized[];

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    words, srs_state: srs, notes, note_srs_state: noteSrs,
    review_logs: logs, note_review_logs: noteLogs,
    adj_forms: adjForms
  };
}

// ── merge remote → local ────────────────────────────────────────

interface MergeCounts {
  words: number; srsState: number; notes: number;
  noteSrsState: number; reviewLogs: number; noteReviewLogs: number;
  adjForms: number;
}

function mergeIntoLocal(remote: Snapshot): MergeCounts {
  const db = getDb();
  const counts: MergeCounts = {
    words: 0, srsState: 0, notes: 0,
    noteSrsState: 0, reviewLogs: 0, noteReviewLogs: 0,
    adjForms: 0
  };

  const tx = db.transaction(() => {
    // 1) words：upsert by lemma，仅当 remote.updated_at 更新
    const upsertWord = db.prepare(`
      INSERT INTO words (lemma, surface, pos, gender, translation_zh, translation_en,
                         example_fr, notes, impersonal, lemma_plural, lemma_feminine, created_at, updated_at)
      VALUES (@lemma, @surface, @pos, @gender, @translation_zh, @translation_en,
              @example_fr, @notes, @impersonal, @lemma_plural, @lemma_feminine, @created_at, @updated_at)
      ON CONFLICT(lemma) DO UPDATE SET
        surface=excluded.surface, pos=excluded.pos, gender=excluded.gender,
        translation_zh=excluded.translation_zh, translation_en=excluded.translation_en,
        example_fr=excluded.example_fr, notes=excluded.notes,
        impersonal=excluded.impersonal,
        lemma_plural=excluded.lemma_plural,
        lemma_feminine=excluded.lemma_feminine,
        updated_at=excluded.updated_at
      WHERE excluded.updated_at > COALESCE(words.updated_at, words.created_at)
    `);
    // 还需要给新 insert 的 word 创建 srs_state（避免外键孤儿）
    const initSrs = db.prepare(`
      INSERT OR IGNORE INTO srs_state (word_id, due, stability, difficulty,
        elapsed_days, scheduled_days, reps, lapses, state, last_review)
      VALUES (?, ?, 0.5, 5.0, 0, 0, 0, 0, 0, NULL)
    `);
    const lookupWordId = db.prepare(`SELECT id FROM words WHERE lemma = ?`);
    for (const w of remote.words) {
      const before = (lookupWordId.get(w.lemma) as { id: number } | undefined)?.id;
      const result = upsertWord.run({
        lemma: w.lemma, surface: w.surface, pos: w.pos,
        gender: w.gender, translation_zh: w.translation_zh,
        translation_en: w.translation_en, example_fr: w.example_fr,
        notes: w.notes, impersonal: w.impersonal ?? 0,
        lemma_plural: w.lemma_plural ?? null,
        lemma_feminine: w.lemma_feminine ?? null,
        created_at: w.created_at, updated_at: w.updated_at
      });
      if (result.changes > 0) counts.words++;
      const after = (lookupWordId.get(w.lemma) as { id: number } | undefined)?.id;
      if (after && !before) initSrs.run(after, Date.now());
    }

    // 2) srs_state：按 lemma 找 word_id；upsert 仅当 last_review 更新
    const wordIdByLemma = new Map<string, number>();
    for (const r of db.prepare(`SELECT id, lemma FROM words`).all() as { id: number; lemma: string }[]) {
      wordIdByLemma.set(r.lemma, r.id);
    }
    const upsertSrs = db.prepare(`
      INSERT INTO srs_state (word_id, due, stability, difficulty,
        elapsed_days, scheduled_days, reps, lapses, state, last_review)
      VALUES (@word_id, @due, @stability, @difficulty,
              @elapsed_days, @scheduled_days, @reps, @lapses, @state, @last_review)
      ON CONFLICT(word_id) DO UPDATE SET
        due=excluded.due, stability=excluded.stability, difficulty=excluded.difficulty,
        elapsed_days=excluded.elapsed_days, scheduled_days=excluded.scheduled_days,
        reps=excluded.reps, lapses=excluded.lapses, state=excluded.state,
        last_review=excluded.last_review
      WHERE COALESCE(excluded.last_review, 0) > COALESCE(srs_state.last_review, 0)
    `);
    for (const s of remote.srs_state) {
      const wid = wordIdByLemma.get(s.lemma);
      if (!wid) continue;
      const result = upsertSrs.run({ ...s, word_id: wid });
      if (result.changes > 0) counts.srsState++;
    }

    // 3) notes：upsert by uuid
    const upsertNote = db.prepare(`
      INSERT INTO notes (uuid, title, content, created_at, updated_at)
      VALUES (@uuid, @title, @content, @created_at, @updated_at)
      ON CONFLICT(uuid) DO UPDATE SET
        title=excluded.title, content=excluded.content, updated_at=excluded.updated_at
      WHERE excluded.updated_at > notes.updated_at
    `);
    const initNoteSrs = db.prepare(`
      INSERT OR IGNORE INTO note_srs_state (note_id, due, stability, difficulty,
        elapsed_days, scheduled_days, reps, lapses, state, last_review)
      VALUES (?, ?, 0.5, 5.0, 0, 0, 0, 0, 0, NULL)
    `);
    const lookupNoteId = db.prepare(`SELECT id FROM notes WHERE uuid = ?`);
    for (const n of remote.notes) {
      const before = (lookupNoteId.get(n.uuid) as { id: number } | undefined)?.id;
      const result = upsertNote.run(n);
      if (result.changes > 0) counts.notes++;
      const after = (lookupNoteId.get(n.uuid) as { id: number } | undefined)?.id;
      if (after && !before) initNoteSrs.run(after, Date.now());
    }

    // 4) note_srs_state
    const noteIdByUuid = new Map<string, number>();
    for (const r of db.prepare(`SELECT id, uuid FROM notes WHERE uuid IS NOT NULL`).all() as { id: number; uuid: string }[]) {
      noteIdByUuid.set(r.uuid, r.id);
    }
    const upsertNoteSrs = db.prepare(`
      INSERT INTO note_srs_state (note_id, due, stability, difficulty,
        elapsed_days, scheduled_days, reps, lapses, state, last_review)
      VALUES (@note_id, @due, @stability, @difficulty,
              @elapsed_days, @scheduled_days, @reps, @lapses, @state, @last_review)
      ON CONFLICT(note_id) DO UPDATE SET
        due=excluded.due, stability=excluded.stability, difficulty=excluded.difficulty,
        elapsed_days=excluded.elapsed_days, scheduled_days=excluded.scheduled_days,
        reps=excluded.reps, lapses=excluded.lapses, state=excluded.state,
        last_review=excluded.last_review
      WHERE COALESCE(excluded.last_review, 0) > COALESCE(note_srs_state.last_review, 0)
    `);
    for (const s of remote.note_srs_state) {
      const nid = noteIdByUuid.get(s.uuid);
      if (!nid) continue;
      const result = upsertNoteSrs.run({ ...s, note_id: nid });
      if (result.changes > 0) counts.noteSrsState++;
    }

    // 5) review_logs：append-only，按复合键去重
    const checkLog = db.prepare(`
      SELECT 1 FROM review_logs
      WHERE word_id = ? AND reviewed_at = ? AND mode = ?
        AND COALESCE(tense_id, '') = ? AND COALESCE(person, 0) = ?
      LIMIT 1
    `);
    const insertLog = db.prepare(`
      INSERT INTO review_logs (word_id, reviewed_at, rating, mode, correct,
        user_input, expected, tense_id, person)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const log of remote.review_logs) {
      const wid = wordIdByLemma.get(log.lemma);
      if (!wid) continue;
      const exists = checkLog.get(
        wid, log.reviewed_at, log.mode,
        log.tense_id ?? '', log.person ?? 0
      );
      if (exists) continue;
      insertLog.run(
        wid, log.reviewed_at, log.rating, log.mode, log.correct,
        log.user_input, log.expected, log.tense_id, log.person
      );
      counts.reviewLogs++;
    }

    // 6) note_review_logs
    const checkNoteLog = db.prepare(`
      SELECT 1 FROM note_review_logs WHERE note_id = ? AND reviewed_at = ? LIMIT 1
    `);
    const insertNoteLog = db.prepare(`
      INSERT INTO note_review_logs (note_id, reviewed_at, rating) VALUES (?, ?, ?)
    `);
    for (const log of remote.note_review_logs) {
      const nid = noteIdByUuid.get(log.note_uuid);
      if (!nid) continue;
      if (checkNoteLog.get(nid, log.reviewed_at)) continue;
      insertNoteLog.run(nid, log.reviewed_at, log.rating);
      counts.noteReviewLogs++;
    }

    // 7) adj_forms：按 (lemma, form_kind) upsert（INSERT OR REPLACE）
    //    note: word_id 是本地自增；先按 lemma 找本地 id。删除本地多余行的语义不做（避免抖动）。
    const upsertAdj = db.prepare(`
      INSERT INTO adj_forms (word_id, form_kind, surface)
      VALUES (?, ?, ?)
      ON CONFLICT(word_id, form_kind) DO UPDATE SET surface = excluded.surface
    `);
    for (const f of (remote.adj_forms ?? [])) {
      const wid = wordIdByLemma.get(f.lemma);
      if (!wid) continue;
      const result = upsertAdj.run(wid, f.form_kind, f.surface);
      if (result.changes > 0) counts.adjForms++;
    }
  });
  tx();
  return counts;
}

// ── 主流程 ────────────────────────────────────────

let running = false;

export interface RunSyncOptions {
  /** renderer 端传过来的当前 spell session JSON 字符串 */
  spellSessionPayload?: string | null;
  /** renderer 端 localStorage 的修改时间（用于和云端比） */
  spellSessionSavedAt?: number;
}

export interface RunSyncResult {
  ok: boolean;
  error?: string;
  mergedCounts?: MergeCounts;
  /** 如果云上的 spell session 比 local 新，把它返回给 renderer 写回 localStorage */
  spellSessionPayload?: string | null;
}

export async function runSync(opts: RunSyncOptions = {}): Promise<RunSyncResult> {
  if (running) return { ok: false, error: 'sync already running' };
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.token) return { ok: false, error: 'sync disabled' };

  running = true;
  try {
    const local = dumpSnapshot();
    const localSpellSavedAt = opts.spellSessionSavedAt ?? 0;
    let resultSpellPayload: string | null = opts.spellSessionPayload ?? null;

    // 1) fetch remote (or create gist if first time; 但先查云上有没有同名的复用)
    let remoteFiles: GistFiles = {};
    if (!cfg.gistId) {
      // 先列一下当前 token 下所有 gist，看有没有别的机器已经建过 french-deck-sync
      try {
        const all = await listMyGists(cfg.token);
        const existing = all.find(g => g.description === GIST_DESCRIPTION);
        if (existing) {
          console.log(`[sync] adopting existing gist ${existing.id}`);
          saveConfig({ gistId: existing.id });
          // 走正常 fetch + merge 路径，不是 create
          remoteFiles = await fetchGist(cfg.token, existing.id);
        } else {
          // 真的没有 → 创建新的
          const filesToCreate: GistFiles = snapshotToFiles(local);
          if (opts.spellSessionPayload) {
            filesToCreate['spell_session.json'] = {
              content: JSON.stringify({ savedAt: localSpellSavedAt, payload: opts.spellSessionPayload }, null, 2)
            };
          }
          const id = await createGist(cfg.token, filesToCreate, GIST_DESCRIPTION);
          saveConfig({ gistId: id, lastSyncAt: Date.now(), lastError: null });
          console.log(`[sync] created gist ${id}`);
          return { ok: true, mergedCounts: { words: 0, srsState: 0, notes: 0, noteSrsState: 0, reviewLogs: 0, noteReviewLogs: 0, adjForms: 0 } };
        }
      } catch (err) {
        // listMyGists 失败 → 退回到旧逻辑（直接 create）；通常是 token 没 read scope
        console.warn('[sync] listMyGists failed, falling back to create:', err);
        const filesToCreate: GistFiles = snapshotToFiles(local);
        if (opts.spellSessionPayload) {
          filesToCreate['spell_session.json'] = {
            content: JSON.stringify({ savedAt: localSpellSavedAt, payload: opts.spellSessionPayload }, null, 2)
          };
        }
        const id = await createGist(cfg.token, filesToCreate, GIST_DESCRIPTION);
        saveConfig({ gistId: id, lastSyncAt: Date.now(), lastError: null });
        console.log(`[sync] created gist ${id}`);
        return { ok: true, mergedCounts: { words: 0, srsState: 0, notes: 0, noteSrsState: 0, reviewLogs: 0, noteReviewLogs: 0, adjForms: 0 } };
      }
    } else {
      remoteFiles = await fetchGist(cfg.token, cfg.gistId);
    }

    // 2) parse remote snapshot
    const remoteSnapshot = filesToSnapshot(remoteFiles);
    const counts = mergeIntoLocal(remoteSnapshot);

    // 3) spell session：比时间戳，新的赢
    const remoteSpellRaw = remoteFiles['spell_session.json']?.content;
    let remoteSpellSavedAt = 0;
    let remoteSpellPayload: string | null = null;
    if (remoteSpellRaw) {
      try {
        const parsed = JSON.parse(remoteSpellRaw) as SpellSessionFile;
        remoteSpellSavedAt = parsed.savedAt || 0;
        remoteSpellPayload = parsed.payload || null;
      } catch { /* ignore */ }
    }
    if (remoteSpellSavedAt > localSpellSavedAt && remoteSpellPayload) {
      resultSpellPayload = remoteSpellPayload;
    }

    // 4) re-dump merged → push back
    const merged = dumpSnapshot();
    const filesToPush: GistFiles = snapshotToFiles(merged);
    const finalSpellSavedAt = Math.max(localSpellSavedAt, remoteSpellSavedAt);
    const finalSpellPayload = resultSpellPayload;
    if (finalSpellPayload) {
      filesToPush['spell_session.json'] = {
        content: JSON.stringify({ savedAt: finalSpellSavedAt, payload: finalSpellPayload }, null, 2)
      };
    }
    await patchGist(cfg.token, cfg.gistId, filesToPush);

    saveConfig({ lastSyncAt: Date.now(), lastError: null });
    console.log('[sync] done', counts);
    return {
      ok: true,
      mergedCounts: counts,
      spellSessionPayload: remoteSpellSavedAt > localSpellSavedAt ? resultSpellPayload : undefined
    };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.warn('[sync] failed:', msg);
    saveConfig({ lastError: msg });
    return { ok: false, error: msg };
  } finally {
    running = false;
  }
}

// ── helpers ────────────────────────────────────────

function snapshotToFiles(s: Snapshot): GistFiles {
  // 拆成多个文件，让 GitHub Web 上看也舒服
  return {
    'meta.json': { content: JSON.stringify({ schemaVersion: s.schemaVersion, exportedAt: s.exportedAt }, null, 2) },
    'words.json': { content: JSON.stringify(s.words, null, 2) },
    'srs_state.json': { content: JSON.stringify(s.srs_state, null, 2) },
    'notes.json': { content: JSON.stringify(s.notes, null, 2) },
    'note_srs_state.json': { content: JSON.stringify(s.note_srs_state, null, 2) },
    'review_logs.json': { content: JSON.stringify(s.review_logs, null, 2) },
    'note_review_logs.json': { content: JSON.stringify(s.note_review_logs, null, 2) },
    'adj_forms.json': { content: JSON.stringify(s.adj_forms, null, 2) }
  };
}

function filesToSnapshot(files: GistFiles): Snapshot {
  const get = <T>(name: string, fallback: T): T => {
    const f = files[name];
    if (!f) return fallback;
    try { return JSON.parse(f.content) as T; } catch { return fallback; }
  };
  const meta = get<{ schemaVersion?: number; exportedAt?: number }>('meta.json', {});
  return {
    schemaVersion: meta.schemaVersion ?? SCHEMA_VERSION,
    exportedAt: meta.exportedAt ?? 0,
    words: get<WordRow[]>('words.json', []),
    srs_state: get<SrsStateRowSerialized[]>('srs_state.json', []),
    notes: get<NoteRowSerialized[]>('notes.json', []),
    note_srs_state: get<NoteSrsStateRowSerialized[]>('note_srs_state.json', []),
    review_logs: get<ReviewLogSerialized[]>('review_logs.json', []),
    note_review_logs: get<NoteReviewLogSerialized[]>('note_review_logs.json', []),
    adj_forms: get<AdjFormSerialized[]>('adj_forms.json', [])
  };
}
