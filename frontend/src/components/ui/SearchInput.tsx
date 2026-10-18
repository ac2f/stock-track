import { forwardRef, type InputHTMLAttributes } from 'react';

/**
 * Büyüteçli arama kutusu; doluyken × ile tek dokunuşta temizlenir.
 * Klavyede "/" tuşu sayfadaki bu kutuya odaklanır.
 */
export const SearchInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
    value: string;
    onChange: (value: string) => void;
  }
>(function SearchInput({ value, onChange, className = '', placeholder = 'Ara…', ...rest }, ref) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
        🔍
      </span>
      <input
        ref={ref}
        type="search"
        className="input pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
        {...rest}
      />
      {value && (
        <button
          type="button"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onClick={() => onChange('')}
          aria-label="Aramayı temizle"
        >
          ×
        </button>
      )}
    </div>
  );
});
