import { contextBridge, ipcRenderer } from 'electron';

const api = {
  words: {
    create: (input: unknown) => ipcRenderer.invoke('words:create', input),
    update: (id: number, patch: unknown) => ipcRenderer.invoke('words:update', id, patch),
    list: (opts?: { limit?: number; offset?: number; search?: string }) =>
      ipcRenderer.invoke('words:list', opts ?? {}),
    delete: (id: number) => ipcRenderer.invoke('words:delete', id),
    count: () => ipcRenderer.invoke('words:count')
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
    dailyCounts: (days?: number) => ipcRenderer.invoke('review:dailyCounts', days ?? 30),
    summary: () => ipcRenderer.invoke('review:summary')
  }
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
