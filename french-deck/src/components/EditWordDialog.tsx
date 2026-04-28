import { useEffect, useState } from 'react';
import AccentInput from './AccentInput';

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
  lemma_plural?: string | null;
  lemma_feminine?: string | null;
}

type AdjFormKind = 'm_sg' | 'f_sg' | 'm_pl' | 'f_pl' | 'm_sg_vowel';
const ADJ_FORM_ORDER: { kind: AdjFormKind; label: string }[] = [
  { kind: 'm_sg', label: '阳性单数' },
  { kind: 'f_sg', label: '阴性单数' },
  { kind: 'm_pl', label: '阳性复数' },
  { kind: 'f_pl', label: '阴性复数' },
  { kind: 'm_sg_vowel', label: '元音前阳单 (可选)' }
];

interface Props {
  word: EditableWord;
  /** 已存在的形容词形式（用于 pos=adj 时回填） */
  initialAdjForms?: Partial<Record<AdjFormKind, string>>;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditWordDialog({ word, initialAdjForms, onClose, onSaved }: Props) {
  const [pos, setPos] = useState(word.pos);
  const [gender, setGender] = useState<'m' | 'f' | ''>(word.gender ?? '');
  const [zh, setZh] = useState(word.translation_zh ?? '');
  const [en, setEn] = useState(word.translation_en ?? '');
  const [example, setExample] = useState(word.example_fr ?? '');
  const [impersonal, setImpersonal] = useState<boolean>(!!word.impersonal);
  const [lemmaPlural, setLemmaPlural] = useState<string>(word.lemma_plural ?? '');
  const [lemmaFeminine, setLemmaFeminine] = useState<string>(word.lemma_feminine ?? '');
  const [adjForms, setAdjForms] = useState<Record<AdjFormKind, string>>({
    m_sg: initialAdjForms?.m_sg ?? '',
    f_sg: initialAdjForms?.f_sg ?? '',
    m_pl: initialAdjForms?.m_pl ?? '',
    f_pl: initialAdjForms?.f_pl ?? '',
    m_sg_vowel: initialAdjForms?.m_sg_vowel ?? ''
  });
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
      const patch: any = {
        pos: pos.trim() || word.pos,
        gender: pos === 'noun' ? (gender || null) : null,
        translation_zh: zh.trim() || null,
        translation_en: en.trim() || null,
        example_fr: example.trim() || null,
        impersonal: (pos === 'verb' && impersonal) ? 1 : 0,
        lemma_plural: (pos === 'noun' && lemmaPlural.trim()) ? lemmaPlural.trim().toLowerCase() : null,
        lemma_feminine: (pos === 'noun' && lemmaFeminine.trim()) ? lemmaFeminine.trim().toLowerCase() : null
      };
      // 形容词：整组替换（清空所有 form 也是合法操作）
      if (pos === 'adj') {
        patch.adjForms = (Object.keys(adjForms) as AdjFormKind[])
          .filter(k => adjForms[k].trim())
          .map(k => ({ kind: k, surface: adjForms[k].trim() }));
      } else {
        // 切到非 adj：清空 forms
        patch.adjForms = [];
      }
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

        {pos === 'adj' && (
          <div style={{
            marginTop: 4, marginBottom: 8, padding: 12,
            background: '#f6f7fb', borderRadius: 8, border: '1px solid #e6e8ef'
          }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              形容词的各种形式（不需要的留空；元音前阳单仅 beau/nouveau/vieux 等需要）
            </div>
            {ADJ_FORM_ORDER.map(({ kind, label }) => (
              <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <div style={{ width: 110, color: '#666', fontSize: 13 }}>{label}</div>
                <div style={{ flex: 1 }}>
                  <AccentInput
                    value={adjForms[kind]}
                    onChange={v => setAdjForms(s => ({ ...s, [kind]: v }))}
                    placeholder={kind === 'm_sg_vowel' ? '如 bel（没有就留空）' : ''}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {pos === 'noun' && (
          <div className="row">
            <div style={{ flex: 1 }}>
              <label>不规则复数 (留空 = 规则的 +s/+x)</label>
              <AccentInput
                value={lemmaPlural}
                onChange={setLemmaPlural}
                placeholder="例如 cheval → chevaux；chat 留空"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>阴性形式 (无对应阴性词留空)</label>
              <AccentInput
                value={lemmaFeminine}
                onChange={setLemmaFeminine}
                placeholder="例如 chat → chatte；table 留空"
              />
            </div>
          </div>
        )}

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
