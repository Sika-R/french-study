import { useEffect, useState } from 'react';

interface NoteRow {
  id: number;
  title: string | null;
  content: string;
  created_at: number;
  updated_at: number;
}

interface DateGroup { day: string; count: number; ids: number[] }

type Mode = 'recommended' | 'byDate' | 'all';

interface Props {
  onConfirm: (ids: number[]) => void;
  onCancel: () => void;
}

export default function SelectNotesDialog({ onConfirm, onCancel }: Props) {
  const [mode, setMode] = useState<Mode>('recommended');
  const [allNotes, setAllNotes] = useState<NoteRow[]>([]);
  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [recommendedIds, setRecommendedIds] = useState<number[]>([]);
  const [pickedDates, setPickedDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const list = await window.api.notes.list({ limit: 1000 }) as NoteRow[];
      setAllNotes(list);
      const ds = await window.api.notes.byDate() as DateGroup[];
      setDateGroups(ds);
      const rec = await window.api.notes.recommended() as number[];
      setRecommendedIds(rec);
      setLoading(false);
    })();
  }, []);

  const toggleDate = (day: string) => {
    const next = new Set(pickedDates);
    next.has(day) ? next.delete(day) : next.add(day);
    setPickedDates(next);
  };

  const finalIds: number[] = (() => {
    if (mode === 'recommended') return recommendedIds;
    if (mode === 'byDate') {
      const set = new Set<number>();
      for (const g of dateGroups) if (pickedDates.has(g.day)) g.ids.forEach(i => set.add(i));
      return [...set];
    }
    return allNotes.map(n => n.id);
  })();

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 24,
        width: '90%', maxWidth: 600, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column'
      }}>
        <h2 style={{ marginTop: 0 }}>选择要复习的笔记</h2>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className={mode === 'recommended' ? '' : 'ghost'} onClick={() => setMode('recommended')}>推荐 (按记忆曲线)</button>
          <button className={mode === 'byDate' ? '' : 'ghost'} onClick={() => setMode('byDate')}>按日期</button>
          <button className={mode === 'all' ? '' : 'ghost'} onClick={() => setMode('all')}>全选</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 200 }}>
          {loading && <p className="muted">加载中…</p>}

          {!loading && mode === 'recommended' && (
            <div>
              <p className="muted">FSRS 算法识别出已到期或 7 天内将到期的笔记。</p>
              <p><strong>{recommendedIds.length}</strong> 条笔记将被复习。</p>
              {recommendedIds.length === 0 && <p className="muted">目前没有到期的笔记。</p>}
            </div>
          )}

          {!loading && mode === 'byDate' && (
            <>
              <p className="muted">勾选录入日期，所选日期的所有笔记都会进入复习。</p>
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
                  <span className="muted" style={{ flex: 1 }}>— {g.count} 条笔记</span>
                </label>
              ))}
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                <button className="ghost" onClick={() => setPickedDates(new Set(dateGroups.map(g => g.day)))}>全选</button>
                <button className="ghost" onClick={() => setPickedDates(new Set())}>清空</button>
              </div>
            </>
          )}

          {!loading && mode === 'all' && (
            <p className="muted">把全部 {allNotes.length} 条笔记都纳入，开始时随机洗牌。</p>
          )}
        </div>

        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <span className="muted">最终选定: <strong>{finalIds.length}</strong> 条</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ghost" onClick={onCancel}>取消</button>
            <button onClick={() => onConfirm(finalIds)} disabled={finalIds.length === 0}>开始复习</button>
          </div>
        </div>
      </div>
    </div>
  );
}
