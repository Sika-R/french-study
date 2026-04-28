import { useEffect, useState } from 'react';
import AccentInput from '../components/AccentInput';
import { fold } from '../utils/fold';

type AdjFormKind = 'm_sg' | 'f_sg' | 'm_pl' | 'f_pl' | 'm_sg_vowel';

interface AdjItem {
  word: { id: number; lemma: string; translation_zh: string | null; translation_en: string | null };
  forms: {
    m_sg: string;
    f_sg: string;
    m_pl: string | null;
    f_pl: string | null;
    m_sg_vowel: string | null;
  };
}

const FORM_LABEL: Record<AdjFormKind, string> = {
  m_sg: '阳性单数',
  f_sg: '阴性单数',
  m_pl: '阳性复数',
  f_pl: '阴性复数',
  m_sg_vowel: '元音前阳单'
};

interface CellState {
  kind: AdjFormKind;
  expected: string;
  user: string;
  ok: boolean | null;   // null = 未评判
  done: boolean;        // 答对后锁定
}

function buildCells(item: AdjItem): CellState[] {
  const out: CellState[] = [];
  const order: AdjFormKind[] = ['m_sg', 'f_sg', 'm_pl', 'f_pl', 'm_sg_vowel'];
  for (const k of order) {
    const v = item.forms[k];
    if (!v) continue;
    out.push({ kind: k, expected: v, user: '', ok: null, done: false });
  }
  return out;
}

export default function AdjPractice({ wordIds, onExit }: { wordIds: number[]; onExit: () => void }) {
  const [pool, setPool] = useState<AdjItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [cells, setCells] = useState<CellState[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    window.api.practice.buildAdjPool({ word_ids: wordIds })
      .then((p: AdjItem[]) => setPool(p));
  }, []);

  // 切换题目时重建 cells
  useEffect(() => {
    if (!pool || idx >= pool.length) return;
    setCells(buildCells(pool[idx]));
    setSubmitted(false);
  }, [pool, idx]);

  if (!pool) return <p className="muted">加载中…</p>;
  if (pool.length === 0) {
    return (
      <div>
        <p className="muted">没有可练习的形容词（需要至少有阴性单数形式：录入时填，或词典查得到）。</p>
        <button onClick={onExit}>返回</button>
      </div>
    );
  }
  if (idx >= pool.length) {
    return (
      <div>
        <h3>🎉 全部 {pool.length} 题练完！</h3>
        <button onClick={onExit}>返回</button>
        <button
          className="ghost"
          style={{ marginLeft: 8 }}
          onClick={() => {
            const reshuffled = pool.slice();
            for (let i = reshuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
            }
            setPool(reshuffled);
            setIdx(0);
          }}
        >再来一轮</button>
      </div>
    );
  }

  const item = pool[idx];

  const submit = () => {
    setCells(prev => prev.map(c => {
      if (c.done) return c;
      const ok = fold(c.user) === fold(c.expected);
      return { ...c, ok, done: ok };
    }));
    setSubmitted(true);
  };

  const allCorrect = cells.length > 0 && cells.every(c => c.done);

  const retryWrong = () => {
    // 错的清空让用户再填，正确的保留 done
    setCells(prev => prev.map(c => c.done ? c : { ...c, user: '', ok: null }));
    setSubmitted(false);
  };

  const next = async () => {
    if (submitted) {
      const userStr = cells.map(c => `${FORM_LABEL[c.kind]}:${c.user.trim() || '(空)'}`).join(' | ');
      const expStr = cells.map(c => `${FORM_LABEL[c.kind]}:${c.expected}`).join(' | ');
      await window.api.practice.submitOne({
        word_id: item.word.id,
        mode: 'adj',
        tense_id: '',
        person: 0,
        user_input: userStr,
        expected: expStr,
        correct: allCorrect
      });
      // 没全对 → 错题压回末尾
      if (!allCorrect) {
        setPool(p => p ? [...p, item] : p);
      }
    }
    setIdx(i => i + 1);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{idx + 1} / {pool.length}</span>
        <button className="ghost" onClick={onExit}>退出</button>
      </div>
      <h3 style={{ marginBottom: 4 }}>
        {item.word.translation_zh ?? item.word.translation_en ?? '(无翻译)'}
        {item.word.translation_zh && item.word.translation_en && (
          <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>· {item.word.translation_en}</span>
        )}
      </h3>
      <div className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
        原型：<strong>{item.word.lemma}</strong>
      </div>

      {cells.map((c, i) => (
        <div key={c.kind} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ width: 100, color: '#666' }}>{FORM_LABEL[c.kind]}</div>
          <div style={{ flex: 1 }}>
            <AccentInput
              value={c.user}
              onChange={v => setCells(prev => prev.map((x, j) => j === i ? { ...x, user: v } : x))}
              disabled={c.done}
              placeholder=""
              autoFocus={i === 0}
              style={{
                background: c.ok == null ? 'white' : (c.ok ? '#e8f7ee' : '#fdecea'),
                color: c.ok == null ? '#1f2330' : (c.ok ? '#1e7c3a' : '#b1261e')
              }}
            />
            {c.ok === false && (
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                ✓ 答案：{c.expected}（再填一次）
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="row" style={{ marginTop: 16 }}>
        {!submitted ? (
          <button onClick={submit}>提交</button>
        ) : allCorrect ? (
          <button onClick={next} autoFocus>下一题</button>
        ) : (
          <>
            <button onClick={retryWrong} autoFocus>重填错题</button>
            <button className="ghost" onClick={next}>跳过本题</button>
          </>
        )}
      </div>
    </div>
  );
}
