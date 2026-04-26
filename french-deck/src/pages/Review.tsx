import { useEffect, useState } from 'react';
import AccentInput from '../components/AccentInput';
import Practice from './Practice';

interface QueueCard {
  id: number;
  lemma: string;
  surface: string;
  pos: string;
  gender: 'm' | 'f' | null;
  translation_zh: string | null;
  translation_en: string | null;
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

type Tab = 'spell' | 'table' | 'drill' | 'reverse';

export default function Review() {
  const [tab, setTab] = useState<Tab>('spell');

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e6e8ef', paddingBottom: 12, marginBottom: 16 }}>
        <button className={tab === 'spell' ? '' : 'ghost'} onClick={() => setTab('spell')}>拼写复习</button>
        <button className={tab === 'table' ? '' : 'ghost'} onClick={() => setTab('table')}>变位填表</button>
        <button className={tab === 'drill' ? '' : 'ghost'} onClick={() => setTab('drill')}>变位单题</button>
        <button className={tab === 'reverse' ? '' : 'ghost'} onClick={() => setTab('reverse')}>反向识别</button>
      </div>

      {tab === 'spell' && <SpellReview />}
      {tab === 'table' && <Practice key="table" subMode="table" />}
      {tab === 'drill' && <Practice key="drill" subMode="drill" />}
      {tab === 'reverse' && <Practice key="reverse" subMode="reverse" />}
    </div>
  );
}

function SpellReview() {
  const [queue, setQueue] = useState<QueueCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [genderPick, setGenderPick] = useState<'m' | 'f' | ''>('');
  const [input, setInput] = useState('');
  const [revealed, setRevealed] = useState<{ correct: boolean; expected: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const card = queue[idx];

  const loadQueue = async () => {
    setLoading(true);
    const q = (await window.api.review.queue(30)) as QueueCard[];
    setQueue(q);
    setIdx(0);
    setDone(q.length === 0);
    resetForCard();
    setLoading(false);
  };

  const resetForCard = () => {
    setInput('');
    setRevealed(null);
    setGenderPick('');
  };

  useEffect(() => { loadQueue(); }, []);
  useEffect(() => { resetForCard(); }, [idx, card?.id]);

  if (loading) return <p>加载中…</p>;
  if (done || !card) {
    return (
      <div>
        <h2>没有到期的复习卡片 🎉</h2>
        <p className="muted">FSRS 会根据你的回答安排下次复习时间，稍后再来吧。</p>
        <button onClick={loadQueue}>刷新</button>
      </div>
    );
  }

  const expectedSpell = card.surface || card.lemma;

  const reveal = () => {
    if (card.pos === 'noun' && card.gender && !genderPick) {
      alert('请先选择阴阳性 (le / la)');
      return;
    }
    const spellOk = fold(input) === fold(expectedSpell);
    const genderOk = !card.gender || genderPick === card.gender;
    setRevealed({
      correct: spellOk && genderOk,
      expected: expectedSpell + (card.gender ? ` [${card.gender}]` : '')
    });
  };

  const next = async () => {
    if (!revealed) return;
    const expected = expectedSpell + (card.gender ? ` [${card.gender}]` : '');
    const userInput = input.trim() + (genderPick ? ` [${genderPick}]` : '');
    await window.api.review.submit({
      word_id: card.id,
      mode: 'spell',
      user_input: userInput,
      expected,
      rating: revealed.correct ? 3 : 1
    });
    if (idx + 1 >= queue.length) setDone(true); else setIdx(idx + 1);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{idx + 1} / {queue.length}</span>
      </div>

      <h2 style={{ marginTop: 0 }}>{card.translation_zh ?? card.translation_en ?? '(无翻译)'}</h2>
      <div className="muted" style={{ marginBottom: 12 }}>
        <span className="tag">{card.pos}</span>
        {card.translation_en && <span>en: {card.translation_en}</span>}
      </div>

      {!revealed && card.pos === 'noun' && card.gender && (
        <div className="row">
          <label style={{ marginRight: 12 }}>
            <input type="radio" name="g" checked={genderPick === 'm'} onChange={() => setGenderPick('m')} /> le (m)
          </label>
          <label>
            <input type="radio" name="g" checked={genderPick === 'f'} onChange={() => setGenderPick('f')} /> la (f)
          </label>
        </div>
      )}

      <div className="row">
        <div style={{ flex: 1 }}>
          <label>请输入法语单词</label>
          <AccentInput value={input} onChange={setInput} autoFocus placeholder="…" />
        </div>
      </div>

      {!revealed ? (
        <div className="row">
          <button onClick={reveal}>提交 / 揭示答案</button>
          <button className="ghost" onClick={() => { if (idx + 1 >= queue.length) setDone(true); else setIdx(idx + 1); }}>跳过</button>
        </div>
      ) : (
        <>
          <div style={{
            background: revealed.correct ? '#e8f7ee' : '#fdecea',
            color: revealed.correct ? '#1e7c3a' : '#b1261e',
            padding: 12, borderRadius: 8, marginTop: 12
          }}>
            <strong>{revealed.correct ? '✓ 正确' : '✗ 答案：' + revealed.expected}</strong>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={next} autoFocus>下一张</button>
          </div>
        </>
      )}
    </div>
  );
}
