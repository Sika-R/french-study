import { useEffect, useRef, useState } from 'react';
import AccentInput from '../components/AccentInput';
import { fold } from '../utils/fold';

interface QueueCard {
  id: number;
  lemma: string;
  surface: string;
  pos: string;
  gender: 'm' | 'f' | null;
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

export interface IntegratedConfig {
  enableVerb: boolean;
  enableAdj: boolean;
  verbTenseIds: string[]; // 选定的时态
}

export const SPELL_SESSION_KEY = 'frenchdeck:spellReview:session:v1';

interface SavedSession {
  wordIds: number[];        // 本地 id（仅供本机使用；跨机不可信，要按 lemma 重映射）
  wordLemmas?: string[];    // ★ 跨机稳定身份；用于 Review.tsx 恢复 selection
  config: IntegratedConfig;
  queue: QueueItem[];
  idx: number;
  pendingCardRetry: boolean;
  /** 当前卡是否已经过了拼写阶段（处于子练习中或刚拼对待按"继续"） */
  spellRevealed: { correct: boolean; expected: string } | null;
  spellInput: string;
  genderPick: 'm' | 'f' | '';
  subStage: SubStage | null;
  savedAt: number;
}

export function loadSavedSpellSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SPELL_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedSession;
    if (!s.wordIds || !s.config || !s.queue) return null;
    return s;
  } catch { return null; }
}

export function clearSavedSpellSession() {
  try { localStorage.removeItem(SPELL_SESSION_KEY); } catch {}
}

interface Props {
  wordIds: number[];
  config: IntegratedConfig;
  onExit: () => void;
}

/** 单格变位 / 形容词阴阳 子题状态 */
interface SubCellAnswer {
  key: string;        // 'verb:tenseId:person' or 'adj:m' / 'adj:f'
  expected: string;
  user: string;
  done: boolean;      // 已经做对
}

/** queue 里的一项：要么是完整卡片（拼写+所有子练习），要么是只做指定错题的补错组 */
type QueueItem =
  | { kind: 'card'; card: QueueCard; spellOnly?: boolean }
  | {
      kind: 'retry';
      card: QueueCard;
      subType: 'adj' | 'verb';
      tenseId?: string;          // verb 用，标注来源（显示）
      cells: SubCellAnswer[];    // 已经清空 user/done 的，待重做
    };

/** 每个 word 进入子练习阶段的内部状态 */
interface SubStage {
  type: 'adj' | 'verb';
  // adj 用：m/f 两个 cell
  // verb 用：当前正在做的 tenseId、当前 round 的 cells
  tenseQueue?: { tenseId: string; cells: SubCellAnswer[] }[]; // 多个时态依次完成
  currentTenseIdx?: number;
  cells: SubCellAnswer[];   // 当前正在 render 的 cells
  submitted: boolean;        // 当前 round 是否已经提交（决定显示对错色）
  isRetry?: boolean;         // 是否是 retry 模式（只做几个 cells，完成后回到 queue）
  retryTenseId?: string;     // retry 模式时显示用的来源时态
}

export default function IntegratedSpellReview({ wordIds, config, onExit }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  // 恢复 saved session 时短暂置 true，让 idx-change effect 不清掉刚恢复的 subStage / spellRevealed
  const restoringRef = useRef(false);

  // ── 拼写阶段状态 ──
  const [spellInput, setSpellInput] = useState('');
  const [genderPick, setGenderPick] = useState<'m' | 'f' | ''>('');
  const [spellRevealed, setSpellRevealed] = useState<{ correct: boolean; expected: string } | null>(null);
  // 揭示答案后的短暂"防误按"窗口：800ms 内不能点下一张/下一时态，避免连按 Enter 直接跳过
  const [revealLockUntil, setRevealLockUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (revealLockUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [revealLockUntil]);
  const lockMs = Math.max(0, revealLockUntil - now);

  // ── 子练习阶段状态（拼写对了之后） ──
  const [subStage, setSubStage] = useState<SubStage | null>(null);
  // 拼写答错时记一下：等子练习也走完，再把整张卡压回末尾
  const [pendingCardRetry, setPendingCardRetry] = useState(false);

  const card = queue[idx]?.kind === 'card' ? queue[idx].card : (queue[idx] as Extract<QueueItem, { kind: 'retry' }> | undefined)?.card;
  const currentItem = queue[idx];

  const loadQueue = async () => {
    setLoading(true);
    // 优先尝试恢复未完成的会话
    const saved = loadSavedSpellSession();
    if (saved && saved.queue.length > 0 && saved.idx < saved.queue.length) {
      // 跨机器恢复：saved.queue 里的 card.id 是另一台机器的本地 autoincrement，本地无效。
      // 用 lemma 重新映射到本地 id；本地不存在的词整条 entry 跳过。
      try {
        const lemmas = Array.from(new Set(
          saved.queue.map(it => it.kind === 'card' ? it.card.lemma : it.card.lemma)
        ));
        const map = await window.api.words.idsByLemmas(lemmas) as Record<string, number>;
        const remappedQueue: QueueItem[] = [];
        for (const it of saved.queue) {
          const localId = map[it.card.lemma];
          if (!localId) continue; // 该词在本地已删 / 还没同步过来 → 跳过
          if (it.kind === 'card') {
            remappedQueue.push({ ...it, card: { ...it.card, id: localId } });
          } else {
            remappedQueue.push({ ...it, card: { ...it.card, id: localId } });
          }
        }
        // 如果 idx 超出 remapped 范围（前面的卡都被丢了），dial back to first valid
        const newIdx = Math.min(saved.idx, Math.max(0, remappedQueue.length - 1));
        // 如果 wordIds 也被传了，确认 saved 与当前 selection 大体一致；不一致就放弃恢复
        const savedLemmaSet = new Set(saved.queue.filter(it => it.kind === 'card').map(it => it.card.lemma));
        const sameSelection = wordIds.length > 0
          // 重新拉本地 id->lemma 检查 wordIds 对应 lemma 是否在 saved 里
          ? true   // 简化：只要有恢复 entry 就接续
          : true;
        if (remappedQueue.length > 0 && sameSelection) {
          console.log('[SpellReview] resuming saved session, idx=', newIdx, '/', remappedQueue.length,
            'subStage=', !!saved.subStage, 'dropped=', saved.queue.length - remappedQueue.length);
          restoringRef.current = true;
          setQueue(remappedQueue);
          setIdx(newIdx);
          setPendingCardRetry(saved.pendingCardRetry);
          setSpellInput(saved.spellInput || '');
          setGenderPick(saved.genderPick || '');
          setSpellRevealed(saved.spellRevealed || null);
          setSubStage(saved.subStage || null);
          setDone(false);
          setLoading(false);
          requestAnimationFrame(() => { restoringRef.current = false; });
          return;
        }
        // 不可恢复（例如本地完全没有这些词）→ 丢弃 saved，按 wordIds 重洗
        console.warn('[SpellReview] saved session has no matching local words, falling back to fresh shuffle');
        clearSavedSpellSession();
      } catch (err) {
        console.warn('[SpellReview] failed to remap saved session:', err);
      }
    }
    // 否则按 wordIds 重新洗牌
    const rows = (await window.api.words.byIds(wordIds)) as QueueCard[];
    const shuffled: QueueItem[] = rows
      .map(c => ({ kind: 'card' as const, card: c }));
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setQueue(shuffled);
    setIdx(0);
    setDone(shuffled.length === 0);
    resetSpellState();
    setSubStage(null);
    setLoading(false);
  };

  const resetSpellState = () => {
    setSpellInput('');
    setGenderPick('');
    setSpellRevealed(null);
  };

  useEffect(() => { loadQueue(); }, [wordIds]);

  // 持久化进度（包括拼写阶段中间态 + 子练习阶段）
  useEffect(() => {
    if (loading) return;
    if (done) {
      clearSavedSpellSession();
      return;
    }
    if (queue.length === 0) return;
    try {
      // 用 lemma 做跨机器稳定身份；queue 中包含每张 card 的 lemma
      const lemmaSet = new Set<string>();
      for (const it of queue) lemmaSet.add(it.card.lemma);
      const data: SavedSession = {
        wordIds, wordLemmas: Array.from(lemmaSet),
        config, queue, idx, pendingCardRetry,
        spellInput, genderPick, spellRevealed, subStage,
        savedAt: Date.now()
      };
      localStorage.setItem(SPELL_SESSION_KEY, JSON.stringify(data));
    } catch {}
  }, [queue, idx, pendingCardRetry, loading, done, wordIds, config, spellInput, genderPick, spellRevealed, subStage]);
  useEffect(() => {
    if (restoringRef.current) return; // 恢复 session 时不清状态
    resetSpellState();
    setSubStage(null);
    setPendingCardRetry(false);
    // 如果当前 item 是 retry，直接进 sub stage，不走拼写
    const item = queue[idx];
    if (item?.kind === 'retry') {
      setSubStage({
        type: item.subType,
        cells: item.cells,
        submitted: false,
        isRetry: true,
        retryTenseId: item.tenseId
      });
    } else if (item?.kind === 'card' && item.card.pos === 'adj' && config.enableAdj && !item.spellOnly) {
      // 形容词：跳过拼写阶段，直接给原型 + 翻译，让用户填所有变形
      // （如果连一个 form 都拉不到，就退回到拼写阶段）
      (async () => {
        const cells = await buildAdjCells(item.card.id);
        if (cells.length > 0) {
          setSubStage({ type: 'adj', cells, submitted: false });
        }
      })();
    }
    // 注意：deps 故意不包含整个 queue。queue 是 append-only，当前位置 queue[idx] 不会被改写；
    // 把 queue 作为 dep 会导致每次往队尾 push（完成子练习 / 错题压回）都把当前 subStage 清掉，
    // 表现为「做变位时突然跳回原型阶段」。
    // 但首次 load 时 idx=0 而 queue 是空，等异步 setQueue 后效果不会再触发，
    // 因此显式追踪 queue[idx] 的"身份"（kind+card.id+spellOnly）作为 dep。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, queue[idx]?.kind, queue[idx]?.card?.id, (queue[idx]?.kind === 'card' && queue[idx]?.spellOnly) || false]);

  // 每张新卡：根据词性把焦点放在 le radio (noun) 或拼写 input (其它)
  useEffect(() => {
    if (loading || done || !card || subStage || spellRevealed) return;
    requestAnimationFrame(() => {
      if (card.pos === 'noun' && card.gender) {
        const el = document.querySelector<HTMLInputElement>(`input[type="radio"][data-gender="m"]`);
        el?.focus();
      } else {
        spellInputRef.current?.focus();
      }
    });
  }, [idx, card?.id, loading, done, subStage, spellRevealed]);

  // Enter 键全局推进；同时实现"在拼写阶段，无论焦点在哪，打字直接进 spell input"
  const enterHandlerRef = useRef<(() => void) | null>(null);
  const spellInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // textarea 不拦截
      if (target?.tagName === 'TEXTAREA') return;

      // ── 拼写阶段且未揭示：可打印字符 / Backspace 自动重定向到 spell input ──
      if (
        !subStage && !spellRevealed &&
        spellInputRef.current && document.activeElement !== spellInputRef.current
      ) {
        const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
        const isBackspace = e.key === 'Backspace';
        if (isPrintable || isBackspace) {
          e.preventDefault();
          spellInputRef.current.focus();
          if (isPrintable) setSpellInput(s => s + e.key);
          else setSpellInput(s => s.slice(0, -1));
          return;
        }
      }

      // ── Enter 全局推进 ──
      if (e.key === 'Enter') {
        const fn = enterHandlerRef.current;
        if (fn) {
          e.preventDefault();
          fn();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [subStage, spellRevealed]);

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

  // 动词考原型 lemma；其它词考 surface（用户输入的形式 = 单数 / 阳性）
  const expectedSpell = card.pos === 'verb' ? card.lemma : (card.surface || card.lemma);

  // ───────── 阶段 1: 拼写 ─────────

  const submitSpell = () => {
    if (card.pos === 'noun' && card.gender && !genderPick) {
      alert('请先选择阴阳性 (le / la)');
      return;
    }
    const spellOk = fold(spellInput) === fold(expectedSpell);
    const genderOk = !card.gender || genderPick === card.gender;
    setSpellRevealed({
      correct: spellOk && genderOk,
      expected: expectedSpell + (card.gender ? ` [${card.gender}]` : '')
    });
    setRevealLockUntil(Date.now() + 800);
  };

  const advanceWord = (spellCorrect: boolean) => {
    // 拼写错的整张卡压回末尾（重新走拼写）；保留 spellOnly 标记，避免再次跑已经做过的子练习
    if (!spellCorrect && card) {
      const wasSpellOnly = currentItem?.kind === 'card' && currentItem.spellOnly;
      setQueue(q => [...q, { kind: 'card', card, spellOnly: wasSpellOnly || undefined }]);
    }
    const newQueueLen = queue.length + (spellCorrect ? 0 : 1);
    if (idx + 1 >= newQueueLen) setDone(true);
    else setIdx(idx + 1);
  };

  /** 把错的子练习 cells 作为独立 retry entry 追加到队列末尾，然后进下一个 queue item */
  const advanceSubWithRetries = (retries: { tenseId?: string; cells: SubCellAnswer[] }[]) => {
    if (!card) return;
    const subType: 'adj' | 'verb' = subStage?.type ?? 'verb';
    const additions: QueueItem[] = retries
      .filter(r => r.cells.length > 0)
      .map(r => ({
        kind: 'retry',
        card,
        subType,
        tenseId: r.tenseId,
        cells: r.cells.map(c => ({ ...c, user: '', done: false }))
      }));
    // 如果拼写阶段就错了，把整张卡也压回末尾（重新走拼写）
    // 标记 spellOnly：下次只做拼写，不再重复子练习（错的子练习已经作为 retry entry 单独压回）
    if (pendingCardRetry) {
      additions.push({ kind: 'card', card, spellOnly: true });
      setPendingCardRetry(false);
    }
    if (additions.length > 0) {
      setQueue(q => [...q, ...additions]);
    }
    const newQueueLen = queue.length + additions.length;
    if (idx + 1 >= newQueueLen) setDone(true);
    else setIdx(idx + 1);
  };

  const writeSpellLog = async (correct: boolean) => {
    const expected = expectedSpell + (card.gender ? ` [${card.gender}]` : '');
    const userInput = spellInput.trim() + (genderPick ? ` [${genderPick}]` : '');
    await window.api.review.submit({
      word_id: card.id,
      mode: 'spell',
      user_input: userInput,
      expected,
      rating: correct ? 3 : 1
    });
  };

  // 给 adj 卡片构建 subStage cells（拼写阶段后用，也供 adj 跳过拼写直接进入用）
  const buildAdjCells = async (cardId: number): Promise<SubCellAnswer[]> => {
    const pool = await window.api.practice.buildAdjPool({ word_ids: [cardId] }) as Array<{
      word: any;
      forms: {
        m_sg: string; f_sg: string;
        m_pl: string | null; f_pl: string | null; m_sg_vowel: string | null;
      };
    }>;
    const item = pool[0];
    if (!item) return [];
    const order: Array<keyof typeof item.forms> = ['m_sg', 'f_sg', 'm_pl', 'f_pl', 'm_sg_vowel'];
    return order
      .filter(k => !!item.forms[k])
      .map(k => ({
        key: `adj:${k}`,
        expected: item.forms[k]!,
        user: '',
        done: false
      }));
  };

  // 拼写"下一张"按钮
  const onSpellNext = async () => {
    if (!spellRevealed) return;
    await writeSpellLog(spellRevealed.correct);

    // 如果拼写错了，记下来：子练习走完之后整张卡再压回末尾
    if (!spellRevealed.correct) {
      setPendingCardRetry(true);
    }

    // spellOnly 模式（之前拼写错的回炉重做拼写）：不再走子练习
    const spellOnly = currentItem?.kind === 'card' && currentItem.spellOnly;

    // 不论拼写对错，都按 pos 决定要不要进子练习（让你练完变位/阴阳）
    if (!spellOnly && card.pos === 'adj' && config.enableAdj) {
      const cells = await buildAdjCells(card.id);
      if (cells.length > 0) {
        setSubStage({ type: 'adj', cells, submitted: false });
        return;
      }
      // 没找到任何形式 → 跳过子练习
    }

    if (!spellOnly && card.pos === 'verb' && config.enableVerb && config.verbTenseIds.length > 0) {
      // 为每个时态拉一张表
      const tenseQueue: { tenseId: string; cells: SubCellAnswer[] }[] = [];
      for (const tid of config.verbTenseIds) {
        const table = await window.api.practice.conjugationTable(card.lemma, tid) as Array<{
          person: number; expected: string | null;
        }> | null;
        if (!table) continue;
        const cells = table
          .filter(slot => slot.expected)
          .map(slot => ({
            key: `verb:${tid}:${slot.person}`,
            expected: slot.expected!,
            user: '', done: false
          }));
        if (cells.length > 0) tenseQueue.push({ tenseId: tid, cells });
      }
      if (tenseQueue.length > 0) {
        setSubStage({
          type: 'verb',
          tenseQueue,
          currentTenseIdx: 0,
          cells: tenseQueue[0].cells,
          submitted: false
        });
        return;
      }
    }

    // 没有子练习，直接进下一题（如果拼写错了就用 pendingCardRetry 走错路径）
    advanceWord(!pendingCardRetry && spellRevealed.correct);
    setPendingCardRetry(false);
  };

  // ───────── 阶段 2: 子练习 (adj / verb) ─────────

  const submitSubRound = async () => {
    if (!subStage) return;
    const updated = subStage.cells.map(c => {
      if (c.done) return c;
      const correct = fold(c.user) === fold(c.expected);
      return { ...c, done: correct };
    });
    // 写日志：每个 cell 写一条（mode=adj/drill 之类）
    if (subStage.type === 'adj') {
      const allDone = updated.every(c => c.done);
      const ADJ_LABEL: Record<string, string> = {
        'adj:m_sg': '阳单', 'adj:f_sg': '阴单',
        'adj:m_pl': '阳复', 'adj:f_pl': '阴复',
        'adj:m_sg_vowel': '元音前',
        // 老数据兼容（旧 session 里可能还有 adj:m / adj:f 这种 key）
        'adj:m': '阳', 'adj:f': '阴'
      };
      const userStr = updated.map(c => `${ADJ_LABEL[c.key] ?? c.key}:${c.user.trim() || '(空)'}`).join(' | ');
      const expStr = updated.map(c => `${ADJ_LABEL[c.key] ?? c.key}:${c.expected}`).join(' | ');
      // 只在第一次 round 写日志（避免重复填错重复算）
      if (!subStage.submitted) {
        await window.api.practice.submitOne({
          word_id: card.id, mode: 'adj', tense_id: '', person: 0,
          user_input: userStr, expected: expStr, correct: allDone
        });
      }
      setSubStage({ ...subStage, cells: updated, submitted: true });
    } else {
      // verb：当前时态（retry 模式没有 tenseQueue，用 retryTenseId）
      const tid = subStage.isRetry
        ? (subStage.retryTenseId ?? '')
        : subStage.tenseQueue![subStage.currentTenseIdx!].tenseId;
      if (!subStage.submitted) {
        // 把每个 cell 当 drill 提交一条
        for (const c of subStage.cells) {
          const wasCorrect = fold(c.user) === fold(c.expected);
          await window.api.practice.submitOne({
            word_id: card.id, mode: 'drill',
            tense_id: tid,
            person: parseInt(c.key.split(':')[2], 10),
            user_input: c.user, expected: c.expected, correct: wasCorrect
          });
        }
      }
      setSubStage({ ...subStage, cells: updated, submitted: true });
    }
    setRevealLockUntil(Date.now() + 800);
  };

  const retryWrong = () => {
    if (!subStage) return;
    // 错的 cell 清空 user，让用户重填；对的保留+disabled
    const cleaned = subStage.cells.map(c => c.done ? c : { ...c, user: '' });
    setSubStage({ ...subStage, cells: cleaned, submitted: false });
  };

  const onSubNext = () => {
    if (!subStage) return;

    // 收集本组中错的 cells
    const wrongCells = subStage.cells.filter(c => !c.done);

    if (subStage.isRetry) {
      // 这是 retry 组：错了就再追加一个 retry entry 到末尾，对了就直接下一个
      setSubStage(null);
      advanceSubWithRetries(wrongCells.length > 0
        ? [{ tenseId: subStage.retryTenseId, cells: wrongCells }]
        : []);
      return;
    }

    if (subStage.type === 'adj') {
      // 完成本组：错的推到末尾作为独立 retry，对了直接下一个 queue item
      setSubStage(null);
      advanceSubWithRetries(wrongCells.length > 0
        ? [{ cells: wrongCells }]
        : []);
      return;
    }

    // verb：当前时态完成，把错的收集起来；如果还有下一个时态继续做
    const tq = subStage.tenseQueue!;
    const currentTid = tq[subStage.currentTenseIdx!].tenseId;
    // 累积本词所有时态的错（保留在 subStage.pendingRetries... 但用闭包暂存太复杂）
    // 简化方案：每个时态的错单独成一个 retry，立刻 push 到 queue 末尾（在最后一个时态时）
    // 用一个临时缓冲存到 subStage 上
    const accumulated = ((subStage as any)._accumulatedRetries as { tenseId: string; cells: SubCellAnswer[] }[] | undefined) ?? [];
    if (wrongCells.length > 0) {
      accumulated.push({ tenseId: currentTid, cells: wrongCells });
    }

    const next = subStage.currentTenseIdx! + 1;
    if (next < tq.length) {
      setSubStage({
        ...subStage,
        currentTenseIdx: next,
        cells: tq[next].cells,
        submitted: false,
        // 保存累积的 retries
        ...({ _accumulatedRetries: accumulated } as any)
      });
    } else {
      // 所有时态走完 → 把所有 retries 一次性推到队尾
      setSubStage(null);
      advanceSubWithRetries(accumulated);
    }
  };

  const updateCell = (key: string, val: string) => {
    if (!subStage) return;
    setSubStage({
      ...subStage,
      cells: subStage.cells.map(c => c.key === key ? { ...c, user: val } : c)
    });
  };

  // 决定 Enter 当前应该触发什么动作（每次渲染都重新绑定，以便引用最新闭包）
  enterHandlerRef.current = (() => {
    if (loading || done || !card) return null;
    if (subStage) {
      // 子练习阶段
      if (!subStage.submitted) {
        // 未提交：Enter 在 input 间推进焦点；最后一个未 done 的 input 触发提交
        return () => {
          const active = document.activeElement as HTMLElement | null;
          const idxAttr = active?.getAttribute('data-cell-idx');
          // 下一个未 done 的 cell index（在当前之后）
          const fromIdx = idxAttr ? parseInt(idxAttr, 10) : -1;
          const nextIdx = subStage.cells.findIndex(
            (c, i) => i > fromIdx && !c.done
          );
          if (nextIdx >= 0) {
            const el = document.querySelector<HTMLInputElement>(
              `input[data-cell-idx="${nextIdx}"]`
            );
            if (el) { el.focus(); el.select(); return; }
          }
          // 没有更下面的未 done 输入框 → 提交
          submitSubRound();
        };
      }
      if (lockMs > 0) return null;
      // 提交后：直接进下一组（错的会被自动追加到末尾）
      return onSubNext;
    }
    // 拼写阶段
    if (!spellRevealed) return submitSpell;
    if (lockMs > 0) return null;
    return onSpellNext;
  })();

  // ───────── 渲染 ─────────

  // 子练习阶段渲染
  if (subStage) {
    const allDone = subStage.cells.every(c => c.done);
    const headerTag = subStage.isRetry
      ? `🔁 补错${subStage.retryTenseId ? ` · ${subStage.retryTenseId}` : ''}`
      : (subStage.type === 'verb'
        ? `时态 ${subStage.currentTenseIdx! + 1}/${subStage.tenseQueue!.length} · ${subStage.tenseQueue![subStage.currentTenseIdx!].tenseId}`
        : '阴阳变化');

    return (
      <div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">{idx + 1} / {queue.length} · {headerTag}</span>
          <button className="ghost" tabIndex={-1} onClick={() => {
            setSubStage(null);
            // 跳过：不追加 retry，进下一个
            advanceSubWithRetries([]);
          }}>跳过本组</button>
        </div>

        <h3 style={{ marginBottom: 4 }}>
          {subStage.type === 'adj' ? (
            // 形容词整轮（含 retry）都不显示原型，只给翻译
            <>{card!.translation_zh ?? card!.translation_en ?? '(无翻译)'}
              {card!.translation_zh && card!.translation_en && (
                <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>· {card!.translation_en}</span>
              )}
            </>
          ) : (
            <>✓ {card!.lemma} <span className="muted" style={{ fontSize: 14 }}>
              ({card!.translation_zh ?? card!.translation_en ?? ''})
            </span></>
          )}
        </h3>
        <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          {subStage.isRetry ? '只重做之前错的几个' : (subStage.type === 'adj' ? '填写所有可用形式（阳/阴 × 单/复，及元音前阳单）' : '填写各人称变位')}
        </div>
        {subStage.cells.map((c, i) => {
          const ADJ_LABEL: Record<string, string> = {
            'adj:m_sg': '阳性单数', 'adj:f_sg': '阴性单数',
            'adj:m_pl': '阳性复数', 'adj:f_pl': '阴性复数',
            'adj:m_sg_vowel': '元音前阳单',
            'adj:m': '阳性 (m)', 'adj:f': '阴性 (f)' // 老数据兼容
          };
          const label = subStage.type === 'adj'
            ? (ADJ_LABEL[c.key] ?? c.key)
            : PERSON_LABELS[parseInt(c.key.split(':')[2], 10)];
          const wrong = subStage.submitted && !c.done;
          const right = c.done;
          // 第一个未 done 的 input 自动 focus（页面/重填后聚焦）
          const firstUnfinishedIdx = subStage.cells.findIndex(x => !x.done);
          const shouldAutoFocus = !subStage.submitted && i === firstUnfinishedIdx;
          return (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 130, color: '#666' }}>{label}</div>
              <div style={{ flex: 1 }}>
                <input
                  data-cell-idx={i}
                  value={c.user}
                  disabled={c.done}
                  autoFocus={shouldAutoFocus}
                  onChange={e => updateCell(c.key, e.target.value)}
                  style={{
                    background: right ? '#e8f7ee' : (wrong ? '#fdecea' : 'white'),
                    color: right ? '#1e7c3a' : (wrong ? '#b1261e' : '#1f2330')
                  }}
                />
                {wrong && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    ✓ 答案：{c.expected}（再填一次）
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className="row" style={{ marginTop: 16 }}>
          {!subStage.submitted ? (
            <button tabIndex={-1} onClick={submitSubRound}>提交</button>
          ) : (
            <button tabIndex={-1} onClick={onSubNext} disabled={lockMs > 0}>
              {lockMs > 0 ? `${(lockMs / 1000).toFixed(1)}s 后可点` :
                (allDone
                  ? (subStage.type === 'verb' && !subStage.isRetry && subStage.currentTenseIdx! + 1 < subStage.tenseQueue!.length
                      ? '下一时态' : '下一题')
                  : '下一题（错的会在最后重做）')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // 拼写阶段渲染
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{idx + 1} / {queue.length}</span>
        <button className="ghost" tabIndex={-1} onClick={onExit}>退出</button>
      </div>

      <h2 style={{ marginTop: 0 }}>{card.translation_zh ?? card.translation_en ?? '(无翻���)'}</h2>
      <div className="muted" style={{ marginBottom: 12 }}>
        <span className="tag">{card.pos}</span>
        {card.translation_en && <span>en: {card.translation_en}</span>}
      </div>

      {card.pos === 'noun' && card.gender && (
        <div className="row" style={{ gap: 16 }}>
          {(['m', 'f'] as const).map(g => {
            const picked = genderPick === g;
            const expected = card.gender === g;
            // 揭示后的颜色：选中且正确=绿；选中且错=红；未选但正确（说明用户选错了）=描边绿提示正解
            let bg = 'transparent', color = '#1f2330', border = '1px solid transparent';
            if (spellRevealed) {
              if (picked && expected) { bg = '#e8f7ee'; color = '#1e7c3a'; border = '1px solid #1e7c3a'; }
              else if (picked && !expected) { bg = '#fdecea'; color = '#b1261e'; border = '1px solid #b1261e'; }
              else if (!picked && expected) { bg = 'transparent'; color = '#1e7c3a'; border = '1px dashed #1e7c3a'; }
            }
            return (
              <label key={g} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 6,
                background: bg, color, border,
                cursor: spellRevealed ? 'default' : 'pointer'
              }}>
                <input
                  type="radio"
                  name="g"
                  data-gender={g}
                  checked={picked}
                  disabled={!!spellRevealed}
                  tabIndex={0}
                  autoFocus={g === 'm' && !spellRevealed}
                  onChange={() => setGenderPick(g)}
                  onKeyDown={(e) => {
                    if (spellRevealed) return;
                    // Tab 在 le ↔ la 之间循环切换并自动选中
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const other = g === 'm' ? 'f' : 'm';
                      setGenderPick(other);
                      requestAnimationFrame(() => {
                        const el = document.querySelector<HTMLInputElement>(
                          `input[type="radio"][data-gender="${other}"]`
                        );
                        el?.focus();
                      });
                    }
                  }}
                />
                {g === 'm' ? 'le (m)' : 'la (f)'}
                {spellRevealed && picked && (expected ? ' ✓' : ' ✗')}
                {spellRevealed && !picked && expected && ' ← 正确答案'}
              </label>
            );
          })}
        </div>
      )}

      <div className="row">
        <div style={{ flex: 1 }}>
          <label>请输入法语单词</label>
          <AccentInput
            inputRef={spellInputRef}
            value={spellInput}
            onChange={setSpellInput}
            disabled={!!spellRevealed}
            placeholder="…"
            tabIndex={-1}
            onKeyDown={(e) => {
              // 在 input 里按 Tab 也跳到 radio
              if (e.key === 'Tab' && card.pos === 'noun' && card.gender && !spellRevealed) {
                e.preventDefault();
                const target = e.shiftKey ? 'f' : 'm';
                setGenderPick(target);
                requestAnimationFrame(() => {
                  document.querySelector<HTMLInputElement>(
                    `input[type="radio"][data-gender="${target}"]`
                  )?.focus();
                });
              }
            }}
            style={spellRevealed ? {
              background: fold(spellInput) === fold(expectedSpell) ? '#e8f7ee' : '#fdecea',
              color: fold(spellInput) === fold(expectedSpell) ? '#1e7c3a' : '#b1261e',
              borderColor: fold(spellInput) === fold(expectedSpell) ? '#1e7c3a' : '#b1261e'
            } : undefined}
          />
        </div>
      </div>

      {!spellRevealed ? (
        <div className="row">
          <button tabIndex={-1} onClick={submitSpell}>提交 / 揭示答案</button>
          <button className="ghost" tabIndex={-1} onClick={() => { advanceWord(true); }}>跳过</button>
        </div>
      ) : (
        <>
          <div style={{
            background: spellRevealed.correct ? '#e8f7ee' : '#fdecea',
            color: spellRevealed.correct ? '#1e7c3a' : '#b1261e',
            padding: 12, borderRadius: 8, marginTop: 12
          }}>
            <strong>{spellRevealed.correct ? '✓ 正确' : '✗ 答案：' + spellRevealed.expected}</strong>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={onSpellNext} disabled={lockMs > 0} tabIndex={-1}>
              {lockMs > 0 ? `${(lockMs / 1000).toFixed(1)}s 后可点` :
                (spellRevealed.correct
                  ? (
                    (card.pos === 'adj' && config.enableAdj)
                      || (card.pos === 'verb' && config.enableVerb && config.verbTenseIds.length > 0)
                    ? '继续：变位 / 阴阳' : '下一张'
                  )
                  : '下一张')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** 配置面板：选要启用的子练习 + 时态 */
export function IntegratedConfigScreen({
  initial, onStart
}: {
  initial: IntegratedConfig;
  onStart: (cfg: IntegratedConfig) => void;
}) {
  const [enableVerb, setEnableVerb] = useState(initial.enableVerb);
  const [enableAdj, setEnableAdj] = useState(initial.enableAdj);
  const [tenses, setTenses] = useState<TenseDef[]>([]);
  const [tenseIds, setTenseIds] = useState<Set<string>>(new Set(initial.verbTenseIds));

  useEffect(() => {
    window.api.practice.tenses().then((t: TenseDef[]) => setTenses(t));
  }, []);

  return (
    <div style={{ padding: '20px 8px' }}>
      <h2 style={{ marginTop: 0 }}>拼写复习配置</h2>
      <p className="muted">
        每张卡先做拼写。拼写对了之后，按词性自动追加变位 / 阴阳子练习；都做对才进入下一张。
      </p>

      <div style={{ marginTop: 20 }}>
        <h4>启用子练习</h4>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <input type="checkbox" checked={enableAdj} onChange={e => setEnableAdj(e.target.checked)} />
          <span>形容词：拼写对后填写阳性 + 阴性</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={enableVerb} onChange={e => setEnableVerb(e.target.checked)} />
          <span>动词：拼写对后按时态填表</span>
        </label>
      </div>

      {enableVerb && (
        <div style={{ marginTop: 16 }}>
          <h4>选择时态 ({tenseIds.size} / {tenses.length})</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {tenses.map(t => (
              <label key={t.id} style={{
                display: 'flex', gap: 8, alignItems: 'center',
                padding: '6px 10px', borderRadius: 6,
                background: tenseIds.has(t.id) ? '#eef1fc' : 'transparent',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={tenseIds.has(t.id)}
                  onChange={() => {
                    const next = new Set(tenseIds);
                    next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                    setTenseIds(next);
                  }}
                />
                <span><strong>{t.zh}</strong> <span className="muted" style={{ fontSize: 12 }}>{t.fr}</span></span>
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8, gap: 6 }}>
            <button className="ghost" onClick={() => setTenseIds(new Set(tenses.map(t => t.id)))}>全选</button>
            <button className="ghost" onClick={() => setTenseIds(new Set())}>清空</button>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 24 }}>
        <button
          onClick={() => onStart({ enableVerb, enableAdj, verbTenseIds: [...tenseIds] })}
          disabled={enableVerb && tenseIds.size === 0}
          style={{ padding: '10px 24px', fontSize: 15 }}
        >
          下一步：选词
        </button>
      </div>
    </div>
  );
}
