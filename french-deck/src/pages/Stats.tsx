import { useEffect, useMemo, useState } from 'react';

interface Summary { dueNow: number; total: number; learned: number }
interface SpellRow {
  id: number; lemma: string; surface: string; pos: string; gender: 'm' | 'f' | null;
  translation_zh: string | null; translation_en: string | null;
  error_rate: number; attempts: number; expected: string | null;
}
interface ConjRow {
  id: number; lemma: string;
  translation_zh: string | null; translation_en: string | null;
  tense_id: string; person: number | null;
  error_rate: number; attempts: number; expected: string | null;
}
interface GenderRow {
  id: number; lemma: string; pos: string; gender: 'm' | 'f' | null;
  translation_zh: string | null; translation_en: string | null;
  mode: string; error_rate: number; attempts: number; expected: string | null;
}
interface DailyRow { day: string; total: number; correct: number }
interface TenseStat { tense_id: string; person: number | null; error_rate: number; attempts: number }
interface TenseDef { id: string; zh: string; fr: string }

const PERSON_LABELS: Record<number | string, string> = {
  0: '(无人称)', 1: 'je', 2: 'tu', 3: 'il/elle', 4: 'nous', 5: 'vous', 6: 'ils/elles'
};

type Category = 'spell' | 'conj' | 'gender';
const CATEGORY_LABEL: Record<Category, string> = {
  spell: '拼写',
  conj: '变位',
  gender: '阴阳'
};

function rateColor(r: number): string {
  return r > 0.5 ? '#b1261e' : r > 0.2 ? '#e67e22' : '#1e7c3a';
}

function Sparkline({ data, height = 120 }: { data: DailyRow[]; height?: number }) {
  if (data.length === 0) return <p className="muted">最近 30 天暂无复习记录。</p>;
  const W = 600, H = height, pad = 24;
  const max = Math.max(...data.map(d => d.total), 1);
  const x = (i: number) => pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const totalPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.total)}`).join(' ');
  const correctPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.correct)}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: 700 }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#ccc" />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#ccc" />
      <text x={pad} y={pad - 6} fontSize="11" fill="#666">每日复习次数 (max={max})</text>
      <path d={totalPath} stroke="#4361ee" strokeWidth="2" fill="none" />
      <path d={correctPath} stroke="#27ae60" strokeWidth="2" fill="none" strokeDasharray="4 3" />
      {data.map((d, i) => (
        <circle key={d.day} cx={x(i)} cy={y(d.total)} r={2.5} fill="#4361ee">
          <title>{d.day}: {d.correct}/{d.total} 正确</title>
        </circle>
      ))}
      <text x={W - pad} y={H - 6} fontSize="11" textAnchor="end" fill="#4361ee">总数 ─</text>
      <text x={W - pad - 70} y={H - 6} fontSize="11" textAnchor="end" fill="#27ae60">正确 ┄</text>
    </svg>
  );
}

export default function Stats() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [tenseStats, setTenseStats] = useState<TenseStat[]>([]);
  const [tenseDefs, setTenseDefs] = useState<TenseDef[]>([]);

  // 三类错误数据
  const [spellRows, setSpellRows] = useState<SpellRow[]>([]);
  const [conjRows, setConjRows] = useState<ConjRow[]>([]);
  const [genderRows, setGenderRows] = useState<GenderRow[]>([]);

  // 视图状态
  const [view, setView] = useState<'grouped' | 'flat'>('grouped');
  const [minAttempts, setMinAttempts] = useState(1);
  const [enabledCats, setEnabledCats] = useState<Set<Category>>(new Set(['spell', 'conj', 'gender']));

  const load = async () => {
    const api = (window as any).api;
    setSummary(await api.review.summary() as Summary);
    setDaily(await api.review.dailyCounts(30) as DailyRow[]);
    setTenseStats(await api.practice.errorStatsByTense({ minAttempts: 1 }) as TenseStat[]);
    setTenseDefs(await api.practice.tenses() as TenseDef[]);
    setSpellRows(await api.review.errorRateSpell({ limit: 100, minAttempts: 1 }) as SpellRow[]);
    setConjRows(await api.review.errorRateConjugation({ limit: 200, minAttempts: 1 }) as ConjRow[]);
    setGenderRows(await api.review.errorRateGender({ limit: 100, minAttempts: 1 }) as GenderRow[]);
  };

  useEffect(() => { load(); }, []);

  const tenseLabel = (id: string) => tenseDefs.find(t => t.id === id)?.zh ?? id;

  // flat 视图：把三类合成一张表，过滤
  type FlatRow = {
    category: Category;
    id: number; lemma: string;
    context: string;        // 时态/人称 | (空)
    expected: string | null;
    translation: string;
    error_rate: number; attempts: number;
    extra?: { pos?: string; gender?: 'm' | 'f' | null };
  };
  const flatRows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    if (enabledCats.has('spell')) {
      for (const r of spellRows) {
        if (r.attempts < minAttempts) continue;
        out.push({
          category: 'spell',
          id: r.id, lemma: r.lemma, context: '',
          expected: r.expected ?? r.surface ?? r.lemma,
          translation: r.translation_zh ?? r.translation_en ?? '—',
          error_rate: r.error_rate, attempts: r.attempts,
          extra: { pos: r.pos, gender: r.gender }
        });
      }
    }
    if (enabledCats.has('conj')) {
      for (const r of conjRows) {
        if (r.attempts < minAttempts) continue;
        out.push({
          category: 'conj',
          id: r.id, lemma: r.lemma,
          context: `${tenseLabel(r.tense_id)} · ${r.person == null ? '—' : PERSON_LABELS[r.person]}`,
          expected: r.expected,
          translation: r.translation_zh ?? r.translation_en ?? '—',
          error_rate: r.error_rate, attempts: r.attempts
        });
      }
    }
    if (enabledCats.has('gender')) {
      for (const r of genderRows) {
        if (r.attempts < minAttempts) continue;
        out.push({
          category: 'gender',
          id: r.id, lemma: r.lemma,
          context: r.mode === 'adj-form' ? '形容词阴阳形式' : `名词性别（${r.gender ?? '?'}）`,
          expected: r.expected,
          translation: r.translation_zh ?? r.translation_en ?? '—',
          error_rate: r.error_rate, attempts: r.attempts,
          extra: { pos: r.pos, gender: r.gender }
        });
      }
    }
    out.sort((a, b) => b.error_rate - a.error_rate || b.attempts - a.attempts);
    return out;
  }, [spellRows, conjRows, genderRows, enabledCats, minAttempts, tenseDefs]);

  const toggleCat = (c: Category) => {
    const next = new Set(enabledCats);
    next.has(c) ? next.delete(c) : next.add(c);
    setEnabledCats(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ maxWidth: 900 }}>
        <h2 style={{ marginTop: 0 }}>概览</h2>
        {summary && (
          <div style={{ display: 'flex', gap: 32 }}>
            <div><div className="muted">今日待复习</div><div style={{ fontSize: 28, fontWeight: 700 }}>{summary.dueNow}</div></div>
            <div><div className="muted">总词数</div><div style={{ fontSize: 28, fontWeight: 700 }}>{summary.total}</div></div>
            <div><div className="muted">已学过</div><div style={{ fontSize: 28, fontWeight: 700 }}>{summary.learned}</div></div>
          </div>
        )}
      </div>

      <div className="card" style={{ maxWidth: 900 }}>
        <h2 style={{ marginTop: 0 }}>近 30 天复习曲线</h2>
        <Sparkline data={daily} />
      </div>

      <div className="card" style={{ maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>错误统计</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={view === 'grouped' ? '' : 'ghost'} onClick={() => setView('grouped')}>分类视图</button>
            <button className={view === 'flat' ? '' : 'ghost'} onClick={() => setView('flat')}>单表 + 过滤</button>
          </div>
        </div>

        {view === 'grouped' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* 拼写 */}
            <section>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>原型 / 拼写错误率</h3>
              {spellRows.length === 0 ? <p className="muted">还没有拼写练习记录。</p> : (
                <>
                  <div className="list-row" style={{ fontWeight: 600, color: '#666',
                    gridTemplateColumns: '1.2fr 1fr 1fr 1fr' }}>
                    <div>单词</div><div>翻译</div><div>正确答案</div><div>错误率 / 次数</div>
                  </div>
                  {spellRows.slice(0, 20).map(r => (
                    <div key={r.id} className="list-row" style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr' }}>
                      <div>
                        <strong>{r.lemma}</strong>
                        <div style={{ marginTop: 4 }}>
                          <span className="tag">{r.pos}</span>
                          {r.gender === 'm' && <span className="tag gender-m">le</span>}
                          {r.gender === 'f' && <span className="tag gender-f">la</span>}
                        </div>
                      </div>
                      <div>{r.translation_zh ?? r.translation_en ?? '—'}</div>
                      <div style={{ color: '#1e7c3a', fontFamily: 'monospace', fontSize: 13 }}>
                        {r.expected ?? r.surface ?? r.lemma}
                      </div>
                      <div>
                        <strong style={{ color: rateColor(r.error_rate) }}>{(r.error_rate * 100).toFixed(0)}%</strong>
                        <span className="muted"> / {r.attempts}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </section>

            {/* 变位 */}
            <section>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>变位错误率（按时态 × 人称分别统计）</h3>
              {conjRows.length === 0 ? <p className="muted">还没有变位练习记录。</p> : (
                <>
                  <div className="list-row" style={{ fontWeight: 600, color: '#666',
                    gridTemplateColumns: '1fr 0.9fr 0.6fr 1fr 0.9fr' }}>
                    <div>动词</div><div>时态</div><div>人称</div><div>正确变位</div><div>错误率 / 次数</div>
                  </div>
                  {conjRows.slice(0, 30).map((r, i) => (
                    <div key={i} className="list-row" style={{ gridTemplateColumns: '1fr 0.9fr 0.6fr 1fr 0.9fr' }}>
                      <div>
                        <strong>{r.lemma}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>{r.translation_zh ?? r.translation_en ?? ''}</div>
                      </div>
                      <div>{tenseLabel(r.tense_id)}</div>
                      <div>{r.person == null ? '—' : PERSON_LABELS[r.person]}</div>
                      <div style={{ color: '#1e7c3a', fontFamily: 'monospace', fontSize: 13 }}>
                        {r.expected ?? '—'}
                      </div>
                      <div>
                        <strong style={{ color: rateColor(r.error_rate) }}>{(r.error_rate * 100).toFixed(0)}%</strong>
                        <span className="muted"> / {r.attempts}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </section>

            {/* 阴阳 */}
            <section>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>阴阳变化错误率</h3>
              {genderRows.length === 0 ? <p className="muted">还没有阴阳练习记录。</p> : (
                <>
                  <div className="list-row" style={{ fontWeight: 600, color: '#666',
                    gridTemplateColumns: '1fr 1fr 1.2fr 1fr' }}>
                    <div>单词</div><div>类型</div><div>正确答案</div><div>错误率 / 次数</div>
                  </div>
                  {genderRows.slice(0, 20).map((r, i) => (
                    <div key={i} className="list-row" style={{ gridTemplateColumns: '1fr 1fr 1.2fr 1fr' }}>
                      <div>
                        <strong>{r.lemma}</strong>
                        <div style={{ marginTop: 4 }}>
                          <span className="tag">{r.pos}</span>
                          {r.gender === 'm' && <span className="tag gender-m">le</span>}
                          {r.gender === 'f' && <span className="tag gender-f">la</span>}
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {r.mode === 'adj-form' ? '形容词阴阳形式' : '名词性别 le/la'}
                      </div>
                      <div style={{ color: '#1e7c3a', fontFamily: 'monospace', fontSize: 13 }}>
                        {r.expected ?? '—'}
                      </div>
                      <div>
                        <strong style={{ color: rateColor(r.error_rate) }}>{(r.error_rate * 100).toFixed(0)}%</strong>
                        <span className="muted"> / {r.attempts}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </section>
          </div>
        )}

        {view === 'flat' && (
          <div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 13 }}>类别：</span>
                {(['spell', 'conj', 'gender'] as Category[]).map(c => (
                  <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 0, cursor: 'pointer' }}>
                    <input type="checkbox" checked={enabledCats.has(c)} onChange={() => toggleCat(c)} />
                    <span>{CATEGORY_LABEL[c]}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                <span className="muted" style={{ fontSize: 13 }}>最少次数：</span>
                <input
                  type="number" min={1} max={50}
                  value={minAttempts}
                  onChange={e => setMinAttempts(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: 60, padding: '4px 6px' }}
                />
              </div>
            </div>

            {flatRows.length === 0 ? <p className="muted">没有匹配的记录。</p> : (
              <>
                <div className="list-row" style={{ fontWeight: 600, color: '#666',
                  gridTemplateColumns: '60px 1fr 1.2fr 0.9fr 0.9fr 1fr' }}>
                  <div>类别</div><div>单词</div><div>上下文</div><div>正确答案</div><div>翻译</div><div>错误率 / 次数</div>
                </div>
                {flatRows.slice(0, 100).map((r, i) => (
                  <div key={i} className="list-row" style={{ gridTemplateColumns: '60px 1fr 1.2fr 0.9fr 0.9fr 1fr' }}>
                    <div><span className="tag">{CATEGORY_LABEL[r.category]}</span></div>
                    <div>
                      <strong>{r.lemma}</strong>
                      {r.extra?.pos && (
                        <div style={{ marginTop: 4 }}>
                          <span className="tag">{r.extra.pos}</span>
                          {r.extra.gender === 'm' && <span className="tag gender-m">le</span>}
                          {r.extra.gender === 'f' && <span className="tag gender-f">la</span>}
                        </div>
                      )}
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>{r.context || '—'}</div>
                    <div style={{ color: '#1e7c3a', fontFamily: 'monospace', fontSize: 13 }}>
                      {r.expected ?? '—'}
                    </div>
                    <div>{r.translation}</div>
                    <div>
                      <strong style={{ color: rateColor(r.error_rate) }}>{(r.error_rate * 100).toFixed(0)}%</strong>
                      <span className="muted"> / {r.attempts}</span>
                    </div>
                  </div>
                ))}
                {flatRows.length > 100 && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>仅显示前 100 条；调高「最少次数」可过滤更多。</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ maxWidth: 900 }}>
        <h2 style={{ marginTop: 0 }}>变位错误率（全局：所有动词的时态×人称汇总）</h2>
        <p className="muted" style={{ fontSize: 13 }}>不分动词，看哪些时态/人称大家普遍容易错。</p>
        {tenseStats.length === 0 && <p className="muted">还没有变位练习记录。</p>}
        {tenseStats.length > 0 && (
          <>
            <div className="list-row" style={{ fontWeight: 600, color: '#666' }}>
              <div>时态</div><div>人称</div><div>错误率 / 次数</div><div></div>
            </div>
            {tenseStats.map((r, i) => (
              <div key={i} className="list-row">
                <div>{tenseLabel(r.tense_id)}</div>
                <div>{r.person == null ? '—' : PERSON_LABELS[r.person]}</div>
                <div>
                  <strong style={{ color: rateColor(r.error_rate) }}>{(r.error_rate * 100).toFixed(0)}%</strong>
                  <span className="muted"> / {r.attempts}</span>
                </div>
                <div></div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
