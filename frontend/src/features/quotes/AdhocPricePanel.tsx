import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTemplatePricing } from '../../api/materials.api';
import { fetchPriceRules } from '../../api/price-rules.api';
import type { MeasurementType } from '../../types';
import { UNIT_SHORT } from '../../lib/services';

const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

/**
 * Stoksuz kalemde fiyat çatısı: ürün türüne uyan en özel çatının önerdiği fiyat (kâr dahil), ya da
 * listeden elle seçilen çatının. "Uygula" kalemin birim fiyatına yazar. Fiyat çatıyla aynı birimdedir.
 */
export function AdhocPricePanel({
  templateId,
  categoryId,
  billingUnit,
  onApply,
}: {
  templateId: string;
  categoryId?: string;
  billingUnit?: MeasurementType;
  onApply: (unitPrice: number) => void;
}) {
  const [ruleId, setRuleId] = useState('');
  const { data: pricing, isFetching } = useQuery({
    queryKey: ['template-pricing', templateId, ruleId],
    queryFn: () => fetchTemplatePricing(templateId, ruleId || undefined),
  });
  const { data: rules } = useQuery({
    queryKey: ['price-rules', categoryId ?? ''],
    queryFn: () => fetchPriceRules(categoryId),
    enabled: !!categoryId,
    staleTime: 60_000,
  });
  const active = (rules ?? []).filter((r) => r.isActive);
  const price = pricing?.suggestedUnitPrice ?? null;
  const unitDiffers = !!pricing && !!billingUnit && pricing.unit !== billingUnit;

  return (
    <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2 text-xs dark:border-indigo-900 dark:bg-indigo-950/20">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-indigo-900 dark:text-indigo-200">Fiyat çatısı</span>
        <select
          className="input min-h-[32px] w-auto max-w-full py-1 text-xs"
          value={ruleId}
          onChange={(e) => setRuleId(e.target.value)}
          aria-label="Fiyat çatısı"
        >
          <option value="">Otomatik (uyan en özel çatı)</option>
          {active.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {isFetching && !pricing ? (
        <p className="text-slate-500">Fiyat aranıyor…</p>
      ) : price != null ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-700 dark:text-slate-200">
            {pricing?.rule?.label ? `${pricing.rule.label}: ` : ''}
            <strong>
              {money.format(price)}/{UNIT_SHORT[pricing!.unit]}
            </strong>
            {pricing && pricing.markupPercent ? ` (kâr %${pricing.markupPercent} dahil)` : ''}
          </span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => onApply(price)} disabled={unitDiffers}>
            Uygula
          </button>
          {unitDiffers && (
            <span className="text-amber-700 dark:text-amber-300">
              Çatı fiyatı {UNIT_SHORT[pricing!.unit]} başına; kalemin birimi {UNIT_SHORT[billingUnit!]}.
            </span>
          )}
        </div>
      ) : (
        <p className="text-slate-500">
          {ruleId ? 'Seçilen çatıda fiyat yok.' : 'Bu ürün türüne uyan fiyat çatısı yok: listeden seçebilir ya da fiyatı elle yazabilirsiniz.'}
        </p>
      )}
    </div>
  );
}
