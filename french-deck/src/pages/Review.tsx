import { useEffect, useState } from 'react';
import AccentInput from '../components/AccentInput';
import Practice from './Practice';
import SelectWordsDialog from '../components/SelectWordsDialog';

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

type Tab = 'spell' | 'verb';
type VerbSubMode = 'table' | 'drill' | 'reverse';

export default function Review() {
  const [tab, setTab] = useState<Tab>('spell');
  const [verbSub, setVerbSub] = useState<VerbSubMode>('table');

  // 当前会话选中的 word ids (null 表示未开始 / 还没选)
  const [spellWordIds, setSpellWordIds] = useState<number[] | null>(null);
  const [verbWordIds, setVerbWordIds] = useState<number[] | null>(null);
  const [showDialog, setShowDialog] = useState<'spell' | 'verb' | null>(null);

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e6e8ef', paddingBottom: 12, marginBottom: 16 }}>
        <button className={tab === 'spell' ? '' : 'ghost'} onClick={() => setTab('spell')}>拼写</button>
        <button className={tab === 'verb' ? '' : 'ghost'} onClick={() => setTab('verb')}>动词变位</button>
      </div>

      {tab === 'spell' && (
        spellWordIds == null ? (
          <StartScreen
            title="拼写复习"
            description="给出翻译/词性，让你输入法语单词；名词需选择阴阳性。"
            onStart={() => setShowDialog('spell')}
          />
        ) : (
          <SpellReview wordIds={spellWordIds} onExit={() => setSpellWordIds(null)} />
        )
      )}

      {tab === 'verb' && (
        verbWordIds == null ? (
          <StartScreen
            title="动词变位练习"
            description="先选要练习的动词和时态。三种子模式：填表 / 单题 / 反向识别（认人称）。"
            onStart={() => setShowDialog('verb')}
          />
        ) : (
          <VerbWorkspace
            wordIds={verbWordIds}
            subMode={verbSub}
            setSubMode={setVerbSub}
            onExit={() => setVerbWordIds(null)}
          />
        )
      )}

      {showDialog === 'spell' && (
        <SelectWordsDialog
          onConfirm={ids => { setSpellWordIds(ids); setShowDialog(null); }}
          onCancel={() => setShowDialog(null)}
        />
      )}
      {showDialog === 'verb' && (
        <SelectWordsDialog
          verbOnly
          onConfirm={ids => { setVerbWordIds(ids); setShowDialog(null); }}
          onCancel={() => setShowDialog(null)}
        />
      )}
    </div>
  );
}

function StartScreen({ title, description, onStart }: { title: string; description: string; onStart: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p className="muted" style={{ maxWidth: 480, margin: '0 auto 24px' }}>{description}</p>
      <button onClick={onStart} style={{ padding: '10px 24px', fontSize: 15 }}>选择单词，开始</button>
    </div>
  );
}

function VerbWorkspace({
  wordIds, subMode, setSubMode, onExit
}: {
  wordIds: number[]; subMode: VerbSubMode; setSubMode: (m: VerbSubMode) => void; onExit: () => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className={subMode === 'table' ? '' : 'ghost'} onClick={() => setSubMode('table')}>填表</button>
        <button className={subMode === 'drill' ? '' : 'ghost'} onClick={() => setSubMode('drill')}>单题</button>
        <button className={subMode === 'reverse' ? '' : 'ghost'} onClick={() => setSubMode('reverse')}>反向识别</button>
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 13 }}>已选 {wordIds.length} 个动词</span>
        <button className="ghost" onClick={onExit}>重新选词</button>
      </div>
      <Practice key={subMode} subMode={subMode} wordIds={wordIds} />
    </div>
  );
}

function SpellReview({ wordIds, onExit }: { wordIds: number[]; onExit: () => void }) {
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
    // 从指定 ids 拉单词，用 Fisher-Yates 洗牌
    const rows = (await window.api.words.byIds(wordIds)) as QueueCard[];
    const shuffled = rows.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setQueue(shuffled);
    setIdx(0);
    setDone(shuffled.length === 0);
    resetForCard();
    setLoading(false);
  };

  const resetForCard = () => {
    setInput('');
    setRevealed(null);
    setGenderPick('');
  };

  useEffect(() => { loadQueue(); }, [wordIds]);
  useEffect(() => { resetForCard(); }, [idx, card?.id]);

  if (loading) return <p>加载中…</p>;
  if (done || !card) {
    return (
      <div>
        <h2>🎉 完成 {queue.length} 张卡片！</h2>
        <div className="row">
          <button onClick={loadQueue}>再来一轮</button>
          <button className="ghost" onClick={onExit}>重新选词</button>
        </div>
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
    // 新队列长度（错题压回末尾）
    const newQueueLen = queue.length + (revealed.correct ? 0 : 1);
    if (!revealed.correct) {
      setQueue(q => [...q, card]);
    }
    if (idx + 1 >= newQueueLen) setDone(true);
    else setIdx(idx + 1);
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
