import { useEffect, useMemo, useRef, useState } from 'react';
import EditWordDialog from '../components/EditWordDialog';

interface WordRow {
  id: number;
  lemma: string;
  surface: string;
  pos: string;
  gender: 'm' | 'f' | null;
  translation_zh: string | null;
  translation_en: string | null;
  example_fr: string | null;
  notes: string | null;
  impersonal: number | null;
  created_at: number;
}

const POS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'noun', label: '名词' },
  { value: 'verb', label: '动词' },
  { value: 'adj', label: '形容词' },
  { value: 'adv', label: '副词' },
  { value: 'pronoun', label: '代词' },
  { value: 'prep', label: '介词' },
  { value: 'conj', label: '连词' },
  { value: 'det', label: '限定词' },
  { value: 'interj', label: '叹词' },
  { value: 'other', label: '其它' }
];

function fmtDay(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDay(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export default function WordList() {
  const [allRows, setAllRows] = useState<WordRow[]>([]);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<string>('');
  const [dayFilter, setDayFilter] = useState<string>(''); // '' = 全部, 'YYYY-MM-DD'
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [editing, setEditing] = useState<WordRow | null>(null);
  const [editingAdjForms, setEditingAdjForms] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const load = async () => {
    const r = await window.api.words.list({ limit: 5000 });
    setAllRows(r as WordRow[]);
  };

  useEffect(() => { load(); }, []);

  // 所有有词的日期（每个日期 → 词数）
  const dayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of allRows) {
      const d = fmtDay(w.created_at);
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }, [allRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(w => {
      if (posFilter && w.pos !== posFilter) return false;
      if (dayFilter && fmtDay(w.created_at) !== dayFilter) return false;
      if (q) {
        const hay = [
          w.lemma, w.surface,
          w.translation_zh ?? '', w.translation_en ?? '',
          w.example_fr ?? '', w.notes ?? ''
        ].join('|').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, search, posFilter, dayFilter]);

  const doDelete = async () => {
    if (confirmId == null) return;
    const id = confirmId;
    setConfirmId(null);
    setBusy(true);
    try {
      await window.api.words.delete(id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const clearFilters = () => { setSearch(''); setPosFilter(''); setDayFilter(''); };
  const hasFilter = !!(search || posFilter || dayFilter);

  return (
    <div className="card" style={{ maxWidth: 1100 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>单词列表 ({rows.length}{hasFilter && ` / ${allRows.length}`})</h2>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        <input
          style={{ flex: '1 1 200px', minWidth: 180 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索 lemma / 翻译 / 例句 / 备注…"
        />
        <select value={posFilter} onChange={e => setPosFilter(e.target.value)} style={{ width: 130 }}>
          <option value="">全部词性</option>
          {POS_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <button
          className={dayFilter ? '' : 'ghost'}
          onClick={() => setShowCalendar(true)}
          style={{ minWidth: 140 }}
        >
          📅 {dayFilter || '全部日期'}
        </button>
        {hasFilter && <button className="ghost" onClick={clearFilters}>清空过滤</button>}
      </div>

      <div className="list-row" style={{ fontWeight: 600, color: '#666', marginTop: 12 }}>
        <div>原型 / 形式</div>
        <div>中文</div>
        <div>英文</div>
        <div></div>
      </div>
      {rows.map(w => {
        const hasExtra = !!(w.example_fr || w.notes);
        return (
          <div key={w.id} style={{ borderBottom: '1px solid #eef0f4' }}>
            <div className="list-row" style={{ borderBottom: 'none' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong>{w.lemma}</strong>
                  {w.surface !== w.lemma && <span className="muted">({w.surface})</span>}
                </div>
                <div style={{ marginTop: 4 }}>
                  <span className="tag">{w.pos}</span>
                  {w.gender === 'm' && <span className="tag gender-m">le</span>}
                  {w.gender === 'f' && <span className="tag gender-f">la</span>}
                  <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>{fmtDay(w.created_at)}</span>
                </div>
              </div>
              <div>{w.translation_zh ?? '—'}</div>
              <div>{w.translation_en ?? '—'}</div>
              <div>
                {confirmId === w.id ? (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button onClick={doDelete} disabled={busy} style={{ background: '#e74c3c', padding: '4px 8px', fontSize: 12 }}>确认</button>
                    <button className="ghost" onClick={() => setConfirmId(null)} style={{ padding: '4px 8px', fontSize: 12 }}>取消</button>
                  </span>
                ) : (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button className="ghost" onClick={async () => {
                      // 预拉 adj_forms（仅 adj 才需要，但调用统一）
                      let forms: Record<string, string> | null = null;
                      if (w.pos === 'adj') {
                        try {
                          const map = await (window as any).api.words.adjFormsByIds([w.id]) as Record<number, Record<string, string>>;
                          forms = map[w.id] ?? null;
                        } catch { /* ignore */ }
                      }
                      setEditingAdjForms(forms);
                      setEditing(w);
                    }} disabled={busy} style={{ padding: '4px 8px', fontSize: 12 }}>编辑</button>
                    <button className="ghost" onClick={() => setConfirmId(w.id)} disabled={busy} style={{ padding: '4px 8px', fontSize: 12 }}>删除</button>
                  </span>
                )}
              </div>
            </div>
            {hasExtra && (
              <div style={{
                padding: '0 12px 10px', marginLeft: 4,
                fontSize: 13, color: '#555',
                borderLeft: '3px solid #eef1fc'
              }}>
                {w.example_fr && (
                  <div style={{ marginBottom: w.notes ? 6 : 0 }}>
                    <span className="muted" style={{ fontSize: 11, marginRight: 6 }}>例句</span>
                    <span style={{ fontStyle: 'italic' }}>{w.example_fr}</span>
                  </div>
                )}
                {w.notes && (
                  <div>
                    <span className="muted" style={{ fontSize: 11, marginRight: 6 }}>备注</span>
                    <span>{w.notes}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {rows.length === 0 && (
        <p className="muted" style={{ marginTop: 16 }}>
          {hasFilter ? '没有匹配的单词。' : '还没有单词。去「录入新词」添加第一条吧。'}
        </p>
      )}

      {editing && (
        <EditWordDialog
          word={editing}
          initialAdjForms={editingAdjForms ?? undefined}
          onClose={() => { setEditing(null); setEditingAdjForms(null); }}
          onSaved={() => load()}
        />
      )}

      {showCalendar && (
        <CalendarPicker
          dayCounts={dayCounts}
          selected={dayFilter}
          onPick={(d) => { setDayFilter(d); setShowCalendar(false); }}
          onClear={() => { setDayFilter(''); setShowCalendar(false); }}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </div>
  );
}

// ─── 日历选择器 ─────────────────────────────────────

function CalendarPicker({
  dayCounts, selected, onPick, onClear, onClose
}: {
  dayCounts: Map<string, number>;
  selected: string;
  onPick: (day: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  // 找最早的有内容的日期；初始月份默认为「最近有词的日期」所在月
  const sortedDays = useMemo(
    () => Array.from(dayCounts.keys()).sort(),
    [dayCounts]
  );
  const initialMonth = useMemo(() => {
    const ref = selected || sortedDays[sortedDays.length - 1] || fmtDay(Date.now());
    const { y, m } = parseDay(ref);
    return { y, m };
  }, [selected, sortedDays]);

  const [{ y, m }, setMonth] = useState(initialMonth);

  const earliest = sortedDays[0];
  const latest = sortedDays[sortedDays.length - 1];

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 当前月的格子
  const grid = useMemo(() => {
    const first = new Date(y, m - 1, 1);
    const startWeekday = first.getDay(); // 0 (Sun) - 6
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: Array<{ day: number | null; key: string }> = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ day: null, key: `pad-${i}` });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, key: `d-${d}` });
    }
    // 补齐到 6 行 * 7 = 42（让高度稳定）
    while (cells.length % 7 !== 0) cells.push({ day: null, key: `tail-${cells.length}` });
    return cells;
  }, [y, m]);

  const goPrev = () => {
    const ny = m === 1 ? y - 1 : y;
    const nm = m === 1 ? 12 : m - 1;
    setMonth({ y: ny, m: nm });
  };
  const goNext = () => {
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    setMonth({ y: ny, m: nm });
  };
  const canPrev = !earliest || `${y}-${String(m).padStart(2, '0')}` > earliest.slice(0, 7);
  const canNext = !latest || `${y}-${String(m).padStart(2, '0')}` < latest.slice(0, 7);

  const monthKey = (d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const monthTotal = useMemo(() => {
    let n = 0;
    for (const [k, v] of dayCounts) {
      if (k.startsWith(`${y}-${String(m).padStart(2, '0')}`)) n += v;
    }
    return n;
  }, [dayCounts, y, m]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'white', borderRadius: 12, padding: 20,
        width: 360
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button className="ghost" onClick={goPrev} disabled={!canPrev}
            style={{ padding: '4px 10px', fontSize: 14 }}>‹</button>
          <strong>{y} 年 {m} 月 <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>({monthTotal} 词)</span></strong>
          <button className="ghost" onClick={goNext} disabled={!canNext}
            style={{ padding: '4px 10px', fontSize: 14 }}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
          {['日', '一', '二', '三', '四', '五', '六'].map(w => (
            <div key={w} style={{ textAlign: 'center', fontSize: 12, color: '#888', padding: '4px 0' }}>{w}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {grid.map(cell => {
            if (cell.day == null) return <div key={cell.key} />;
            const k = monthKey(cell.day);
            const count = dayCounts.get(k) ?? 0;
            const enabled = count > 0;
            const isSelected = k === selected;
            return (
              <button
                key={cell.key}
                onClick={() => enabled && onPick(k)}
                disabled={!enabled}
                title={enabled ? `${k} · ${count} 个词` : undefined}
                style={{
                  padding: '8px 0',
                  fontSize: 13,
                  background: isSelected ? '#4361ee' : (enabled ? '#eef1fc' : 'transparent'),
                  color: isSelected ? 'white' : (enabled ? '#1f2330' : '#ccc'),
                  border: 'none',
                  borderRadius: 6,
                  cursor: enabled ? 'pointer' : 'default',
                  position: 'relative'
                }}
              >
                {cell.day}
                {enabled && !isSelected && (
                  <span style={{
                    position: 'absolute', bottom: 2, right: 4,
                    fontSize: 9, color: '#4361ee', fontWeight: 600
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <button className="ghost" onClick={onClear} style={{ padding: '6px 12px', fontSize: 13 }}>清除选择</button>
          <button className="ghost" onClick={onClose} style={{ padding: '6px 12px', fontSize: 13 }}>关闭</button>
        </div>
      </div>
    </div>
  );
}
