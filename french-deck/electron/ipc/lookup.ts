import { ipcMain } from 'electron';
import { lexique } from '../../server/dict/lexique.js';
import { verbiste } from '../../server/dict/verbiste.js';
import { lookupWiktionary } from '../../server/dict/wiktionary.js';

export interface LookupResult {
  surface: string;
  lemma: string | null;
  pos: string | null;
  gender: 'm' | 'f' | null;
  translation_en: string | null;
  source: 'lexique' | 'wiktionary' | 'cache' | 'none';
}

export function registerLookupHandlers(): void {
  ipcMain.handle('lookup:word', async (_e, surface: string): Promise<LookupResult> => {
    const s = (surface ?? '').trim();
    if (!s) return { surface: s, lemma: null, pos: null, gender: null, translation_en: null, source: 'none' };

    // 等待 Lexique 加载完成（首次启动可能要几秒）
    await lexique.ready();

    const lex = lexique.lookup(s);
    if (lex) {
      let lemma = lex.lemma;
      if (lex.pos === 'verb') {
        const inf = verbiste.getInfinitive(lex.lemma) ?? lex.lemma;
        lemma = inf;
      }
      // Lexique 本身没有翻译。并行去 Wiktionary 取英文释义（命中缓存就秒回）。
      const wkt = await lookupWiktionary(s).catch(() => null);
      return {
        surface: s,
        lemma,
        pos: lex.pos,
        gender: lex.gender,
        translation_en: wkt?.translation_en ?? null,
        source: 'lexique'
      };
    }

    const wkt = await lookupWiktionary(s);
    if (wkt) {
      return {
        surface: s,
        lemma: s.toLowerCase(),
        pos: wkt.pos ?? null,
        gender: wkt.gender ?? null,
        translation_en: wkt.translation_en ?? null,
        source: wkt.source
      };
    }
    return { surface: s, lemma: null, pos: null, gender: null, translation_en: null, source: 'none' };
  });

  ipcMain.handle('lookup:conjugate', (_e, infinitive: string, mode: string, tense: string, person: number) => {
    return verbiste.conjugate(infinitive, mode, tense, person);
  });

  ipcMain.handle('lookup:tenses', (_e, infinitive: string) => {
    return verbiste.listTenses(infinitive);
  });
}
