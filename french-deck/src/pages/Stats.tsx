import { useEffect, useState } from 'react';

interface Summary { dueNow: number; total: number; learned: number }
interface ErrorRow {
  id: number; lemma: string; surface: string; pos: string; gender: 'm' | 'f' | null;
  translation_zh: string | null; translation_en: string | null;
  error_rate: number; attempts: number;
}
interface DailyRow { day: string; total: number; correct: number }

/** 简易内嵌 SVG 折线图，避免引入 chart 库 */
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
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);

  const load = async () => {
    setSummary((await window.api.review.summary()) as Summary);
    setErrors((await window.api.review.errorRateTop({ limit: 20, minAttempts: 1 })) as ErrorRow[]);
    setDaily((await window.api.review.dailyCounts(30)) as DailyRow[]);
  };

  useEffect(() => { load(); }, []);

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
        <h2 style={{ marginTop: 0 }}>错误率排行 (复习≥1次)</h2>
        {errors.length === 0 && <p className="muted">还没有复习记录。</p>}
        {errors.length > 0 && (
          <>
            <div className="list-row" style={{ fontWeight: 600, color: '#666' }}>
              <div>单词</div>
              <div>翻译</div>
              <div>错误率 / 次数</div>
              <div></div>
            </div>
            {errors.map(r => (
              <div key={r.id} className="list-row">
                <div>
                  <strong>{r.lemma}</strong>
                  <div style={{ marginTop: 4 }}>
                    <span className="tag">{r.pos}</span>
                    {r.gender === 'm' && <span className="tag gender-m">le</span>}
                    {r.gender === 'f' && <span className="tag gender-f">la</span>}
                  </div>
                </div>
                <div>{r.translation_zh ?? r.translation_en ?? '—'}</div>
                <div>
                  <strong style={{ color: r.error_rate > 0.5 ? '#b1261e' : r.error_rate > 0.2 ? '#e67e22' : '#1e7c3a' }}>
                    {(r.error_rate * 100).toFixed(0)}%
                  </strong>
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
