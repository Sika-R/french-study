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

type SubMode = 'table' | 'drill' | 'reverse';

interface Props {
  subMode: SubMode;
}

export default function Practice({ subMode }: Props) {
  const [tenses, setTenses] = useState<TenseDef[]>([]);
  const [verbs, setVerbs] = useState<VerbCard[]>([]);
  const [selectedTenses, setSelectedTenses] = useState<Set<string>>(new Set());
  const [selectedVerbs, setSelectedVerbs] = useState<Set<number>>(new Set());
  const [started, setStarted] = useState(false);

  useEffect(() => {
    window.api.practice.tenses().then((t: TenseDef[]) => setTenses(t));
    window.api.practice.verbs().then((v: VerbCard[]) => {
      setVerbs(v);
      // 默认全选已录入动词
      setSelectedVerbs(new Set(v.map(x => x.id)));
    });
  }, []);

  const toggleTense = (id: string) => {
    const next = new Set(selectedTenses);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedTenses(next);
  };
  const toggleVerb = (id: number) => {
    const next = new Set(selectedVerbs);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedVerbs(next);
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

        {subMode !== 'table' && (
          <div style={{ marginTop: 16 }}>
            <h4>选择动词 ({selectedVerbs.size} / {verbs.length})</h4>
            {verbs.length === 0 && <p className="muted">还没有已录入的动词。先去「录入新词」加几个动词。</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {verbs.map(v => (
                <label key={v.id} style={{
                  padding: '4px 10px', borderRadius: 14,
                  background: selectedVerbs.has(v.id) ? '#4361ee' : '#eef1fc',
                  color: selectedVerbs.has(v.id) ? 'white' : '#1f2330',
                  cursor: 'pointer', fontSize: 13
                }}>
                  <input
                    type="checkbox"
                    checked={selectedVerbs.has(v.id)}
                    onChange={() => toggleVerb(v.id)}
                    style={{ display: 'none' }}
                  />
                  {v.lemma}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 20 }}>
          <button
            onClick={() => setStarted(true)}
            disabled={
              selectedTenses.size === 0
              || (subMode === 'table' && verbs.length === 0)
              || (subMode !== 'table' && selectedVerbs.size === 0)
            }
          >开始练习</button>
        </div>
      </div>
    );
  }

  const verbList = verbs.filter(v => selectedVerbs.has(v.id));
  const tenseList = tenses.filter(t => selectedTenses.has(t.id));

  if (subMode === 'table') {
    return <TablePractice verbs={verbList.length > 0 ? verbList : verbs} tenses={tenseList} onExit={() => setStarted(false)} />;
  }
  if (subMode === 'drill') {
    return <DrillPractice verbs={verbList} tenses={tenseList} onExit={() => setStarted(false)} />;
  }
  return <ReversePractice verbs={verbList} tenses={tenseList} onExit={() => setStarted(false)} />;
}

/* ───────────────── 模式 1: 整表填空 ───────────────── */
function TablePractice({ verbs, tenses, onExit }: { verbs: VerbCard[]; tenses: TenseDef[]; onExit: () => void }) {
  const [verbIdx, setVerbIdx] = useState(0);
  const [tenseIdx, setTenseIdx] = useState(0);
  const [table, setTable] = useState<{ person: number; expected: string | null }[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState<{ person: number; correct: boolean; expected: string | null; user_input: string }[] | null>(null);

  const verb = verbs[verbIdx];
  const tense = tenses[tenseIdx];

  useEffect(() => {
    if (!verb || !tense) return;
    setTable(null);
    setAnswers({});
    setSubmitted(null);
    window.api.practice.conjugationTable(verb.lemma, tense.id).then(setTable);
  }, [verb?.id, tense?.id]);

  if (!verb || !tense) return <div className="card"><p className="muted">没有可练习的动词或时态。</p><button onClick={onExit}>返回</button></div>;

  const submit = async () => {
    if (!table) return;
    const r = await window.api.practice.submitTable({
      word_id: verb.id,
      verb: verb.lemma,
      tense_id: tense.id,
      answers
    });
    setSubmitted(r as any);
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
        return (
          <div key={slot.person} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ width: 130, color: '#666' }}>{PERSON_LABELS[slot.person]}</div>
            <div style={{ flex: 1 }}>
              <input
                value={answers[slot.person] ?? ''}
                disabled={!!submitted}
                onChange={e => setAnswers({ ...answers, [slot.person]: e.target.value })}
                style={{
                  background: correctRow ? (correctRow.correct ? '#e8f7ee' : '#fdecea') : 'white',
                  color: correctRow ? (correctRow.correct ? '#1e7c3a' : '#b1261e') : '#1f2330'
                }}
              />
              {correctRow && !correctRow.correct && (
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  ✓ 答案：{correctRow.expected ?? '(无)'}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="row" style={{ marginTop: 16 }}>
        {!submitted ? (
          <button onClick={submit}>提交</button>
        ) : (
          <button onClick={next} autoFocus>下一组</button>
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
  const [item, setItem] = useState<DrillItem | null>(null);
  const [input, setInput] = useState('');
  const [revealed, setRevealed] = useState<{ correct: boolean; expected: string } | null>(null);
  const [count, setCount] = useState(0);

  const word_ids = useMemo(() => verbs.map(v => v.id), [verbs]);
  const tense_ids = useMemo(() => tenses.map(t => t.id), [tenses]);

  const pick = async () => {
    setInput('');
    setRevealed(null);
    const it = await window.api.practice.pickDrill({ word_ids, tense_ids });
    setItem(it as DrillItem | null);
  };

  useEffect(() => { pick(); }, []);

  if (!item) {
    return (
      <div>
        <p className="muted">没有可抽取的题目（请检查所选动词在 Verbiste 中是否存在）。</p>
        <button onClick={onExit}>返回</button>
      </div>
    );
  }

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
    }
    setCount(c => c + 1);
    pick();
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">已完成 {count} 题</span>
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
  const [item, setItem] = useState<ReverseItem | null>(null);
  const [personPicks, setPersonPicks] = useState<Set<number>>(new Set());
  const [meaningInput, setMeaningInput] = useState('');
  const [revealed, setRevealed] = useState<{ personOk: boolean } | null>(null);
  const [meaningSelfGrade, setMeaningSelfGrade] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);

  const word_ids = useMemo(() => verbs.map(v => v.id), [verbs]);
  const tense_ids = useMemo(() => tenses.map(t => t.id), [tenses]);

  const pick = async () => {
    setPersonPicks(new Set());
    setMeaningInput('');
    setRevealed(null);
    setMeaningSelfGrade(null);
    const it = await window.api.practice.pickReverse({ word_ids, tense_ids });
    setItem(it as ReverseItem | null);
  };

  useEffect(() => { pick(); }, []);

  if (!item) {
    return (
      <div>
        <p className="muted">没有可抽取的题目。</p>
        <button onClick={onExit}>返回</button>
      </div>
    );
  }

  const togglePerson = (p: number) => {
    if (revealed) return;
    const next = new Set(personPicks);
    next.has(p) ? next.delete(p) : next.add(p);
    setPersonPicks(next);
  };

  const reveal = () => {
    // 集合相等才算对：少选/多选都视作错
    const expected = new Set(item.persons);
    const actual = personPicks;
    let personOk = expected.size === actual.size;
    if (personOk) {
      for (const p of expected) if (!actual.has(p)) { personOk = false; break; }
    }
    setRevealed({ personOk });
  };

  const next = async () => {
    if (revealed) {
      const meaningOk = meaningSelfGrade ?? true;
      const correct = revealed.personOk && meaningOk;
      const expected = item.persons.map(p => PERSON_LABELS[p]).join(' / ');
      const userInput = `${[...personPicks].sort().map(p => PERSON_LABELS[p]).join(' / ') || '(未选)'} | 意思: ${meaningInput || '(未填)'} [自评:${meaningSelfGrade == null ? '未评' : meaningSelfGrade ? '对' : '错'}]`;
      await window.api.practice.submitOne({
        word_id: item.word.id,
        mode: 'reverse',
        tense_id: item.tense.id,
        person: item.persons[0],   // 写入主答案人称
        user_input: userInput,
        expected,
        correct
      });
    }
    setCount(c => c + 1);
    pick();
  };

  const personOptions = item.tense.persons.length > 0 ? item.tense.persons : [0];

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">已完成 {count} 题</span>
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
          <button onClick={next} autoFocus disabled={meaningSelfGrade == null}>下一题</button>
        )}
      </div>
    </div>
  );
}
