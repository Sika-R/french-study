import { useEffect, useState } from 'react';

interface NounItem {
  word: {
    id: number;
    lemma: string;
    gender: 'm' | 'f';
    translation_zh: string | null;
    translation_en: string | null;
  };
}

export default function NounPractice({ wordIds, onExit }: { wordIds: number[]; onExit: () => void }) {
  const [pool, setPool] = useState<NounItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [pick, setPick] = useState<'m' | 'f' | null>(null);
  const [meaningInput, setMeaningInput] = useState('');
  const [revealed, setRevealed] = useState<{ genderOk: boolean } | null>(null);
  const [meaningSelfGrade, setMeaningSelfGrade] = useState<boolean | null>(null);

  useEffect(() => {
    window.api.practice.buildNounPool({ word_ids: wordIds })
      .then((p: NounItem[]) => setPool(p));
  }, []);

  if (!pool) return <p className="muted">加载中…</p>;
  if (pool.length === 0) {
    return (
      <div>
        <p className="muted">没有可练习的名词（需要 gender 已知）。</p>
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
            setPick(null); setMeaningInput(''); setRevealed(null); setMeaningSelfGrade(null);
          }}
        >再来一轮</button>
      </div>
    );
  }

  const item = pool[idx];

  const reveal = () => {
    setRevealed({ genderOk: pick === item.word.gender });
  };

  const next = async () => {
    if (revealed) {
      const correct = revealed.genderOk && meaningSelfGrade !== false;
      const userInput = `${pick ?? '(未选)'} | 意思: ${meaningInput || '(未填)'} [自评:${meaningSelfGrade == null ? '未评' : meaningSelfGrade ? '对' : '错'}]`;
      await window.api.practice.submitOne({
        word_id: item.word.id,
        mode: 'noun',
        tense_id: '',
        person: 0,
        user_input: userInput,
        expected: item.word.gender,
        correct
      });
      // 错题压回末尾
      if (!correct) {
        setPool(p => p ? [...p, item] : p);
      }
    }
    setPick(null); setMeaningInput(''); setRevealed(null); setMeaningSelfGrade(null);
    setIdx(i => i + 1);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{idx + 1} / {pool.length}</span>
        <button className="ghost" onClick={onExit}>退出</button>
      </div>

      <div className="muted" style={{ marginBottom: 6, fontSize: 13 }}>
        判断这个名词的阴阳性：
      </div>
      <h2 style={{ margin: '6px 0 16px', fontSize: 36, color: '#4361ee' }}>__ {item.word.lemma}</h2>

      <div style={{ marginBottom: 12 }}>
        <label>性别</label>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button
            type="button"
            className={pick === 'm' ? '' : 'ghost'}
            onClick={() => !revealed && setPick('m')}
            disabled={!!revealed}
            style={{ padding: '6px 18px' }}
          >le (m)</button>
          <button
            type="button"
            className={pick === 'f' ? '' : 'ghost'}
            onClick={() => !revealed && setPick('f')}
            disabled={!!revealed}
            style={{ padding: '6px 18px' }}
          >la (f)</button>
        </div>
      </div>

      <div>
        <label>意思 <span className="muted" style={{ fontSize: 12 }}>(可选；揭示答案后自评)</span></label>
        <input
          value={meaningInput}
          onChange={e => setMeaningInput(e.target.value)}
          disabled={!!revealed}
          placeholder="例如：猫 / cat"
        />
      </div>

      {revealed && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 8,
          background: (revealed.genderOk && meaningSelfGrade !== false) ? '#e8f7ee' : '#fdecea',
          color: (revealed.genderOk && meaningSelfGrade !== false) ? '#1e7c3a' : '#b1261e'
        }}>
          <div>
            性别：{revealed.genderOk ? '✓ 正确' : '✗'} 答案
            <strong> {item.word.gender === 'm' ? 'le (m)' : 'la (f)'}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            意思参考：
            <strong>{item.word.translation_zh ?? '(无中文)'}</strong>
            {item.word.translation_en && <span className="muted"> · {item.word.translation_en}</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
            <span className="muted" style={{ fontSize: 13 }}>意思我答的：</span>
            <button
              type="button"
              onClick={() => setMeaningSelfGrade(true)}
              style={{
                padding: '4px 12px', fontSize: 13,
                background: meaningSelfGrade === true ? '#27ae60' : '#eef1fc',
                color: meaningSelfGrade === true ? 'white' : '#1f2330'
              }}
            >✓ 对了</button>
            <button
              type="button"
              onClick={() => setMeaningSelfGrade(false)}
              style={{
                padding: '4px 12px', fontSize: 13,
                background: meaningSelfGrade === false ? '#e74c3c' : '#eef1fc',
                color: meaningSelfGrade === false ? 'white' : '#1f2330'
              }}
            >✗ 错了</button>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        {!revealed ? (
          <button onClick={reveal} disabled={pick === null}>提交</button>
        ) : (
          <button onClick={next} autoFocus>下一题</button>
        )}
      </div>
    </div>
  );
}
