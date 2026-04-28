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
  impersonal?: boolean;
}

/**
 * 已知的非人称动词（仅 il 形式有意义）。
 * 这些动词在标准语法书里都被列为 verbes impersonnels。
 */
const KNOWN_IMPERSONAL_VERBS = new Set<string>([
  'pleuvoir',   // 下雨
  'neiger',     // 下雪
  'grêler',     // 下冰雹
  'geler',      // 结冰（作"天冷"时）
  'tonner',     // 打雷
  'bruiner',    // 下毛毛雨
  'venter',     // 刮风
  'falloir',    // 必须
  'agir',       // s'agir de（仅作非人称用法）
  's\'agir',
  'sembler',    // il semble que（部分非人称）
  'paraître',   // il paraît que
  'suffire',    // il suffit de
  'importer',   // il importe de
  'arriver',    // il arrive que（非人称用法）
]);

function isImpersonalVerb(lemma: string): boolean {
  return KNOWN_IMPERSONAL_VERBS.has(lemma.toLowerCase());
}

/**
 * 元音前阳性单数形式（少数特殊形容词）。
 * 例：beau → bel; nouveau → nouvel; vieux → vieil。
 * 这些形式 Lexique 里没有专门字段标，硬编码兜底。
 */
const VOWEL_FORM_MAP: Record<string, string> = {
  beau: 'bel',
  nouveau: 'nouvel',
  vieux: 'vieil',
  mou: 'mol',
  fou: 'fol'
};

export interface AdjFormsResult {
  m_sg: string | null;
  f_sg: string | null;
  m_pl: string | null;
  f_pl: string | null;
  m_sg_vowel: string | null;
}

/** 给定 lemma，从 Lexique 拼出 5 种 adj 形（找不到的返回 null） */
function pickAdjForms(lemma: string): AdjFormsResult {
  const all = lexique.entriesByLemma(lemma).filter(e => e.pos === 'adj');
  const pickHighest = (g: 'm' | 'f', n: 's' | 'p'): string | null => {
    const cand = all.filter(e => e.gender === g && e.number === n);
    if (cand.length === 0) {
      // 兼容：有的 entry 没有 number 标记 → 回退到只按 gender 取频率最高
      if (n === 's') {
        const fallback = all.filter(e => e.gender === g);
        if (fallback.length === 0) return null;
        fallback.sort((a, b) => b.freq - a.freq);
        return fallback[0].surface;
      }
      return null;
    }
    cand.sort((a, b) => b.freq - a.freq);
    return cand[0].surface;
  };
  return {
    m_sg: pickHighest('m', 's') ?? lemma.toLowerCase(),
    f_sg: pickHighest('f', 's'),
    m_pl: pickHighest('m', 'p'),
    f_pl: pickHighest('f', 'p'),
    m_sg_vowel: VOWEL_FORM_MAP[lemma.toLowerCase()] ?? null
  };
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
      // 用 lemma（原型）去 Wiktionary 取释义；变位形式如 mange 也能拿到 manger 的释义
      const wkt = await lookupWiktionary(lemma).catch(() => null);
      // 动词/副词等不应有 gender
      const gender = lex.pos === 'noun' || lex.pos === 'adj' ? lex.gender : null;
      return {
        surface: s,
        lemma,
        pos: lex.pos,
        gender,
        translation_en: wkt?.translation_en ?? null,
        source: 'lexique',
        impersonal: lex.pos === 'verb' ? isImpersonalVerb(lemma) : false
      };
    }

    const wkt = await lookupWiktionary(s);
    if (wkt) {
      const lemma = s.toLowerCase();
      return {
        surface: s,
        lemma,
        pos: wkt.pos ?? null,
        gender: wkt.gender ?? null,
        translation_en: wkt.translation_en ?? null,
        source: wkt.source,
        impersonal: wkt.pos === 'verb' ? isImpersonalVerb(lemma) : false
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

  /** 给定形容词 lemma，返回 5 种 form（找不到的为 null）。Lexique 已加载完才有结果。 */
  ipcMain.handle('lookup:adjForms', async (_e, lemma: string): Promise<AdjFormsResult> => {
    await lexique.ready();
    const l = (lemma ?? '').trim();
    if (!l) return { m_sg: null, f_sg: null, m_pl: null, f_pl: null, m_sg_vowel: null };
    return pickAdjForms(l);
  });
}
