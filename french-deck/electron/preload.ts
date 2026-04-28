import { contextBridge, ipcRenderer } from 'electron';

const api = {
  words: {
    create: (input: unknown) => ipcRenderer.invoke('words:create', input),
    update: (id: number, patch: unknown) => ipcRenderer.invoke('words:update', id, patch),
    list: (opts?: { limit?: number; offset?: number; search?: string }) =>
      ipcRenderer.invoke('words:list', opts ?? {}),
    delete: (id: number) => ipcRenderer.invoke('words:delete', id),
    count: () => ipcRenderer.invoke('words:count'),
    byDate: () => ipcRenderer.invoke('words:byDate'),
    recommended: () => ipcRenderer.invoke('words:recommended'),
    byIds: (ids: number[]) => ipcRenderer.invoke('words:byIds', ids),
    idsByLemmas: (lemmas: string[]) => ipcRenderer.invoke('words:idsByLemmas', lemmas)
  },
  lookup: {
    word: (surface: string) => ipcRenderer.invoke('lookup:word', surface),
    conjugate: (infinitive: string, mode: string, tense: string, person: number) =>
      ipcRenderer.invoke('lookup:conjugate', infinitive, mode, tense, person),
    tenses: (infinitive: string) => ipcRenderer.invoke('lookup:tenses', infinitive)
  },
  review: {
    queue: (limit?: number) => ipcRenderer.invoke('review:queue', limit ?? 30),
    pickConjugation: (infinitive: string) => ipcRenderer.invoke('review:pickConjugation', infinitive),
    submit: (args: {
      word_id: number;
      mode: 'spell' | 'conjugation';
      user_input: string;
      expected: string;
      rating?: 1 | 2 | 3 | 4;
    }) => ipcRenderer.invoke('review:submit', args),
    errorRateTop: (opts?: { limit?: number; minAttempts?: number }) =>
      ipcRenderer.invoke('review:errorRateTop', opts ?? {}),
    errorRateSpell: (opts?: { limit?: number; minAttempts?: number }) =>
      ipcRenderer.invoke('review:errorRateSpell', opts ?? {}),
    errorRateConjugation: (opts?: { limit?: number; minAttempts?: number }) =>
      ipcRenderer.invoke('review:errorRateConjugation', opts ?? {}),
    errorRateGender: (opts?: { limit?: number; minAttempts?: number }) =>
      ipcRenderer.invoke('review:errorRateGender', opts ?? {}),
    dailyCounts: (days?: number) => ipcRenderer.invoke('review:dailyCounts', days ?? 30),
    summary: () => ipcRenderer.invoke('review:summary')
  },
  practice: {
    tenses: () => ipcRenderer.invoke('practice:tenses'),
    verbs: () => ipcRenderer.invoke('practice:verbs'),
    conjugationTable: (infinitive: string, tenseId: string) =>
      ipcRenderer.invoke('practice:conjugationTable', infinitive, tenseId),
    submitTable: (args: { word_id: number; verb: string; tense_id: string; answers: Record<number, string> }) =>
      ipcRenderer.invoke('practice:submitTable', args),
    submitOne: (args: {
      word_id: number; mode: 'drill' | 'reverse' | 'adj' | 'noun'; tense_id: string; person: number;
      user_input: string; expected: string; correct: boolean;
    }) => ipcRenderer.invoke('practice:submitOne', args),
    errorStatsByTense: (opts?: { minAttempts?: number }) =>
      ipcRenderer.invoke('practice:errorStatsByTense', opts ?? {}),
    pickDrill: (opts: { word_ids: number[]; tense_ids: string[] }) =>
      ipcRenderer.invoke('practice:pickDrill', opts),
    pickReverse: (opts: { word_ids: number[]; tense_ids: string[] }) =>
      ipcRenderer.invoke('practice:pickReverse', opts),
    buildReversePool: (opts: { word_ids: number[]; tense_ids: string[] }) =>
      ipcRenderer.invoke('practice:buildReversePool', opts),
    buildDrillPool: (opts: { word_ids: number[]; tense_ids: string[] }) =>
      ipcRenderer.invoke('practice:buildDrillPool', opts),
    buildAdjPool: (opts: { word_ids: number[] }) =>
      ipcRenderer.invoke('practice:buildAdjPool', opts),
    buildNounPool: (opts: { word_ids: number[] }) =>
      ipcRenderer.invoke('practice:buildNounPool', opts)
  },
  notes: {
    create: (input: { title?: string | null; content: string }) =>
      ipcRenderer.invoke('notes:create', input),
    update: (id: number, patch: { title?: string | null; content?: string }) =>
      ipcRenderer.invoke('notes:update', id, patch),
    delete: (id: number) => ipcRenderer.invoke('notes:delete', id),
    list: (opts?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke('notes:list', opts ?? {}),
    get: (id: number) => ipcRenderer.invoke('notes:get', id),
    byDate: () => ipcRenderer.invoke('notes:byDate'),
    recommended: () => ipcRenderer.invoke('notes:recommended'),
    byIds: (ids: number[]) => ipcRenderer.invoke('notes:byIds', ids),
    submit: (args: { note_id: number; rating: 1 | 2 | 3 | 4 }) =>
      ipcRenderer.invoke('notes:submit', args)
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    setConfig: (patch: { enabled?: boolean; token?: string; gistId?: string | null }) =>
      ipcRenderer.invoke('sync:setConfig', patch),
    validateToken: (token: string) => ipcRenderer.invoke('sync:validateToken', token),
    listSyncGists: () => ipcRenderer.invoke('sync:listSyncGists'),
    run: (opts?: { spellSessionPayload?: string | null; spellSessionSavedAt?: number }) =>
      ipcRenderer.invoke('sync:run', opts ?? {})
  }
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
