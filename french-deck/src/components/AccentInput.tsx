import { useRef, CSSProperties, KeyboardEvent, MutableRefObject, useEffect } from 'react';

const ACCENTS = ['é', 'è', 'ê', 'ë', 'à', 'â', 'î', 'ï', 'ô', 'û', 'ù', 'ü', 'ç', 'œ', 'æ'];

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** 暴露内部 input element（供外层 focus 用） */
  inputRef?: MutableRefObject<HTMLInputElement | null>;
  tabIndex?: number;
}

export default function AccentInput({ value, onChange, placeholder, autoFocus, disabled, style, onKeyDown, inputRef, tabIndex }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  // 把内部 ref 同步到外面给的 ref（每次 render ���）
  useEffect(() => {
    if (inputRef) inputRef.current = ref.current;
  });

  const insert = (ch: string) => {
    if (disabled) return;
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
        disabled={disabled}
        tabIndex={tabIndex}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={style}
      />
      {!disabled && (
        <div className="accent-bar">
          {ACCENTS.map(c => (
            <button key={c} type="button" tabIndex={-1} onClick={() => insert(c)}>{c}</button>
          ))}
        </div>
      )}
    </div>
  );
}
