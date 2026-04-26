import axios from 'axios';
import { getDb } from '../db/client.js';

export interface WiktionaryResult {
  surface: string;
  pos?: string;
  gender?: 'm' | 'f' | null;
  translation_en?: string;
  source: 'wiktionary' | 'cache';
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readCache(surface: string): WiktionaryResult | null {
  const db = getDb();
  const row = db.prepare('SELECT payload_json, fetched_at FROM lookup_cache WHERE surface = ?').get(surface) as
    | { payload_json: string; fetched_at: number } | undefined;
  if (!row) return null;
  if (Date.now() - row.fetched_at > CACHE_TTL_MS) return null;
  try {
    return { ...(JSON.parse(row.payload_json) as WiktionaryResult), source: 'cache' };
  } catch {
    return null;
  }
}

function writeCache(surface: string, payload: WiktionaryResult): void {
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO lookup_cache (surface, payload_json, fetched_at) VALUES (?, ?, ?)'
  ).run(surface, JSON.stringify(payload), Date.now());
}

/** Naive parser: pull the first French headword + first translation glosses */
function parseWikitext(wikitext: string, surface: string): Omit<WiktionaryResult, 'source' | 'surface'> {
  const out: Omit<WiktionaryResult, 'source' | 'surface'> = {};
  // Restrict to ==French== section
  const match = wikitext.match(/==French==([\s\S]*?)(?=\n==[^=]|$)/);
  const fr = match ? match[1] : wikitext;

  if (/===Noun===/i.test(fr)) out.pos = 'noun';
  else if (/===Verb===/i.test(fr)) out.pos = 'verb';
  else if (/===Adjective===/i.test(fr)) out.pos = 'adj';
  else if (/===Adverb===/i.test(fr)) out.pos = 'adv';

  if (/\{\{fr-noun\|m/.test(fr) || /\bm\}\}/.test(fr)) out.gender = 'm';
  else if (/\{\{fr-noun\|f/.test(fr) || /\bf\}\}/.test(fr)) out.gender = 'f';

  // first definition line beginning with "# "
  const def = fr.match(/\n#\s+([^\n#*][^\n]*)/);
  if (def) {
    out.translation_en = def[1]
      .replace(/\{\{[^}]*\}\}/g, '')
      .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
      .replace(/'''?/g, '')
      .trim();
  }
  return out;
}

export async function lookupWiktionary(surface: string): Promise<WiktionaryResult | null> {
  const key = surface.trim().toLowerCase();
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const url = 'https://en.wiktionary.org/w/api.php';
    const { data } = await axios.get(url, {
      params: {
        action: 'parse',
        page: surface,
        prop: 'wikitext',
        format: 'json',
        formatversion: 2,
        redirects: 1
      },
      timeout: 5000,
      headers: { 'User-Agent': 'french-deck/0.1 (local app)' }
    });
    const wikitext: string | undefined = data?.parse?.wikitext;
    if (!wikitext) {
      console.warn('[wiktionary] no wikitext for', surface);
      return null;
    }
    const parsed = parseWikitext(wikitext, surface);
    const result: WiktionaryResult = { surface: key, source: 'wiktionary', ...parsed };
    writeCache(key, result);
    return result;
  } catch (err) {
    console.warn('[wiktionary] lookup failed for', surface, ':', (err as Error).message);
    return null;
  }
}
