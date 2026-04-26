import { fsrs, generatorParameters, createEmptyCard, Rating, State, type Card } from 'ts-fsrs';

export type SrsRating = 1 | 2 | 3 | 4; // Again / Hard / Good / Easy

export interface SrsRow {
  word_id: number;
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

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

export function rowFromCard(wordId: number, card: Card): SrsRow {
  return {
    word_id: wordId,
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null
  };
}

export function cardFromRow(row: SrsRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined
  } as Card;
}

export function newCardRow(wordId: number): SrsRow {
  return rowFromCard(wordId, createEmptyCard());
}

export function applyReview(row: SrsRow, rating: SrsRating, now: Date = new Date()): SrsRow {
  const card = cardFromRow(row);
  const map = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy } as const;
  const result = scheduler.next(card, now, map[rating]);
  return rowFromCard(row.word_id, result.card);
}
