import { useRef } from 'react';

const ACCENTS = ['é', 'è', 'ê', 'ë', 'à', 'â', 'î', 'ï', 'ô', 'û', 'ù', 'ü', 'ç', 'œ', 'æ'];

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function AccentInput({ value, onChange, placeholder, autoFocus }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  const insert = (ch: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + ch + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + ch.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div>
      <input
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <div className="accent-bar">
        {ACCENTS.map(c => (
          <button key={c} type="button" onClick={() => insert(c)}>{c}</button>
        ))}
      </div>
    </div>
  );
}
