import type { MachineTypeNode } from '../../api/platform.api';

/**
 * Makine türü ağacından seçim: girintili tek liste ("Lazer", "  CO2 lazer").
 * `allowAll`: süzgeçte "Tüm makineler" seçeneği.
 */
export function MachineTypeSelect({
  types,
  value,
  onChange,
  allowAll = false,
  counts,
  placeholder,
  disabled = false,
  id,
}: {
  types: MachineTypeNode[];
  value: string;
  onChange: (id: string) => void;
  allowAll?: boolean;
  counts?: Record<string, number>;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <select id={id} className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allowAll ? 'Tüm makineler' : placeholder ?? 'Makine türü seçin…'}</option>
      {types.map((t) => (
        <option key={t.id} value={t.id}>
          {'  '.repeat(t.depth)}
          {t.depth > 0 ? '↳ ' : ''}
          {t.name}
          {counts?.[t.id] ? ` (${counts[t.id]})` : ''}
        </option>
      ))}
    </select>
  );
}

/** Ebat seçeneklerini ("1300 × 900 mm") yazar. */
export function sizeLabel(w: number | null | undefined, h: number | null | undefined): string {
  if (!w || !h) return '';
  return `${w.toLocaleString('tr-TR')} × ${h.toLocaleString('tr-TR')} mm`;
}
