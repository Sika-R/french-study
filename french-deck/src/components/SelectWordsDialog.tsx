import { useEffect, useMemo, useState } from 'react';

interface WordRow {
  id: number;
  lemma: string;
  surface: string;
  pos: string;
  gender: 'm' | 'f' | null;
  translation_zh: string | null;
  translation_en: string | null;
  created_at: number;
}

interface DateGroup { day: string; count: number; ids: number[] }

type Mode = 'recommended' | 'byDate' | 'multiSelect' | 'random';

interface Props {
  /** 限制候选池到指定词性 */
  posOnly?: 'verb' | 'adj' | 'noun';
  onConfirm: (ids: number[]) => void;
  onCancel: () => void;
}

const POS_LABEL: Record<string, string> = {
  verb: '动词',
  adj: '形容词',
  noun: '名词'
};

export default function SelectWordsDialog({ posOnly, onConfirm, onCancel }: Props) {
  const [mode, setMode] = useState<Mode>('recommended');
  // 当 posOnly 已经被外层锁死（动词/形容词/名词 tab）时，内部不再展示词性筛选；
  // 否则（拼写 tab）允许在弹窗里临时挑词性。'' 表示不筛。
  const [posFilter, setPosFilter] = useState<string>('');
  const [rawWords, setRawWords] = useState<WordRow[]>([]);
  const [rawDateGroups, setRawDateGroups] = useState<DateGroup[]>([]);
  const [rawRecommendedIds, setRawRecommendedIds] = useState<number[]>([]);
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set());
  const [pickedDates, setPickedDates] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const all = (await window.api.words.list({ limit: 500 })) as WordRow[];
      const filtered = posOnly ? all.filter(w => w.pos === posOnly) : all;
      setRawWords(filtered);

      const ds = (await window.api.words.byDate()) as DateGroup[];
      setRawDateGroups(posOnly
        ? ds.map(d => ({ ...d, ids: d.ids.filter(id => filtered.some(w => w.id === id)) }))
            .filter(d => d.ids.length > 0)
        : ds
      );

      const rec = (await window.api.words.recommended()) as number[];
      setRawRecommendedIds(posOnly ? rec.filter(id => filtered.some(w => w.id === id)) : rec);

      setLoading(false);
    })();
  }, [posOnly]);

  // 词性下拉的可选项：根据当前所有单词聚合
  const posOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of rawWords) counts.set(w.pos, (counts.get(w.pos) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rawWords]);

  // 应用 posFilter（弹窗内的临时筛选）
  const allWords = useMemo(
    () => posFilter ? rawWords.filter(w => w.pos === posFilter) : rawWords,
    [rawWords, posFilter]
  );
  const dateGroups = useMemo(() => {
    if (!posFilter) return rawDateGroups;
    const allowed = new Set(allWords.map(w => w.id));
    return rawDateGroups
      .map(d => ({ ...d, ids: d.ids.filter(id => allowed.has(id)) }))
      .filter(d => d.ids.length > 0);
  }, [rawDateGroups, posFilter, allWords]);
  const recommendedIds = useMemo(() => {
    if (!posFilter) return rawRecommendedIds;
    const allowed = new Set(allWords.map(w => w.id));
    return rawRecommendedIds.filter(id => allowed.has(id));
  }, [rawRecommendedIds, posFilter, allWords]);

  // 切换 posFilter 时清空已选（避免里面残留不在新候选池里的 id）
  useEffect(() => {
    setPickedIds(new Set());
    setPickedDates(new Set());
  }, [posFilter]);

  // 根据当前模式计算最终选定的 word ids
  const finalIds = useMemo<number[]>(() => {
    if (mode === 'recommended') return recommendedIds;
    if (mode === 'byDate') {
      const set = new Set<number>();
      for (const g of dateGroups) if (pickedDates.has(g.day)) g.ids.forEach(i => set.add(i));
      return [...set];
    }
    if (mode === 'multiSelect') return [...pickedIds];
    if (mode === 'random') return allWords.map(w => w.id);
    return [];
  }, [mode, recommendedIds, dateGroups, pickedDates, pickedIds, allWords]);

  const filteredList = useMemo(() => {
    if (!search.trim()) return allWords;
    const q = search.trim().toLowerCase();
    return allWords.filter(w =>
      w.lemma.toLowerCase().includes(q)
      || w.surface.toLowerCase().includes(q)
      || (w.translation_zh ?? '').toLowerCase().includes(q)
      || (w.translation_en ?? '').toLowerCase().includes(q)
    );
  }, [allWords, search]);

  const toggleId = (id: number) => {
    const next = new Set(pickedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setPickedIds(next);
  };
  const toggleDate = (day: string) => {
    const next = new Set(pickedDates);
    next.has(day) ? next.delete(day) : next.add(day);
    setPickedDates(next);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 24,
        width: '90%', maxWidth: 720, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column'
      }}>
        <h2 style={{ marginTop: 0 }}>选择今日要复习的单词{posOnly && ` (仅${POS_LABEL[posOnly] ?? posOnly})`}</h2>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className={mode === 'recommended' ? '' : 'ghost'} onClick={() => setMode('recommended')}>推荐 (按记忆曲线)</button>
          <button className={mode === 'byDate' ? '' : 'ghost'} onClick={() => setMode('byDate')}>按日期</button>
          <button className={mode === 'multiSelect' ? '' : 'ghost'} onClick={() => setMode('multiSelect')}>从列表多选</button>
          <button className={mode === 'random' ? '' : 'ghost'} onClick={() => setMode('random')}>全选 / 纯随机</button>
          {!posOnly && (
            <>
              <span style={{ flex: 1 }} />
              <label className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                词性：
                <select value={posFilter} onChange={e => setPosFilter(e.target.value)} style={{ padding: '4px 8px' }}>
                  <option value="">全部</option>
                  {posOptions.map(([p, n]) => (
                    <option key={p} value={p}>{(POS_LABEL[p] ?? p)} ({n})</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 200 }}>
          {loading && <p className="muted">加载中…</p>}

          {!loading && mode === 'recommended' && (
            <div>
              <p className="muted">FSRS 算法识别出已到期或即将到期（未来 7 天内）的单词。</p>
              <p><strong>{recommendedIds.length}</strong> 个单词将被复习。</p>
              {recommendedIds.length === 0 && <p className="muted">目前没有到期的单词。换个模式试试。</p>}
            </div>
          )}

          {!loading && mode === 'byDate' && (
            <>
              <p className="muted">勾选录入日期，所选日期的所有单词都会进入复习。</p>
              {dateGroups.length === 0 && <p className="muted">还没有可选日期。</p>}
              {dateGroups.map(g => (
                <label key={g.day} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 12px', borderRadius: 6, marginBottom: 4,
                  background: pickedDates.has(g.day) ? '#eef1fc' : 'transparent',
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={pickedDates.has(g.day)}
                    onChange={() => toggleDate(g.day)}
                    style={{ flex: '0 0 auto', width: 16, height: 16, margin: 0 }}
                  />
                  <strong style={{ flex: '0 0 auto' }}>{g.day}</strong>
                  <span className="muted" style={{ flex: 1 }}>— {g.count} 个单词</span>
                </label>
              ))}
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                <button className="ghost" onClick={() => setPickedDates(new Set(dateGroups.map(g => g.day)))}>全选</button>
                <button className="ghost" onClick={() => setPickedDates(new Set())}>清空</button>
              </div>
            </>
          )}

          {!loading && mode === 'multiSelect' && (
            <>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索 lemma / 翻译…"
                style={{ marginBottom: 12 }}
              />
              <p className="muted">已选 {pickedIds.size} / {filteredList.length}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {filteredList.map(w => (
                  <label
                    key={w.id}
                    onClick={() => toggleId(w.id)}
                    style={{
                      padding: '4px 12px', borderRadius: 14,
                      background: pickedIds.has(w.id) ? '#4361ee' : '#eef1fc',
                      color: pickedIds.has(w.id) ? 'white' : '#1f2330',
                      cursor: 'pointer', fontSize: 13
                    }}
                  >
                    {w.lemma}
                    <span style={{ opacity: 0.7, marginLeft: 4, fontSize: 11 }}>
                      {w.translation_zh ?? w.translation_en ?? ''}
                    </span>
                  </label>
                ))}
              </div>
              <div className="row" style={{ marginTop: 12, gap: 6 }}>
                <button className="ghost" onClick={() => setPickedIds(new Set(filteredList.map(w => w.id)))}>全选当前</button>
                <button className="ghost" onClick={() => setPickedIds(new Set())}>清空</button>
              </div>
            </>
          )}

          {!loading && mode === 'random' && (
            <div>
              <p className="muted">把所有 {allWords.length} 个{posOnly ? (POS_LABEL[posOnly] ?? posOnly) : (posFilter ? (POS_LABEL[posFilter] ?? posFilter) : '单词')}都纳入，开始练习时再随机洗牌。</p>
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <span className="muted">最终选定: <strong>{finalIds.length}</strong> 个</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ghost" onClick={onCancel}>取消</button>
            <button onClick={() => onConfirm(finalIds)} disabled={finalIds.length === 0}>开始复习</button>
          </div>
        </div>
      </div>
    </div>
  );
}
