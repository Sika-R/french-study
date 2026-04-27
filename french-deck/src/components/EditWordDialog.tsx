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
}

interface Props {
  word: EditableWord;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditWordDialog({ word, onClose, onSaved }: Props) {
  const [zh, setZh] = useState(word.translation_zh ?? '');
  const [en, setEn] = useState(word.translation_en ?? '');
  const [example, setExample] = useState(word.example_fr ?? '');
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
        translation_zh: zh.trim() || null,
        translation_en: en.trim() || null,
        example_fr: example.trim() || null
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
          <div style={{ marginTop: 4 }}>
            <span className="tag">{word.pos}</span>
            {word.gender === 'm' && <span className="tag gender-m">le</span>}
            {word.gender === 'f' && <span className="tag gender-f">la</span>}
            <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
              （核心字段不可改；要改请重新录入同 lemma 触发覆盖）
            </span>
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
