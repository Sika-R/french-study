import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

export type LexPos = 'noun' | 'verb' | 'adj' | 'adv' | 'pronoun' | 'prep' | 'conj' | 'det' | 'interj' | 'other';

export interface LexEntry {
  surface: string;   // ortho
  lemma: string;     // lemme
  pos: LexPos;
  gender: 'm' | 'f' | null;
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
    let iOrtho = -1, iLemme = -1, iCgram = -1, iGenre = -1;

    for await (const line of rl) {
      if (!line) continue;
      const cols = line.split('\t');
      if (!header) {
        header = cols;
        iOrtho = header.indexOf('ortho');
        iLemme = header.indexOf('lemme');
        iCgram = header.indexOf('cgram');
        iGenre = header.indexOf('genre');
        continue;
      }
      const surface = cols[iOrtho]?.toLowerCase();
      const lemme = cols[iLemme]?.toLowerCase();
      const cgram = cols[iCgram] ?? '';
      const genre = cols[iGenre] ?? '';
      if (!surface || !lemme) continue;
      const entry: LexEntry = {
        surface,
        lemma: lemme,
        pos: mapPos(cgram),
        gender: genre === 'm' ? 'm' : genre === 'f' ? 'f' : null
      };
      const list = this.bySurface.get(surface);
      if (list) list.push(entry);
      else this.bySurface.set(surface, [entry]);
    }
    this.loaded = true;
    console.log(`[lexique] loaded ${this.bySurface.size} surface forms`);
  }

  lookup(surface: string): LexEntry | null {
    const key = surface.trim().toLowerCase();
    const list = this.bySurface.get(key);
    if (!list || list.length === 0) return null;
    // 选择最常见词性优先：noun > verb > adj > 其它
    const order: LexPos[] = ['noun', 'verb', 'adj', 'adv', 'pronoun', 'prep', 'det', 'conj', 'interj', 'other'];
    return [...list].sort((a, b) => order.indexOf(a.pos) - order.indexOf(b.pos))[0];
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
