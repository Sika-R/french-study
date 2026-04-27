import { useEffect, useState } from 'react';

interface NoteRow {
  id: number;
  title: string | null;
  content: string;
  created_at: number;
  updated_at: number;
}

function dayOf(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function NoteEditor() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const reload = async () => {
    const list = await window.api.notes.list({ limit: 200 }) as NoteRow[];
    setNotes(list);
  };

  useEffect(() => { reload(); }, []);

  const startNew = () => {
    setEditingId(null);
    setDraftTitle('');
    setDraftContent('');
  };

  const startEdit = (n: NoteRow) => {
    setEditingId(n.id);
    setDraftTitle(n.title ?? '');
    setDraftContent(n.content);
  };

  const save = async () => {
    if (!draftContent.trim()) {
      setSavedMsg('内容不能为空');
      return;
    }
    if (editingId == null) {
      const r = await window.api.notes.create({
        title: draftTitle.trim() || null,
        content: draftContent
      }) as NoteRow;
      setSavedMsg(`已保存 (id=${r.id})`);
    } else {
      await window.api.notes.update(editingId, {
        title: draftTitle.trim() || null,
        content: draftContent
      });
      setSavedMsg(`已更新 #${editingId}`);
    }
    setDraftTitle('');
    setDraftContent('');
    setEditingId(null);
    reload();
    setTimeout(() => setSavedMsg(''), 2000);
  };

  const remove = async (id: number) => {
    if (!confirm('删除这条笔记？此操作无法撤销。')) return;
    await window.api.notes.delete(id);
    if (editingId === id) startNew();
    reload();
  };

  // 按日期分组显示
  const grouped = notes.reduce<Record<string, NoteRow[]>>((acc, n) => {
    const d = dayOf(n.created_at);
    (acc[d] ??= []).push(n);
    return acc;
  }, {});
  const days = Object.keys(grouped).sort().reverse();

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>
        {editingId == null ? '新建笔记' : `编辑笔记 #${editingId}`}
      </h2>
      <p className="muted">
        想到什么写什么 — 法语语法点、易混词、表达技巧都行。笔记会按 FSRS 间隔在「复习 → 笔记」tab 推送。
      </p>

      <label>标题 (可选)</label>
      <input
        value={draftTitle}
        onChange={e => setDraftTitle(e.target.value)}
        placeholder="如：avoir besoin de + 名词"
      />

      <label style={{ marginTop: 12 }}>内容</label>
      <textarea
        value={draftContent}
        onChange={e => setDraftContent(e.target.value)}
        placeholder="支持多行；可以写例句、对比、规则..."
        rows={8}
        style={{ resize: 'vertical', fontFamily: 'inherit' }}
      />

      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={save}>{editingId == null ? '保存新笔记' : '更新笔记'}</button>
        {editingId != null && (
          <button className="ghost" onClick={startNew}>取消编辑 / 新建</button>
        )}
        {savedMsg && <span className="muted" style={{ marginLeft: 8 }}>{savedMsg}</span>}
      </div>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e6e8ef' }} />

      <h3 style={{ marginTop: 0 }}>已有笔记 ({notes.length})</h3>
      {notes.length === 0 && <p className="muted">还没有笔记。</p>}

      {days.map(day => (
        <div key={day} style={{ marginBottom: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{day}</div>
          {grouped[day].map(n => (
            <div key={n.id} style={{
              padding: '10px 12px', borderRadius: 8, marginBottom: 6,
              background: editingId === n.id ? '#eef1fc' : '#f6f7fb',
              border: editingId === n.id ? '1px solid #4361ee' : '1px solid transparent'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ flex: 1 }}>
                  {n.title || <span className="muted" style={{ fontWeight: 400 }}>(无标题)</span>}
                </strong>
                <span className="muted" style={{ fontSize: 12 }}>{fmtTime(n.created_at)}</span>
                <button className="ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => startEdit(n)}>编辑</button>
                <button className="ghost" style={{ padding: '4px 10px', fontSize: 12, color: '#c0392b' }} onClick={() => remove(n.id)}>删除</button>
              </div>
              <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: 14, color: '#333' }}>
                {n.content.length > 240 ? n.content.slice(0, 240) + '…' : n.content}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
