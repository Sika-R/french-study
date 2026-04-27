import { useEffect, useMemo, useState } from 'react';
import AccentInput from '../components/AccentInput';

interface VerbCard {
  id: number;
  lemma: string;
  translation_zh: string | null;
  translation_en: string | null;
}

interface TenseDef {
  id: string;
  mode: string;
  tense: string;
  zh: string;
  fr: string;
  persons: number[];
}

const PERSON_LABELS: Record<number, string> = {
  0: '(无人称)',
  1: 'je / j’',
  2: 'tu',
  3: 'il / elle / on',
  4: 'nous',
  5: 'vous',
  6: 'ils / elles'
};

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** Fisher–Yates 洗牌（不改原数组） */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 把按 verbId 分组的题目"穿插交错"——尽量避免连续两道题来自同一动词。
 * 算法：每轮取每个动词组队首一个，组成一轮，轮内打乱顺序；继续直到所有组空。
 */
function interleaveByVerb<T extends { word: { id: number } }>(items: T[]): T[] {
  const groups = new Map<number, T[]>();
  for (const x of items) {
    const arr = groups.get(x.word.id);
    if (arr) arr.push(x); else groups.set(x.word.id, [x]);
  }
  // 每个组先打乱
  for (const arr of groups.values()) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  const result: T[] = [];
  while (groups.size > 0) {
    const round: T[] = [];
    for (const [vid, arr] of [...groups.entries()]) {
      round.push(arr.shift()!);
      if (arr.length === 0) groups.delete(vid);
    }
    // 轮内打乱
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [round[i], round[j]] = [round[j], round[i]];
    }
    result.push(...round);
  }
  return result;
}

type SubMode = 'table' | 'drill' | 'reverse';

interface Props {
  subMode: SubMode;
  wordIds: number[];   // 已由外层 SelectWordsDialog 选定的动词 ids
}

export default function Practice({ subMode, wordIds }: Props) {
  const [tenses, setTenses] = useState<TenseDef[]>([]);
  const [verbs, setVerbs] = useState<VerbCard[]>([]);
  const [selectedTenses, setSelectedTenses] = useState<Set<string>>(new Set());
  const [started, setStarted] = useState(false);

  useEffect(() => {
    window.api.practice.tenses().then((t: TenseDef[]) => setTenses(t));
    // 只取 wordIds 范围内、且在 Verbiste 中可变位的动词
    (async () => {
      const all = (await window.api.practice.verbs()) as VerbCard[];
      const filtered = all.filter(v => wordIds.includes(v.id));
      setVerbs(filtered);
    })();
  }, [wordIds]);

  const toggleTense = (id: string) => {
    const next = new Set(selectedTenses);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedTenses(next);
  };

  if (!started) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>
          {subMode === 'table' && '变位填表（一次填一个时态的全部 6 格）'}
          {subMode === 'drill' && '变位单题（随机给时态/人称，填变位）'}
          {subMode === 'reverse' && '反向识别（给变位，写出主语和意思）'}
        </h3>

        <div style={{ marginTop: 16 }}>
          <h4>选择时态 ({selectedTenses.size} / {tenses.length})</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {tenses.map(t => (
              <label key={t.id} style={{
                display: 'flex', gap: 8, alignItems: 'center',
                padding: '6px 10px', borderRadius: 6,
                background: selectedTenses.has(t.id) ? '#eef1fc' : 'transparent',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={selectedTenses.has(t.id)}
                  onChange={() => toggleTense(t.id)}
                />
                <span><strong>{t.zh}</strong> <span className="muted" style={{ fontSize: 12 }}>{t.fr}</span></span>
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8, gap: 6 }}>
            <button className="ghost" onClick={() => setSelectedTenses(new Set(tenses.map(t => t.id)))}>全选</button>
            <button className="ghost" onClick={() => setSelectedTenses(new Set())}>清空</button>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <h4>动词 ({verbs.length} 个)</h4>
          {verbs.length === 0 && <p className="muted">所选单词中没有可变位的动词。换个范围吧。</p>}
          {verbs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {verbs.map(v => (
                <span key={v.id} className="tag">{v.lemma}</span>
              ))}
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 20 }}>
          <button
            onClick={() => setStarted(true)}
            disabled={selectedTenses.size === 0 || verbs.length === 0}
          >开始练习</button>
        </div>
      </div>
    );
  }

  const tenseList = tenses.filter(t => selectedTenses.has(t.id));

  if (subMode === 'table') {
    return <TablePractice verbs={verbs} tenses={tenseList} onExit={() => setStarted(false)} />;
  }
  if (subMode === 'drill') {
    return <DrillPractice verbs={verbs} tenses={tenseList} onExit={() => setStarted(false)} />;
  }
  return <ReversePractice verbs={verbs} tenses={tenseList} onExit={() => setStarted(false)} />;
}

/* ───────────────── 模式 1: 整表填空 ───────────────── */
function TablePractice({ verbs, tenses, onExit }: { verbs: VerbCard[]; tenses: TenseDef[]; onExit: () => void }) {
  const [verbIdx, setVerbIdx] = useState(0);
  const [tenseIdx, setTenseIdx] = useState(0);
  const [table, setTable] = useState<{ person: number; expected: string | null }[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState<{ person: number; correct: boolean; expected: string | null; user_input: string }[] | null>(null);
  // 已答对、需要锁定的人称 → 其正确答案
  const [lockedCorrect, setLockedCorrect] = useState<Record<number, string>>({});

  const verb = verbs[verbIdx];
  const tense = tenses[tenseIdx];

  useEffect(() => {
    if (!verb || !tense) return;
    setTable(null);
    setAnswers({});
    setSubmitted(null);
    setLockedCorrect({});
    window.api.practice.conjugationTable(verb.lemma, tense.id).then(setTable);
  }, [verb?.id, tense?.id]);

  if (!verb || !tense) return <div className="card"><p className="muted">没有可练习的动词或时态。</p><button onClick={onExit}>返回</button></div>;

  const submit = async () => {
    if (!table) return;
    // 合并：已锁定的正确答案 + 本轮新填的答案
    const fullAnswers: Record<number, string> = { ...lockedCorrect, ...answers };
    const r = (await window.api.practice.submitTable({
      word_id: verb.id,
      verb: verb.lemma,
      tense_id: tense.id,
      answers: fullAnswers
    })) as { person: number; correct: boolean; expected: string | null; user_input: string }[];
    setSubmitted(r);
    // 把这一轮新答对的也加入锁定
    const nextLocked = { ...lockedCorrect };
    r.forEach(row => { if (row.correct) nextLocked[row.person] = row.user_input; });
    setLockedCorrect(nextLocked);
  };

  const allCorrect = submitted ? submitted.every(r => r.correct) : false;

  const retryWrong = () => {
    if (!submitted) return;
    // 清空错的人称的输入，让用户重填
    const cleaned: Record<number, string> = {};
    setAnswers(cleaned);
    setSubmitted(null);
  };

  const next = () => {
    if (tenseIdx + 1 < tenses.length) setTenseIdx(tenseIdx + 1);
    else if (verbIdx + 1 < verbs.length) { setVerbIdx(verbIdx + 1); setTenseIdx(0); }
    else onExit();
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">动词 {verbIdx + 1}/{verbs.length} · 时态 {tenseIdx + 1}/{tenses.length}</span>
        <button className="ghost" onClick={onExit}>退出</button>
      </div>
      <h3 style={{ marginBottom: 4 }}>{verb.lemma} <span className="muted" style={{ fontSize: 14 }}>({verb.translation_zh ?? verb.translation_en ?? ''})</span></h3>
      <div className="muted" style={{ marginBottom: 16 }}>
        <span className="tag">{tense.zh}</span>
        <span className="muted" style={{ fontSize: 12 }}>{tense.fr}</span>
      </div>

      {!table && <p className="muted">加载中…</p>}
      {table && table.map(slot => {
        const correctRow = submitted?.find(r => r.person === slot.person);
        const lockedAns = lockedCorrect[slot.person];
        const isLocked = !!lockedAns;
        const displayValue = isLocked
          ? lockedAns
          : (correctRow ? (answers[slot.person] ?? '') : (answers[slot.person] ?? ''));
        const isWrongRow = correctRow && !correctRow.correct;
        return (
          <div key={slot.person} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ width: 130, color: '#666' }}>{PERSON_LABELS[slot.person]}</div>
            <div style={{ flex: 1 }}>
              <input
                value={displayValue}
                disabled={isLocked || (!!submitted && !!correctRow)}
                onChange={e => setAnswers({ ...answers, [slot.person]: e.target.value })}
                style={{
                  background: isLocked
                    ? '#e8f7ee'
                    : isWrongRow ? '#fdecea' : 'white',
                  color: isLocked
                    ? '#1e7c3a'
                    : isWrongRow ? '#b1261e' : '#1f2330'
                }}
              />
              {isWrongRow && (
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  ✓ 答案：{correctRow!.expected ?? '(无)'}（再填一次）
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="row" style={{ marginTop: 16 }}>
        {!submitted ? (
          <button onClick={submit}>提交</button>
        ) : allCorrect ? (
          <button onClick={next} autoFocus>下一组</button>
        ) : (
          <>
            <button onClick={retryWrong} autoFocus>重填错题</button>
            <button className="ghost" onClick={next}>跳过本组</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────────── 模式 2: 单题 drill ───────────────── */
interface DrillItem {
  word: VerbCard;
  tense: TenseDef;
  person: number;
  expected: string;
}

function DrillPractice({ verbs, tenses, onExit }: { verbs: VerbCard[]; tenses: TenseDef[]; onExit: () => void }) {
  const [pool, setPool] = useState<DrillItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [revealed, setRevealed] = useState<{ correct: boolean; expected: string } | null>(null);

  const word_ids = useMemo(() => verbs.map(v => v.id), [verbs]);
  const tense_ids = useMemo(() => tenses.map(t => t.id), [tenses]);

  useEffect(() => {
    window.api.practice.buildDrillPool({ word_ids, tense_ids })
      .then((p: DrillItem[]) => setPool(interleaveByVerb(p)));
  }, []);

  if (!pool) return <p className="muted">加载中…</p>;
  if (pool.length === 0) {
    return (
      <div>
        <p className="muted">没有可抽取的题目。</p>
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
          onClick={() => { setPool(interleaveByVerb(pool)); setIdx(0); setInput(''); setRevealed(null); }}
        >再来一轮</button>
      </div>
    );
  }

  const item = pool[idx];

  const reveal = () => {
    setRevealed({ correct: fold(input) === fold(item.expected), expected: item.expected });
  };
  const next = async () => {
    if (revealed) {
      await window.api.practice.submitOne({
        word_id: item.word.id,
        mode: 'drill',
        tense_id: item.tense.id,
        person: item.person,
        user_input: input.trim(),
        expected: item.expected,
        correct: revealed.correct
      });
      // 错题压回队列末尾，直到全部做对
      if (!revealed.correct) {
        setPool(p => p ? [...p, item] : p);
      }
    }
    setInput('');
    setRevealed(null);
    setIdx(i => i + 1);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{idx + 1} / {pool.length}</span>
        <button className="ghost" onClick={onExit}>退出</button>
      </div>
      <h3 style={{ marginBottom: 4 }}>
        {item.word.lemma} <span className="muted" style={{ fontSize: 14 }}>({item.word.translation_zh ?? item.word.translation_en ?? ''})</span>
      </h3>
      <div style={{ fontSize: 18, margin: '8px 0 16px' }}>
        <strong style={{ color: '#4361ee' }}>{PERSON_LABELS[item.person]}</strong>
        <span className="tag" style={{ marginLeft: 12 }}>{item.tense.zh}</span>
      </div>

      <AccentInput value={input} onChange={setInput} autoFocus placeholder="填入变位形式…" />

      {revealed && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 8,
          background: revealed.correct ? '#e8f7ee' : '#fdecea',
          color: revealed.correct ? '#1e7c3a' : '#b1261e'
        }}>
          <strong>{revealed.correct ? '✓ 正确' : `✗ 答案：${revealed.expected}`}</strong>
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        {!revealed ? <button onClick={reveal}>提交</button> : <button onClick={next} autoFocus>下一题</button>}
      </div>
    </div>
  );
}

/* ───────────────── 模式 3: 反向识别 ───────────────── */
interface ReverseItem {
  word: VerbCard;
  tense: TenseDef;
  persons: number[];     // 所有正确的同形人称（多选答案）
  person: number;        // 兼容旧字段，等于 persons[0]
  conjugated: string;
}

function ReversePractice({ verbs, tenses, onExit }: { verbs: VerbCard[]; tenses: TenseDef[]; onExit: () => void }) {
  const [pool, setPool] = useState<ReverseItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [personPicks, setPersonPicks] = useState<Set<number>>(new Set());
  const [meaningInput, setMeaningInput] = useState('');
  const [revealed, setRevealed] = useState<{ personOk: boolean } | null>(null);
  const [meaningSelfGrade, setMeaningSelfGrade] = useState<boolean | null>(null);

  const word_ids = useMemo(() => verbs.map(v => v.id), [verbs]);
  const tense_ids = useMemo(() => tenses.map(t => t.id), [tenses]);

  useEffect(() => {
    window.api.practice.buildReversePool({ word_ids, tense_ids })
      .then((p: ReverseItem[]) => setPool(interleaveByVerb(p)));
  }, []);

  if (!pool) return <p className="muted">加载中…</p>;
  if (pool.length === 0) {
    return (
      <div>
        <p className="muted">没有可抽取的题目。</p>
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
            setPool(interleaveByVerb(pool));
            setIdx(0);
            setPersonPicks(new Set());
            setMeaningInput('');
            setRevealed(null);
            setMeaningSelfGrade(null);
          }}
        >再来一轮</button>
      </div>
    );
  }

  const item = pool[idx];

  const togglePerson = (p: number) => {
    if (revealed) return;
    const next = new Set(personPicks);
    next.has(p) ? next.delete(p) : next.add(p);
    setPersonPicks(next);
  };

  const reveal = () => {
    const expected = new Set(item.persons);
    let personOk = expected.size === personPicks.size;
    if (personOk) {
      for (const p of expected) if (!personPicks.has(p)) { personOk = false; break; }
    }
    setRevealed({ personOk });
  };

  const next = async () => {
    if (revealed) {
      const correct = revealed.personOk && meaningSelfGrade !== false;
      const expected = item.persons.map(p => PERSON_LABELS[p]).join(' / ');
      const userInput = `${[...personPicks].sort().map(p => PERSON_LABELS[p]).join(' / ') || '(未选)'} | 意思: ${meaningInput || '(未填)'} [自评:${meaningSelfGrade == null ? '未评' : meaningSelfGrade ? '对' : '错'}]`;
      await window.api.practice.submitOne({
        word_id: item.word.id,
        mode: 'reverse',
        tense_id: item.tense.id,
        person: item.persons[0],
        user_input: userInput,
        expected,
        correct
      });
      // 错题压回队列末尾，直到全部做对
      if (!correct) {
        setPool(p => p ? [...p, item] : p);
      }
    }
    setPersonPicks(new Set());
    setMeaningInput('');
    setRevealed(null);
    setMeaningSelfGrade(null);
    setIdx(i => i + 1);
  };

  const personOptions = item.tense.persons.length > 0 ? item.tense.persons : [0];

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{idx + 1} / {pool.length}</span>
        <button className="ghost" onClick={onExit}>退出</button>
      </div>
      <div className="muted" style={{ marginBottom: 6 }}>
        <span className="tag">{item.tense.zh}</span>
        <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>(可多选，同形人称都要选)</span>
      </div>
      <h2 style={{ margin: '6px 0 16px', fontSize: 36, color: '#4361ee' }}>{item.conjugated}</h2>

      <div style={{ marginBottom: 12 }}>
        <label>主语 (人称)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {personOptions.map(p => (
            <button
              key={p}
              type="button"
              className={personPicks.has(p) ? '' : 'ghost'}
              onClick={() => togglePerson(p)}
              disabled={!!revealed}
              style={{ padding: '6px 14px' }}
            >
              {PERSON_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label>动词意思 <span className="muted" style={{ fontSize: 12 }}>(揭示答案后自评)</span></label>
        <input
          value={meaningInput}
          onChange={e => setMeaningInput(e.target.value)}
          disabled={!!revealed}
          placeholder="例如：吃 / to eat"
          autoFocus
        />
      </div>

      {revealed && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 8,
          background: (revealed.personOk && (meaningSelfGrade !== false)) ? '#e8f7ee' : '#fdecea',
          color: (revealed.personOk && (meaningSelfGrade !== false)) ? '#1e7c3a' : '#b1261e'
        }}>
          <div>
            主语：{revealed.personOk ? '✓ 正确' : '✗'} 答案
            <strong> {item.persons.map(p => PERSON_LABELS[p]).join(' / ')}</strong>
            {item.persons.length > 1 && <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>(同形人称必须全选)</span>}
          </div>
          <div style={{ marginTop: 6 }}>
            意思参考：
            <strong>{item.word.translation_zh ?? '(无中文)'}</strong>
            {item.word.translation_en && <span className="muted"> · {item.word.translation_en}</span>}
            <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>(原型: {item.word.lemma})</span>
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
          <button onClick={reveal} disabled={personPicks.size === 0}>提交</button>
        ) : (
          <button onClick={next} autoFocus>下一题</button>
        )}
      </div>
    </div>
  );
}
