import { useEffect, useState } from 'react';
import AccentInput from '../components/AccentInput';
import { fold } from '../utils/fold';

interface AdjItem {
  word: { id: number; lemma: string; translation_zh: string | null; translation_en: string | null };
  masculine: string;
  feminine: string;
}

export default function AdjPractice({ wordIds, onExit }: { wordIds: number[]; onExit: () => void }) {
  const [pool, setPool] = useState<AdjItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [mInput, setMInput] = useState('');
  const [fInput, setFInput] = useState('');
  const [result, setResult] = useState<{ mOk: boolean; fOk: boolean } | null>(null);

  useEffect(() => {
    window.api.practice.buildAdjPool({ word_ids: wordIds })
      .then((p: AdjItem[]) => setPool(p));
  }, []);

  if (!pool) return <p className="muted">加载中…</p>;
  if (pool.length === 0) {
    return (
      <div>
        <p className="muted">没有可练习的形容词（需要 Lexique 中能查到阴性形式）。</p>
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
            // 再洗一轮
            const reshuffled = pool.slice();
            for (let i = reshuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
            }
            setPool(reshuffled);
            setIdx(0);
            setMInput(''); setFInput(''); setResult(null);
          }}
        >再来一轮</button>
      </div>
    );
  }

  const item = pool[idx];

  const submit = () => {
    setResult({
      mOk: fold(mInput) === fold(item.masculine),
      fOk: fold(fInput) === fold(item.feminine)
    });
  };

  const allCorrect = !!result && result.mOk && result.fOk;

  const retryWrong = () => {
    if (!result) return;
    // 锁定的保留，错的清空让用户再填
    if (!result.mOk) setMInput('');
    if (!result.fOk) setFInput('');
    setResult(null);
  };

  const next = async () => {
    if (result) {
      await window.api.practice.submitOne({
        word_id: item.word.id,
        mode: 'adj',
        tense_id: '',
        person: 0,
        user_input: `阳: ${mInput.trim() || '(空)'} | 阴: ${fInput.trim() || '(空)'}`,
        expected: `阳: ${item.masculine} | 阴: ${item.feminine}`,
        correct: allCorrect
      });
      // 没全对 → 错题压回末尾
      if (!allCorrect) {
        setPool(p => p ? [...p, item] : p);
      }
    }
    setMInput(''); setFInput(''); setResult(null);
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ width: 80, color: '#666' }}>阳性 (m)</div>
        <div style={{ flex: 1 }}>
          <AccentInput
            value={mInput}
            onChange={setMInput}
            disabled={!!result && result.mOk}
            placeholder="如 beau"
            autoFocus
            style={{
              background: result ? (result.mOk ? '#e8f7ee' : '#fdecea') : 'white',
              color: result ? (result.mOk ? '#1e7c3a' : '#b1261e') : '#1f2330'
            }}
          />
          {result && !result.mOk && (
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              ✓ 答案：{item.masculine}（再填一次）
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 80, color: '#666' }}>阴性 (f)</div>
        <div style={{ flex: 1 }}>
          <AccentInput
            value={fInput}
            onChange={setFInput}
            disabled={!!result && result.fOk}
            placeholder="如 belle"
            style={{
              background: result ? (result.fOk ? '#e8f7ee' : '#fdecea') : 'white',
              color: result ? (result.fOk ? '#1e7c3a' : '#b1261e') : '#1f2330'
            }}
          />
          {result && !result.fOk && (
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              ✓ 答案：{item.feminine}（再填一次）
            </div>
          )}
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        {!result ? (
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
