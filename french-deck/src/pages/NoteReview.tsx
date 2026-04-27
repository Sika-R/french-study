import { useEffect, useState } from 'react';

interface NoteRow {
  id: number;
  title: string | null;
  content: string;
  created_at: number;
  updated_at: number;
}

function fmtDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NoteReview({ noteIds, onExit }: { noteIds: number[]; onExit: () => void }) {
  const [queue, setQueue] = useState<NoteRow[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const rows = (await window.api.notes.byIds(noteIds)) as NoteRow[];
      // 洗牌
      const shuffled = rows.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setQueue(shuffled);
      setLoading(false);
      setDone(shuffled.length === 0);
    })();
  }, [noteIds]);

  if (loading) return <p className="muted">加载中…</p>;
  if (done || queue.length === 0) {
    return (
      <div>
        <h3>🎉 完成 {queue.length} 条笔记复习！</h3>
        <button onClick={onExit}>返回</button>
      </div>
    );
  }

  const note = queue[idx];

  const grade = async (rating: 1 | 2 | 3 | 4) => {
    await window.api.notes.submit({ note_id: note.id, rating });
    setRevealed(false);
    if (idx + 1 >= queue.length) setDone(true);
    else setIdx(idx + 1);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{idx + 1} / {queue.length}</span>
        <button className="ghost" onClick={onExit}>退出</button>
      </div>

      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        {fmtDay(note.created_at)}
      </div>
      <h2 style={{ marginTop: 0, marginBottom: 12 }}>
        {note.title || <span className="muted" style={{ fontWeight: 400 }}>(无标题)</span>}
      </h2>

      {!revealed ? (
        <div>
          <div style={{
            padding: 24, borderRadius: 8, background: '#f6f7fb',
            textAlign: 'center', color: '#888', marginBottom: 16
          }}>
            先回想一下这条笔记的内容…
          </div>
          <button onClick={() => setRevealed(true)} autoFocus>显示内容</button>
        </div>
      ) : (
        <>
          <div style={{
            padding: 16, borderRadius: 8, background: '#fffbe8',
            whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.6,
            marginBottom: 16, border: '1px solid #f0e0a0'
          }}>
            {note.content}
          </div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            掌握情况：
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => grade(1)}
              style={{ background: '#e74c3c' }}
            >Again（没记住）</button>
            <button
              onClick={() => grade(2)}
              style={{ background: '#e67e22' }}
            >Hard（模糊）</button>
            <button
              onClick={() => grade(3)}
              autoFocus
            >Good（记得）</button>
            <button
              onClick={() => grade(4)}
              style={{ background: '#27ae60' }}
            >Easy（轻松）</button>
          </div>
        </>
      )}
    </div>
  );
}
