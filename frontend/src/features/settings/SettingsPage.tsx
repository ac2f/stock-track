import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchBusinessSettings,
  updateBusinessSettings,
  type UpdateBusinessInput,
} from '../../api/settings.api';

/** Etiketli form alanı. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

/**
 * Ayarlar (İşletme Sahibi). İşletme/proje kimliği tek ekrandan düzenlenir;
 * PDF/yazdırma belgelerinde ve arayüz başlığında bu ad/bilgiler kullanılır.
 */
export function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'business'],
    queryFn: fetchBusinessSettings,
  });

  const [form, setForm] = useState<UpdateBusinessInput>({});
  useEffect(() => {
    if (data) {
      setForm({
        businessName: data.name,
        businessAddress: data.address,
        businessPhone: data.phone,
        businessTaxNo: data.taxNo,
        businessLogoPath: data.logoPath,
        portalBaseUrl: data.portalBaseUrl,
      });
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () => updateBusinessSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'business'] });
      if (form.businessName) document.title = `${form.businessName} ERP`;
    },
  });

  const set = (patch: Partial<UpdateBusinessInput>) =>
    setForm((f) => ({ ...f, ...patch }));

  if (isLoading) return <p className="text-slate-400">Yükleniyor…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Ayarlar — İşletme / Proje Kimliği</h1>
      <p className="text-sm text-slate-500">
        Buradaki ad ve bilgiler tüm PDF/yazdırma belgelerinde (teklif, fatura,
        fiş, ekstre, raporlar) ve uygulama başlığında kullanılır.
      </p>

      <div className="card space-y-3">
        <Field
          label="İşletme / Proje adı"
          value={form.businessName ?? ''}
          placeholder="Örn. Acme Reklam & İmalat"
          onChange={(v) => set({ businessName: v })}
          hint="Belgelerin başlığında ve site başlığında görünür."
        />
        <Field
          label="Adres"
          value={form.businessAddress ?? ''}
          onChange={(v) => set({ businessAddress: v })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Telefon"
            value={form.businessPhone ?? ''}
            onChange={(v) => set({ businessPhone: v })}
          />
          <Field
            label="Vergi No (VKN)"
            value={form.businessTaxNo ?? ''}
            onChange={(v) => set({ businessTaxNo: v })}
          />
        </div>
        <Field
          label="Logo dosya yolu (opsiyonel)"
          value={form.businessLogoPath ?? ''}
          onChange={(v) => set({ businessLogoPath: v })}
          hint="Sunucuda erişilebilir bir dosya yolu (ileride belge başlığına basmak için)."
        />
        <Field
          label="Müşteri portalı temel adresi"
          value={form.portalBaseUrl ?? ''}
          onChange={(v) => set({ portalBaseUrl: v })}
          hint="Örn. http://192.168.1.50:5173/portal"
        />

        {mut.isError && (
          <p className="text-sm text-red-600">
            {(mut.error as { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'Kaydedilemedi.'}
          </p>
        )}
        {mut.isSuccess && (
          <p className="text-sm text-emerald-600">Kaydedildi.</p>
        )}

        <button
          className="btn-primary"
          disabled={mut.isPending}
          onClick={() => mut.mutate()}
        >
          Kaydet
        </button>
      </div>
    </div>
  );
}
