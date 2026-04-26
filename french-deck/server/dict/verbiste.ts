import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

/**
 * Verbiste 数据：
 *   verbs-fr.xml         —— 列出动词原型 + 模板 (template) 名（如 "aim:er"）
 *   conjugation-fr.xml   —— 模板 -> 各时态/人称的词尾
 *
 * 我们在加载时构造：infinitive -> { template, root }，并把
 * template -> 时态表 缓存起来。在 conjugate() 时拼 root + 词尾。
 */

export interface ConjugationKey {
  mode: string;   // indicative / subjunctive / conditional / imperative / infinitive / participle
  tense: string;  // present / imperfect / future / past-simple ...
  person: number; // 1..6 ; 1=je, 2=tu, 3=il, 4=nous, 5=vous, 6=ils
}

interface VerbInfo { template: string; root: string }
type EndingTable = Record<string, Record<string, (string | null)[]>>;
// endings[mode][tense] = string[6] (some entries may be null)

class Verbiste {
  private verbs: Map<string, VerbInfo> = new Map();
  private templates: Map<string, EndingTable> = new Map();
  private loaded = false;

  load(verbsXmlPath: string, conjXmlPath: string): void {
    if (this.loaded) return;
    if (!fs.existsSync(verbsXmlPath) || !fs.existsSync(conjXmlPath)) {
      console.warn('[verbiste] xml files not found, skipping');
      this.loaded = true;
      return;
    }
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

    const verbsRaw = parser.parse(fs.readFileSync(verbsXmlPath, 'utf-8'));
    const list = verbsRaw['verbs-fr']?.v ?? [];
    for (const v of Array.isArray(list) ? list : [list]) {
      // <v i="aimer" t="aim:er"/>
      const inf = v.i as string;
      const t = v.t as string; // e.g. "aim:er"
      if (!inf || !t) continue;
      const [root, suffix] = t.split(':');
      this.verbs.set(inf, { template: t, root });
      // suffix unused for now
    }

    const conjRaw = parser.parse(fs.readFileSync(conjXmlPath, 'utf-8'));
    const tmplList = conjRaw['conjugation-fr']?.template ?? [];
    for (const tmpl of Array.isArray(tmplList) ? tmplList : [tmplList]) {
      const name = tmpl.name as string; // "aim:er"
      const table: EndingTable = {};
      // tmpl has children like: infinitive, indicative, conditional, subjunctive, imperative, participle
      for (const modeKey of Object.keys(tmpl)) {
        if (modeKey === 'name') continue;
        const modeNode = tmpl[modeKey];
        if (!modeNode || typeof modeNode !== 'object') continue;
        table[modeKey] = {};
        for (const tenseKey of Object.keys(modeNode)) {
          const tenseNode = modeNode[tenseKey];
          if (!tenseNode) continue;
          const persons = tenseNode.p;
          const personArr = Array.isArray(persons) ? persons : (persons ? [persons] : []);
          const slots: (string | null)[] = [null, null, null, null, null, null];
          personArr.forEach((p: any, idx: number) => {
            // p might have <i> or text. Sometimes multiple variants.
            if (typeof p === 'string') slots[idx] = p;
            else if (p?.i) {
              const i = p.i;
              slots[idx] = Array.isArray(i) ? i[0] : i;
            } else if (p === '') slots[idx] = '';
          });
          table[modeKey][tenseKey] = slots;
        }
      }
      this.templates.set(name, table);
    }
    this.loaded = true;
    console.log(`[verbiste] loaded ${this.verbs.size} verbs, ${this.templates.size} templates`);
  }

  /** 根据屈折形式找原型（粗略：仅当输入本身就是不定式或注册过的形式才返回） */
  getInfinitive(form: string): string | null {
    const f = form.trim().toLowerCase();
    if (this.verbs.has(f)) return f;
    return null;
  }

  conjugate(infinitive: string, mode: string, tense: string, person: number): string | null {
    const info = this.verbs.get(infinitive.toLowerCase());
    if (!info) return null;
    const table = this.templates.get(info.template);
    const ending = table?.[mode]?.[tense]?.[person - 1];
    if (ending == null) return null;
    return info.root + ending;
  }

  listTenses(infinitive: string): { mode: string; tense: string }[] {
    const info = this.verbs.get(infinitive.toLowerCase());
    if (!info) return [];
    const table = this.templates.get(info.template);
    if (!table) return [];
    const out: { mode: string; tense: string }[] = [];
    for (const mode of Object.keys(table)) {
      for (const tense of Object.keys(table[mode])) {
        out.push({ mode, tense });
      }
    }
    return out;
  }
}

export const verbiste = new Verbiste();

export function defaultVerbistePaths(resourcesDir: string): { verbs: string; conj: string } {
  return {
    verbs: path.join(resourcesDir, 'dict', 'verbs-fr.xml'),
    conj: path.join(resourcesDir, 'dict', 'conjugation-fr.xml')
  };
}
