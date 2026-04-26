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
