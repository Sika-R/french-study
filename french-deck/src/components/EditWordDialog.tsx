import { useEffect, useState } from 'react';

export interface EditableWord {
  id: number;
  lemma: string;
  surface: string;
  pos: string;
  gender: 'm' | 'f' | null;
  translation_zh: string | null;
  translation_en: string | null;
  example_fr: string | null;
  impersonal?: number | null;
}

interface Props {
  word: EditableWord;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditWordDialog({ word, onClose, onSaved }: Props) {
  const [pos, setPos] = useState(word.pos);
  const [gender, setGender] = useState<'m' | 'f' | ''>(word.gender ?? '');
  const [zh, setZh] = useState(word.translation_zh ?? '');
  const [en, setEn] = useState(word.translation_en ?? '');
  const [example, setExample] = useState(word.example_fr ?? '');
  const [impersonal, setImpersonal] = useState<boolean>(!!word.impersonal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch = {
        pos: pos.trim() || word.pos,
        gender: pos === 'noun' ? (gender || null) : null,
        translation_zh: zh.trim() || null,
        translation_en: en.trim() || null,
        example_fr: example.trim() || null,
        impersonal: (pos === 'verb' && impersonal) ? 1 : 0
      };
      await window.api.words.update(word.id, patch);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'white', borderRadius: 12, padding: 24,
        width: '90%', maxWidth: 540
      }}>
        <h2 style={{ marginTop: 0 }}>编辑单词</h2>

        <div style={{ marginBottom: 16, padding: '10px 12px', background: '#f6f7fb', borderRadius: 8 }}>
          <div style={{ fontSize: 18 }}>
            <strong>{word.lemma}</strong>
            {word.surface !== word.lemma && <span className="muted"> ({word.surface})</span>}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            （lemma / surface 不可改；要改请重新录入同 lemma 触发覆盖）
          </div>
        </div>

        <div className="row">
          <div style={{ width: 180 }}>
            <label>词性</label>
            <select value={pos} onChange={e => setPos(e.target.value)}>
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
          <div style={{ width: 160 }}>
            <label>性别 (名词)</label>
            <select value={gender} onChange={e => setGender(e.target.value as any)} disabled={pos !== 'noun'}>
              <option value="">—</option>
              <option value="m">阳 m (le)</option>
              <option value="f">阴 f (la)</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>中文翻译</label>
            <input value={zh} onChange={e => setZh(e.target.value)} autoFocus placeholder="例如：吃" />
          </div>
        </div>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>英文翻译</label>
            <input value={en} onChange={e => setEn(e.target.value)} placeholder="to eat" />
          </div>
        </div>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>例句</label>
            <textarea value={example} onChange={e => setExample(e.target.value)} rows={3} />
          </div>
        </div>

        {pos === 'verb' && (
          <div className="row">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={impersonal}
                onChange={e => setImpersonal(e.target.checked)}
              />
              <span>非人称动词（只考 il 形式）</span>
            </label>
          </div>
        )}

        {error && (
          <div style={{ color: '#b1261e', fontSize: 13, marginBottom: 8 }}>保存失败：{error}</div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
          <button className="ghost" onClick={onClose} disabled={saving}>取消</button>
          <button onClick={save} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}
