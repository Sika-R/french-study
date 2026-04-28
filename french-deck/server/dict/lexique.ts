import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

export type LexPos = 'noun' | 'verb' | 'adj' | 'adv' | 'pronoun' | 'prep' | 'conj' | 'det' | 'interj' | 'other';

export interface LexEntry {
  surface: string;   // ortho
  lemma: string;     // lemme
  pos: LexPos;
  gender: 'm' | 'f' | null;
  number: 's' | 'p' | null; // Lexique nombre 列
  freq: number;      // freqlemfilms2 (字幕频率), 用于消歧
}

// Lexique 词性标签（cgram）映射
const CGRAM_MAP: Record<string, LexPos> = {
  NOM: 'noun',
  VER: 'verb',
  ADJ: 'adj',
  ADV: 'adv',
  PRO: 'pronoun', PRO_per: 'pronoun', PRO_pos: 'pronoun', PRO_dem: 'pronoun', PRO_ind: 'pronoun', PRO_rel: 'pronoun', PRO_int: 'pronoun',
  PRE: 'prep',
  CON: 'conj',
  ART: 'det', ART_def: 'det', ART_ind: 'det',
  ADJ_pos: 'det', ADJ_dem: 'det', ADJ_ind: 'det', ADJ_int: 'det', ADJ_num: 'det',
  ONO: 'interj'
};

function mapPos(cgram: string): LexPos {
  if (CGRAM_MAP[cgram]) return CGRAM_MAP[cgram];
  // VER:... etc
  const head = cgram.split(':')[0]?.split(' ')[0];
  return CGRAM_MAP[head ?? ''] ?? 'other';
}

class LexiqueIndex {
  private bySurface: Map<string, LexEntry[]> = new Map();
  private byLemma: Map<string, LexEntry[]> = new Map();
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;

  async load(filePath: string): Promise<void> {
    if (this.loaded) return;
    if (this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = this._doLoad(filePath);
    return this.loadingPromise;
  }

  private async _doLoad(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      console.warn(`[lexique] dictionary file not found: ${filePath} — skipping`);
      this.loaded = true;
      return;
    }
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let header: string[] | null = null;
    let iOrtho = -1, iLemme = -1, iCgram = -1, iGenre = -1, iNombre = -1, iFreq = -1;

    for await (const line of rl) {
      if (!line) continue;
      const cols = line.split('\t');
      if (!header) {
        header = cols;
        iOrtho = header.indexOf('ortho');
        iLemme = header.indexOf('lemme');
        iCgram = header.indexOf('cgram');
        iGenre = header.indexOf('genre');
        iNombre = header.indexOf('nombre');
        iFreq = header.indexOf('freqlemfilms2');
        continue;
      }
      const surface = cols[iOrtho]?.toLowerCase();
      const lemme = cols[iLemme]?.toLowerCase();
      const cgram = cols[iCgram] ?? '';
      const genre = cols[iGenre] ?? '';
      const nombre = iNombre >= 0 ? (cols[iNombre] ?? '') : '';
      const freqStr = (cols[iFreq] ?? '0').replace(',', '.');
      const freq = parseFloat(freqStr) || 0;
      if (!surface || !lemme) continue;
      const entry: LexEntry = {
        surface,
        lemma: lemme,
        pos: mapPos(cgram),
        gender: genre === 'm' ? 'm' : genre === 'f' ? 'f' : null,
        number: nombre === 's' ? 's' : nombre === 'p' ? 'p' : null,
        freq
      };
      const list = this.bySurface.get(surface);
      if (list) list.push(entry);
      else this.bySurface.set(surface, [entry]);

      const lemmaList = this.byLemma.get(lemme);
      if (lemmaList) lemmaList.push(entry);
      else this.byLemma.set(lemme, [entry]);
    }
    this.loaded = true;
    console.log(`[lexique] loaded ${this.bySurface.size} surface forms, ${this.byLemma.size} lemmas`);
  }

  lookup(surface: string): LexEntry | null {
    const key = surface.trim().toLowerCase();
    const list = this.bySurface.get(key);
    if (!list || list.length === 0) return null;
    // 频率最高的义项胜出（manger 作为动词频率远高于 NOM "食槽"）
    return [...list].sort((a, b) => b.freq - a.freq)[0];
  }

  /** 给定 lemma + pos + gender，反查该形式（取频率最高的单形）。
   *  例：findForm('beau', 'adj', 'f') → 'belle'。 */
  findForm(lemma: string, pos: LexPos, gender: 'm' | 'f'): string | null {
    const list = this.byLemma.get(lemma.trim().toLowerCase());
    if (!list || list.length === 0) return null;
    const matches = list.filter(e => e.pos === pos && e.gender === gender);
    if (matches.length === 0) return null;
    // 单数形通常频率高于复数（belle > belles），freq 排序后取首
    matches.sort((a, b) => b.freq - a.freq);
    return matches[0].surface;
  }

  /** 给定 lemma，返回所有该 lemma 下的 entry（各种 pos / gender / number 的混合） */
  entriesByLemma(lemma: string): LexEntry[] {
    return this.byLemma.get(lemma.trim().toLowerCase()) ?? [];
  }

  isReady(): boolean {
    return this.loaded;
  }

  /** 等待加载完成（若尚未开始则返回 resolved promise） */
  ready(): Promise<void> {
    return this.loadingPromise ?? Promise.resolve();
  }
}

export const lexique = new LexiqueIndex();

export function defaultLexiquePath(resourcesDir: string): string {
  return path.join(resourcesDir, 'dict', 'Lexique383.tsv');
}
