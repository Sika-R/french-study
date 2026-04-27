import { useEffect, useRef, useState } from 'react';
import AccentInput from '../components/AccentInput';

interface LookupResult {
  surface: string;
  lemma: string | null;
  pos: string | null;
  gender: 'm' | 'f' | null;
  translation_en: string | null;
  source: string;
}

export default function AddWord() {
  const [surface, setSurface] = useState('');
  const [lemma, setLemma] = useState('');
  const [pos, setPos] = useState('');
  const [gender, setGender] = useState<'m' | 'f' | ''>('');
  const [zh, setZh] = useState('');
  const [en, setEn] = useState('');
  const [example, setExample] = useState('');
  const [hint, setHint] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string>('');
  // 重复 lemma 时显示的内嵌确认框
  const [duplicateAsk, setDuplicateAsk] = useState<{ lemma: string; payload: any } | null>(null);
  // 记录哪些字段是自动填的（vs 用户手动改的），便于查询新词时覆盖
  const [autoFilled, setAutoFilled] = useState<{ lemma: boolean; pos: boolean; gender: boolean; en: boolean }>({
    lemma: false, pos: false, gender: false, en: false
  });

  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!surface.trim()) {
      setHint('');
      // surface 清空时，把所有自动填的字段一起清掉（手动填的保留）
      if (autoFilled.lemma) setLemma('');
      if (autoFilled.pos) setPos('');
      if (autoFilled.gender) setGender('');
      if (autoFilled.en) setEn('');
      setAutoFilled({ lemma: false, pos: false, gender: false, en: false });
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setHint('查询中…');
      try {
        const r = (await window.api.lookup.word(surface)) as LookupResult;
        if (r.source === 'none') {
          setHint('未在词典中找到，可手动填写');
          // 也清掉之前自动填的内容
          if (autoFilled.lemma) setLemma('');
          if (autoFilled.pos) setPos('');
          if (autoFilled.gender) setGender('');
          if (autoFilled.en) setEn('');
          setAutoFilled({ lemma: false, pos: false, gender: false, en: false });
          return;
        }
        setHint(`来源: ${r.source}`);
        // 只要字段是空 或 之前是自动填的，就用新结果覆盖；用户手动改过的不覆盖
        const next = { ...autoFilled };
        if ((!lemma || autoFilled.lemma) && r.lemma) { setLemma(r.lemma); next.lemma = true; }
        if ((!pos || autoFilled.pos) && r.pos) { setPos(r.pos); next.pos = true; }
        if ((!gender || autoFilled.gender) && r.gender) { setGender(r.gender); next.gender = true; }
        else if (autoFilled.gender && !r.gender) { setGender(''); next.gender = false; }
        if ((!en || autoFilled.en) && r.translation_en) { setEn(r.translation_en); next.en = true; }
        setAutoFilled(next);
      } catch (err) {
        setHint('查询出错: ' + (err as Error).message);
      }
    }, 350);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [surface]);

  // 用户手动编辑时取消该字段的"自动填充"标记
  const setLemmaManual = (v: string) => { setLemma(v); setAutoFilled(a => ({ ...a, lemma: false })); };
  const setPosManual = (v: string) => { setPos(v); setAutoFilled(a => ({ ...a, pos: false })); };
  const setGenderManual = (v: 'm' | 'f' | '') => { setGender(v); setAutoFilled(a => ({ ...a, gender: false })); };
  const setEnManual = (v: string) => { setEn(v); setAutoFilled(a => ({ ...a, en: false })); };

  const reset = () => {
    setSurface(''); setLemma(''); setPos(''); setGender('');
    setZh(''); setEn(''); setExample(''); setHint('');
    setAutoFilled({ lemma: false, pos: false, gender: false, en: false });
  };

  const save = async () => {
    if (!surface.trim() || !pos.trim()) {
      setSavedMsg('请至少填写单词和词性');
      return;
    }
    setSaving(true);
    const lemmaToSave = (lemma || surface).trim().toLowerCase();
    const payload = {
      lemma: lemmaToSave,
      surface: surface.trim().toLowerCase(),
      pos: pos.trim(),
      gender: gender || null,
      translation_zh: zh.trim() || null,
      translation_en: en.trim() || null,
      example_fr: example.trim() || null
    };

    try {
      const r = await window.api.words.create(payload) as any;
      if (r && r.error === 'DUPLICATE_LEMMA') {
        setDuplicateAsk({ lemma: lemmaToSave, payload });
      } else {
        setSavedMsg(`✓ 已保存：${surface}`);
        reset();
        setTimeout(() => setSavedMsg(''), 4000);
      }
    } catch (err) {
      setSavedMsg('保存失败：' + (err as Error).message);
      setTimeout(() => setSavedMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  };

  const confirmOverwrite = async () => {
    if (!duplicateAsk) return;
    const { lemma: lemmaToSave, payload } = duplicateAsk;
    setDuplicateAsk(null);
    setSaving(true);
    try {
      const list = (await window.api.words.list({ search: lemmaToSave })) as Array<{ id: number; lemma: string }>;
      const existing = list.find(w => w.lemma === lemmaToSave);
      if (!existing) throw new Error('找不到现有记录');
      await window.api.words.update(existing.id, payload);
      setSavedMsg(`✓ 已覆盖：${payload.surface}`);
      reset();
    } catch (e2) {
      setSavedMsg('覆盖失败：' + (e2 as Error).message);
    } finally {
      setSaving(false);
      setTimeout(() => setSavedMsg(''), 4000);
    }
  };

  const cancelOverwrite = () => {
    setDuplicateAsk(null);
    setSavedMsg('已取消保存');
    setTimeout(() => setSavedMsg(''), 4000);
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>录入新单词</h2>

      <div className="row">
        <div style={{ flex: 1 }}>
          <label>法语单词 (surface)</label>
          <AccentInput value={surface} onChange={setSurface} placeholder="例如：mangeons" autoFocus />
          {hint && <div className="muted" style={{ marginTop: 6 }}>{hint}</div>}
        </div>
      </div>

      <div className="row">
        <div style={{ flex: 1 }}>
          <label>原型 (lemma)</label>
          <input value={lemma} onChange={e => setLemmaManual(e.target.value)} placeholder="例如：manger" />
        </div>
        <div style={{ width: 160 }}>
          <label>词性</label>
          <select value={pos} onChange={e => setPosManual(e.target.value)}>
            <option value="">--</option>
            <option value="noun">名词 noun</option>
            <option value="verb">动词 verb</option>
            <option value="adj">形容词 adj</option>
            <option value="adv">副词 adv</option>
            <option value="pronoun">代词</option>
            <option value="prep">介词</option>
            <option value="conj">连词</option>
            <option value="det">限定词</option>
            <option value="interj">叹词</option>
            <option value="other">其它</option>
          </select>
        </div>
        <div style={{ width: 140 }}>
          <label>性别 (名词)</label>
          <select value={gender} onChange={e => setGenderManual(e.target.value as any)}>
            <option value="">—</option>
            <option value="m">阳 m (le)</option>
            <option value="f">阴 f (la)</option>
          </select>
        </div>
      </div>

      <div className="row">
        <div style={{ flex: 1 }}>
          <label>中文翻译</label>
          <input value={zh} onChange={e => setZh(e.target.value)} placeholder="例如：吃" />
        </div>
        <div style={{ flex: 1 }}>
          <label>英文翻译</label>
          <input value={en} onChange={e => setEnManual(e.target.value)} placeholder="to eat" />
        </div>
      </div>

      <div className="row">
        <div style={{ flex: 1 }}>
          <label>例句 (可选)</label>
          <textarea value={example} onChange={e => setExample(e.target.value)} rows={2} />
        </div>
      </div>

      <div className="row">
        <button onClick={save} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
        <button className="ghost" onClick={reset}>清空</button>
        {savedMsg && <span className="muted">{savedMsg}</span>}
      </div>

      {duplicateAsk && (
        <div style={{
          marginTop: 16, padding: 16, background: '#fff8e1',
          border: '1px solid #ffd54f', borderRadius: 8
        }}>
          <div style={{ marginBottom: 12 }}>
            <strong>「{duplicateAsk.lemma}」</strong> 已经录入过了。要覆盖现有翻译/词性等吗？（复习进度会保留）
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={confirmOverwrite}>覆盖</button>
            <button className="ghost" onClick={cancelOverwrite}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
