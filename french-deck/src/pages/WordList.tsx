import { useEffect, useState } from 'react';

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

export default function WordList() {
  const [rows, setRows] = useState<WordRow[]>([]);
  const [search, setSearch] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await window.api.words.list({ search: search.trim() || undefined });
    setRows(r as WordRow[]);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [search]);

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

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>单词列表 ({rows.length})</h2>
        <input
          style={{ maxWidth: 260 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索 lemma / 翻译…"
        />
      </div>

      <div className="list-row" style={{ fontWeight: 600, color: '#666' }}>
        <div>原型 / 形式</div>
        <div>中文</div>
        <div>英文</div>
        <div></div>
      </div>
      {rows.map(w => (
        <div key={w.id} className="list-row">
          <div>
            <strong>{w.lemma}</strong>
            {w.surface !== w.lemma && <span className="muted"> ({w.surface})</span>}
            <div style={{ marginTop: 4 }}>
              <span className="tag">{w.pos}</span>
              {w.gender === 'm' && <span className="tag gender-m">le</span>}
              {w.gender === 'f' && <span className="tag gender-f">la</span>}
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
              <button className="ghost" onClick={() => setConfirmId(w.id)} disabled={busy}>删除</button>
            )}
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="muted">还没有单词。去「录入新词」添加第一条吧。</p>}
    </div>
  );
}
