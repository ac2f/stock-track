import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchInput } from '../../components/ui/SearchInput';
import { FacetChips, useFacets } from '../../components/ui/FacetChips';
import { groupChipClass } from '../../components/GroupSection';
import { TEMPLATE_FACETS, templateSearchText } from '../../lib/catalogKey';
import { rankBySearch, suggestQuery } from '../../lib/search';
import { useAuth } from '../../context/AuthContext';
import { NewTemplatePanel } from './NewTemplatePanel';
import type { EnsureTemplateResult } from '../../api/materials.api';
import { formatNumber } from '../../lib/format';
import { stripNamePlaceholders } from '../../lib/plateLabel';
import type { MaterialTemplate } from '../../types';

const MAX_RESULTS = 60;

/**
 * Ürün türü bulucu: arama (sözcük sırası fark etmez) + tür çipi + marka,
 * kalınlık, ebat, renk çipleri. Kategoride yüzlerce tür olsa da iki üç
 * dokunuşla aranan ürüne inilir.
 */
export function TemplateFinder({
  templates,
  selectedId,
  onPick,
  onCreated,
  createLabel = 'Ürün türünü kaydet ve seç',
  createHint,
}: {
  templates: MaterialTemplate[];
  selectedId?: string;
  onPick: (id: string) => void;
  /**
   * Arama boş çıkınca "bu ürün türünü kaydet" paneli açılır; kaydedilince
   * çağrılır. Verilmezse yeni türün kimliğiyle `onPick` çağrılır.
   */
  onCreated?: (result: EnsureTemplateResult) => void;
  createLabel?: string;
  createHint?: string;
}) {
  const { can } = useAuth();
  const canCreate = can('stock', 'write');
  const [term, setTerm] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [creating, setCreating] = useState(false);

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const t of templates) {
      const c = map.get(t.categoryId);
      if (c) c.count++;
      else map.set(t.categoryId, { id: t.categoryId, name: t.category?.name ?? 'Diğer', count: 1 });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [templates]);

  // Arama: yazım hatası, sözcük sırası, Türkçe karakter fark etmez; en iyi
  // eşleşme üstte. Arama yokken tür → kalınlık → ada göre sıralanır.
  const searched = useMemo(
    () =>
      rankBySearch(
        templates.filter((t) => !categoryId || t.categoryId === categoryId),
        term,
        templateSearchText,
      ),
    [templates, categoryId, term],
  );
  const facets = useFacets(searched, TEMPLATE_FACETS);
  const hasTerm = !!term.trim();
  const results = useMemo(
    () =>
      hasTerm
        ? facets.filtered
        : [...facets.filtered].sort(
            (a, b) =>
              (a.category?.name ?? '').localeCompare(b.category?.name ?? '', 'tr') ||
              (Number(a.defaultThickness?.valueMm) || 0) - (Number(b.defaultThickness?.valueMm) || 0) ||
              a.name.localeCompare(b.name, 'tr', { numeric: true }),
          ),
    [facets.filtered, hasTerm],
  );
  // Sonuç yoksa: "Bunu mu demek istediniz?" (katalogdaki yazımla).
  const didYouMean = useMemo(
    () => (hasTerm && !results.length ? suggestQuery(term, templates.map(templateSearchText)) : null),
    [hasTerm, results.length, term, templates],
  );

  const finishCreate = (res: EnsureTemplateResult) => {
    setCreating(false);
    setTerm('');
    if (onCreated) onCreated(res);
    else onPick(res.template.id);
  };

  if (creating) {
    return (
      <NewTemplatePanel
        query={term}
        submitLabel={createLabel}
        hint={createHint}
        onCreated={finishCreate}
        onCancel={() => setCreating(false)}
      />
    );
  }

  if (!templates.length) {
    return canCreate ? (
      <NewTemplatePanel
        query=""
        submitLabel={createLabel}
        hint={createHint ?? 'Henüz ürün türü yok: ilkini oluşturun.'}
        onCreated={finishCreate}
        onCancel={() => undefined}
      />
    ) : (
      <p className="text-sm text-slate-500">
        Önce bir ürün türü tanımlayın:{' '}
        <Link to="/material-templates?new=1" className="font-medium text-blue-600 underline">
          Ürün Türleri
        </Link>
      </p>
    );
  }

  const narrowed = !!categoryId || !!term.trim();

  return (
    <div className="space-y-2 rounded-xl border border-slate-300 p-2 dark:border-slate-700">
      <SearchInput value={term} onChange={setTerm} placeholder="Ara: beyaz 2,8 akpolimer…" aria-label="Ürün türü ara" />

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
            categoryId === ''
              ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}
          onClick={() => {
            setCategoryId('');
            facets.clear();
          }}
        >
          Tümü
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={categoryId === c.id}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              categoryId === c.id
                ? 'bg-slate-800 text-white ring-2 ring-slate-800 dark:bg-slate-100 dark:text-slate-900'
                : groupChipClass(c.name)
            }`}
            onClick={() => {
              setCategoryId(c.id);
              facets.clear();
            }}
          >
            {c.name} <span className="opacity-60">{c.count}</span>
          </button>
        ))}
      </div>

      {narrowed ? (
        <FacetChips facets={TEMPLATE_FACETS} state={facets} />
      ) : (
        <p className="px-1 text-xs text-slate-400">
          Türü seçin; ardından marka, kalınlık, ebat ve renk çipleriyle daraltın.
        </p>
      )}

      <div className="max-h-64 space-y-1 overflow-y-auto">
        {results.slice(0, MAX_RESULTS).map((t) => {
          const specs = [
            t.defaultThickness ? `${formatNumber(t.defaultThickness.valueMm)} mm` : null,
            t.defaultBrand?.name,
            t.defaultColor ? (t.defaultColor.code ? `${t.defaultColor.name} ${t.defaultColor.code}` : t.defaultColor.name) : null,
            t.defaultSize ? `${Number(t.defaultSize.widthMm)}×${Number(t.defaultSize.heightMm)}` : null,
            t.defaultVariant,
          ].filter(Boolean);
          const on = selectedId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t.id)}
              title={t.name}
              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${
                on
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
              }`}
            >
              {!categoryId && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${groupChipClass(t.category?.name ?? 'Diğer')}`}>
                  {t.category?.name ?? 'Diğer'}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {on ? '✓ ' : ''}
                  {stripNamePlaceholders(t.name) || t.name}
                </span>
                {specs.length > 0 && <span className="block truncate text-[11px] text-slate-500">{specs.join(' · ')}</span>}
              </span>
            </button>
          );
        })}
        {!results.length && <p className="py-2 text-center text-xs text-slate-400">Uyan ürün türü yok.</p>}
        {didYouMean && (
          <button
            type="button"
            className="block w-full rounded-lg bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-100"
            onClick={() => setTerm(didYouMean)}
          >
            Bunu mu demek istediniz: <b>{didYouMean}</b>
          </button>
        )}
        {canCreate && (
          <button
            type="button"
            className={`block w-full rounded-lg border-2 border-dashed px-3 py-2 text-left text-sm font-medium ${
              results.length
                ? 'border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700'
                : 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200'
            }`}
            onClick={() => setCreating(true)}
          >
            {hasTerm ? (
              <>
                ➕ {results.length ? 'Aradığınız yok mu?' : 'Ürün türü yok.'} <b>“{term.trim()}”</b> için yeni ürün türü
                oluştur
              </>
            ) : (
              <>➕ Listede olmayan yeni ürün türü oluştur</>
            )}
          </button>
        )}
        {results.length > MAX_RESULTS && (
          <p className="py-1 text-center text-xs text-slate-400">
            {results.length - MAX_RESULTS} sonuç daha — çiplerle ya da aramayla daraltın.
          </p>
        )}
      </div>
    </div>
  );
}
