import { useState, type ReactNode } from 'react';
import { fold } from '../../lib/search';

export interface PickOption {
  /** Seçilince alana yazılan değer. */
  value: string;
  /** Listede görünen metin (boşsa value). */
  label?: string;
}

/**
 * Listeden seç, yoksa yeni yaz: önce mevcut kayıtlar BİR LİSTE olarak gelir
 * (açılır liste — telefonda da dokunarak seçilir); listede olmayan için son
 * satırdaki "➕ Yeni …" seçilince bir metin kutusu açılır.
 *
 * Değer listedeki bir kayıtla (yazım/Türkçe karakter farkı gözetmeden) eşleşiyorsa
 * liste o kaydı seçili gösterir; eşleşmiyorsa yeni kayıt kipine geçer.
 */
export function PickOrNew({
  label,
  required,
  options,
  value,
  onChange,
  newLabel,
  placeholder = 'Seçin…',
  newPlaceholder,
  loading = false,
  disabled = false,
  hint,
  id,
  className = '',
}: {
  label: ReactNode;
  required?: boolean;
  options: PickOption[];
  value: string;
  onChange: (value: string) => void;
  /** Son satırın metni: "Yeni marka yaz…" */
  newLabel: string;
  placeholder?: string;
  newPlaceholder?: string;
  loading?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
  id: string;
  className?: string;
}) {
  const [forceNew, setForceNew] = useState(false);
  const match = options.find((o) => fold(o.value) === fold(value));
  // Liste boşsa (ör. kategori yeni ya da hiç marka kaydı yok) yalnız metin kutusu çalışır.
  // Ama alan pasifken ya da liste yükleniyorken boş bir YAZI kutusu değil, pasif bir LİSTE
  // gösterilir ("Önce tür seçin"): kullanıcı neyin beklendiğini görsün.
  const placeholderOnly = options.length === 0 && (disabled || loading);
  const noList = options.length === 0 && !placeholderOnly;
  const isNew = !placeholderOnly && (forceNew || noList || (!!value.trim() && !match));
  const selectValue = isNew ? '__new__' : match?.value ?? '';

  return (
    <div className={`block min-w-0 ${className}`}>
      <label className="label" htmlFor={`${id}-select`}>
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {!noList && (
        <select
          id={`${id}-select`}
          className="input"
          disabled={disabled || loading}
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__new__') {
              setForceNew(true);
              onChange('');
            } else {
              setForceNew(false);
              onChange(v);
            }
          }}
        >
          <option value="">{loading ? 'Yükleniyor…' : placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label ?? o.value}
            </option>
          ))}
          {!placeholderOnly && <option value="__new__">➕ {newLabel}</option>}
        </select>
      )}
      {isNew && (
        <input
          id={noList ? `${id}-select` : `${id}-new`}
          className={`input ${noList ? '' : 'mt-2'}`}
          placeholder={newPlaceholder ?? newLabel}
          value={value}
          disabled={disabled}
          autoComplete="off"
          autoFocus={!noList && forceNew}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {isNew && !noList && (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-blue-600 hover:underline"
          onClick={() => {
            setForceNew(false);
            onChange('');
          }}
        >
          ↩ Listeden seç
        </button>
      )}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </div>
  );
}
