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
  mode          TEXT NOT NULL,                -- 'spell' | 'conjugation' | 'drill' | 'reverse'
  correct       INTEGER NOT NULL,
  user_input    TEXT,
  expected      TEXT,
  tense_id      TEXT,                          -- e.g. 'indicative.present' (变位练习用)
  person        INTEGER                        -- 1..6 (变位练习用，分词留空)
);

CREATE TABLE IF NOT EXISTS lookup_cache (
  surface       TEXT PRIMARY KEY,
  payload_json  TEXT NOT NULL,
  fetched_at    INTEGER NOT NULL
);

-- 学习笔记：每条独立，按 created_at 绑定日期，参与 FSRS 复习
CREATE TABLE IF NOT EXISTS notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT,
  content       TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- 笔记 SRS 状态（与 srs_state 同字段，区分对象）
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

-- 笔记复习日志（独立，避免和单词混在一起）
CREATE TABLE IF NOT EXISTS note_review_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id       INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  reviewed_at   INTEGER NOT NULL,
  rating        INTEGER NOT NULL
);

-- 旧版本缓存按 surface 缓存，新版本按 lemma 缓存，存量缓存可能不准
-- 让用户通过删除 db 文件强制重置（这里不主动清，避免误删）

CREATE INDEX IF NOT EXISTS idx_srs_due ON srs_state(due);
CREATE INDEX IF NOT EXISTS idx_logs_word ON review_logs(word_id);
CREATE INDEX IF NOT EXISTS idx_note_srs_due ON note_srs_state(due);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
