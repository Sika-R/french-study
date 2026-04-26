import { useEffect, useState } from 'react';
import AccentInput from '../components/AccentInput';

interface QueueCard {
  id: number;
  lemma: string;
  surface: string;
  pos: string;
  gender: 'm' | 'f' | null;
  translation_zh: string | null;
  translation_en: string | null;
}

interface ConjPick {
  mode: string;
  tense: string;
  person: number;
  expected: string;
}

const PERSON_LABELS = ['je / j’', 'tu', 'il / elle', 'nous', 'vous', 'ils / elles'];
const MODE_LABELS: Record<string, string> = {
  indicative: '直陈式', subjunctive: '虚拟式', conditional: '条件式',
  imperative: '命令式', infinitive: '不定式', participle: '分词'
};
const TENSE_LABELS: Record<string, string> = {
  present: '现在时', imperfect: '未完成过去时', future: '简单将来时',
  'simple-past': '简单过去时', 'past-participle': '过去分词', 'present-participle': '现在分词'
};

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export default function Review() {
  const [queue, setQueue] = useState<QueueCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<'spell' | 'conjugation'>('spell');
  const [conjPick, setConjPick] = useState<ConjPick | null>(null);
  const [genderPick, setGenderPick] = useState<'m' | 'f' | ''>('');
  const [input, setInput] = useState('');
  // revealed: 答案已揭示但尚未自评
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
    setConjPick(null);
  };

  useEffect(() => { loadQueue(); }, []);

  useEffect(() => {
    resetForCard();
    if (!card) return;
    if (mode === 'conjugation' && card.pos === 'verb') {
      window.api.review.pickConjugation(card.lemma).then((p: ConjPick | null) => setConjPick(p));
    }
  }, [idx, mode, card?.id]);

  if (loading) return <div className="card"><p>加载中…</p></div>;
  if (done || !card) {
    return (
      <div className="card">
        <h2>没有到期的复习卡片 🎉</h2>
        <p className="muted">FSRS 会根据你的回答安排下次复习时间，稍后再来吧。</p>
        <button onClick={loadQueue}>刷新</button>
      </div>
    );
  }

  const expectedSpell = card.surface || card.lemma;
  const conjReady = mode === 'conjugation' && conjPick;
  const conjUnavailable = mode === 'conjugation' && card.pos !== 'verb';

  /** 第一步：揭示答案，仅做客户端比对，不写库 */
  const reveal = () => {
    if (mode === 'spell') {
      if (card.pos === 'noun' && card.gender && !genderPick) {
        alert('请先选择阴阳性 (le / la)');
        return;
      }
      const spellOk = fold(input) === fold(expectedSpell);
      const genderOk = !card.gender || genderPick === card.gender;
      setRevealed({ correct: spellOk && genderOk, expected: expectedSpell + (card.gender ? ` [${card.gender}]` : '') });
    } else if (conjPick) {
      setRevealed({ correct: fold(input) === fold(conjPick.expected), expected: conjPick.expected });
    }
  };

  /** 第二步：写库 + 推进卡片。rating 由对错自动决定 */
  const next = async () => {
    if (!revealed) return;
    const expected = mode === 'conjugation' && conjPick ? conjPick.expected
      : expectedSpell + (card.gender ? ` [${card.gender}]` : '');
    const userInput = mode === 'spell'
      ? input.trim() + (genderPick ? ` [${genderPick}]` : '')
      : input.trim();
    await window.api.review.submit({
      word_id: card.id,
      mode,
      user_input: userInput,
      expected,
      rating: revealed.correct ? 3 : 1
    });
    if (idx + 1 >= queue.length) setDone(true); else setIdx(idx + 1);
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{idx + 1} / {queue.length}</span>
        <div>
          <button className={mode === 'spell' ? '' : 'ghost'} onClick={() => setMode('spell')}>拼写</button>
          <button className={mode === 'conjugation' ? '' : 'ghost'} onClick={() => setMode('conjugation')} style={{ marginLeft: 8 }}>变位</button>
        </div>
      </div>

      <hr style={{ border: 0, borderTop: '1px solid #eee' }} />

      {mode === 'spell' && (
        <>
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
        </>
      )}

      {mode === 'conjugation' && (
        <>
          <h2 style={{ marginTop: 0 }}>
            {card.lemma} <span className="muted" style={{ fontSize: 14 }}>({card.translation_zh ?? ''})</span>
          </h2>
          {conjUnavailable && <p className="muted">该词不是动词，无法做变位练习。切换到拼写模式吧。</p>}
          {!conjUnavailable && !conjPick && <p className="muted">未在 Verbiste 词典中找到此动词的变位（确认 resources/dict/ 已放置 verbiste XML）。</p>}
          {conjReady && (
            <>
              <div className="muted" style={{ marginBottom: 12 }}>
                <span className="tag">{MODE_LABELS[conjPick!.mode] ?? conjPick!.mode}</span>
                <span className="tag">{TENSE_LABELS[conjPick!.tense] ?? conjPick!.tense}</span>
                <span className="tag">{PERSON_LABELS[conjPick!.person - 1]}</span>
              </div>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label>请填写变位形式</label>
                  <AccentInput value={input} onChange={setInput} autoFocus placeholder="…" />
                </div>
              </div>
            </>
          )}
        </>
      )}

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
