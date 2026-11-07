import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createMachine,
  deleteMachine,
  fetchBusinessProfile,
  fetchMachines,
  updateBusinessProfile,
  updateMachine,
  type BusinessProfile,
  type MachineInput,
  type MachineRecord,
} from '../../api/businessProfile.api';
import { fetchMachineTypeTree } from '../../api/directory.api';
import { fetchRegistrationOptions } from '../../api/registration.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { LabelChips } from '../../components/network/LabelChips';
import { LocationPicker } from '../../components/network/LocationPicker';
import { MachineTypeSelect, sizeLabel } from '../../components/network/MachineTypeSelect';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock, Spinner } from '../../components/ui/Loading';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage, toast } from '../../lib/toast';

function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

/**
 * İşletmenin kendi sayfası: iletişim ve adres (il/ilçe), iş kolları, rehberde
 * görünme ve ağ paylaşım tercihleri; altında makine envanteri. Diğer işletmeler
 * sizi buradaki bilgilerle bulur.
 */
export function BusinessPage() {
  const { can } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader
        icon="🪪"
        title="İşletme profili ve makineler"
        subtitle="Diğer işletmeler sizi il/ilçe, iş kolu ve makinelerinize göre bulabilir. Neyin görüneceğini siz belirlersiniz."
      />
      {can('settings') && <ProfileCard />}
      {can('catalog') && <MachinesCard />}
    </div>
  );
}

// ── Profil ───────────────────────────────────────────────────────────

type Form = Pick<
  BusinessProfile,
  | 'name'
  | 'legalName'
  | 'contactPerson'
  | 'phone'
  | 'email'
  | 'website'
  | 'province'
  | 'district'
  | 'addressLine'
  | 'description'
  | 'directoryVisible'
  | 'shareDebtInfo'
  | 'shareCustomerInfo'
> & { labelIds: string[] };

const toForm = (p: BusinessProfile): Form => ({
  name: p.name,
  legalName: p.legalName,
  contactPerson: p.contactPerson,
  phone: p.phone,
  email: p.email,
  website: p.website,
  province: p.province,
  district: p.district,
  addressLine: p.addressLine,
  description: p.description,
  directoryVisible: p.directoryVisible,
  shareDebtInfo: p.shareDebtInfo,
  shareCustomerInfo: p.shareCustomerInfo,
  labelIds: p.labelIds,
});

function ProfileCard() {
  const qc = useQueryClient();
  const { can, refreshMe } = useAuth();
  const canEdit = can('settings', 'write');
  const { data: profile, isLoading, isError } = useQuery({ queryKey: ['business-profile'], queryFn: fetchBusinessProfile });
  const { data: options } = useQuery({ queryKey: ['registration-options'], queryFn: fetchRegistrationOptions, staleTime: 60_000 });
  const [form, setForm] = useState<Form | null>(null);
  useEffect(() => {
    if (profile) setForm(toForm(profile));
  }, [profile]);

  const save = useMutation({
    mutationFn: (f: Form) =>
      updateBusinessProfile({
        ...f,
        // Boş alanlar sunucuda "yok" demektir.
        legalName: f.legalName?.trim() || null,
        contactPerson: f.contactPerson?.trim() || null,
        phone: f.phone?.trim() || null,
        email: f.email?.trim() || null,
        website: f.website?.trim() || null,
        province: f.province || null,
        district: f.district || null,
        addressLine: f.addressLine?.trim() || null,
        description: f.description?.trim() || null,
      }),
    onSuccess: (p) => {
      qc.setQueryData(['business-profile'], p);
      qc.invalidateQueries({ queryKey: ['settings'] });
      void refreshMe();
      toast.success('İşletme profili kaydedildi');
    },
    onError: (e) => toast.error('Kaydedilemedi', apiErrorMessage(e)),
  });

  if (isLoading || !form) return <LoadingBlock rows={4} />;
  if (isError || !profile) return <p className="card text-sm text-red-700">Profil yüklenemedi.</p>;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(profile));
  const missing: string[] = [];
  if (!form.province) missing.push('il');
  if (!form.district) missing.push('ilçe');
  if (!form.phone?.trim() && !form.email?.trim()) missing.push('telefon ya da e-posta');
  if (form.labelIds.length === 0) missing.push('en az bir iş kolu');
  const text = (k: 'name' | 'legalName' | 'contactPerson' | 'phone' | 'email' | 'website' | 'addressLine', props: Record<string, unknown> = {}) => (
    <input
      className="input"
      value={(form[k] as string | null) ?? ''}
      disabled={!canEdit}
      onChange={(e) => set(k, e.target.value)}
      {...props}
    />
  );

  return (
    <section className="card space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">Profil</h2>
        <p className="text-xs text-slate-500">
          Plan: <b>{profile.plan}</b>
          {profile.subscriptionUntil ? ` · bitiş ${profile.subscriptionUntil}` : ' · süresiz'}
        </p>
      </div>
      {!canEdit && (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
          Profili yalnız "Dükkân ayarları" yazma izni olanlar değiştirebilir.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="İşletme adı (rehberde görünen)">{text('name', { maxLength: 120 })}</Field>
        <Field label="Resmî unvan">{text('legalName', { maxLength: 160 })}</Field>
        <Field label="Yetkili kişi">{text('contactPerson', { maxLength: 120 })}</Field>
        <Field label="Telefon">{text('phone', { type: 'tel', inputMode: 'tel', maxLength: 40 })}</Field>
        <Field label="E-posta">{text('email', { type: 'email', inputMode: 'email', autoCapitalize: 'none', maxLength: 160 })}</Field>
        <Field label="Web sitesi">{text('website', { inputMode: 'url', autoCapitalize: 'none', maxLength: 200 })}</Field>
      </div>

      <LocationPicker
        province={form.province ?? ''}
        district={form.district ?? ''}
        disabled={!canEdit}
        idPrefix="prof"
        onChange={(province, district) => setForm((f) => (f ? { ...f, province, district } : f))}
      />
      <Field label="Açık adres">{text('addressLine', { maxLength: 300 })}</Field>
      <Field label="Kısa tanıtım" hint="Rehberde işletme kartında görünür.">
        <textarea
          className="input min-h-[80px] py-2"
          value={form.description ?? ''}
          disabled={!canEdit}
          maxLength={1000}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>

      <div>
        <p className="label">İş kolları (yönetici tanımlar, en çok 8)</p>
        {options ? (
          <LabelChips
            labels={options.labels}
            value={form.labelIds}
            max={8}
            disabled={!canEdit}
            onChange={(ids) => set('labelIds', ids)}
          />
        ) : (
          <LoadingBlock rows={1} />
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
        <Toggle
          checked={form.directoryVisible}
          disabled={!canEdit}
          onChange={(v) => set('directoryVisible', v)}
          title="Diğer işletmelerin rehberinde görünsün"
          hint={
            form.directoryVisible && missing.length
              ? `Görünmek için eksik: ${missing.join(', ')}.`
              : 'İletişim bilgileriniz (telefon, e-posta, adres) bu işletmelere gösterilir.'
          }
          warn={form.directoryVisible && missing.length > 0}
        />
        <Toggle
          checked={form.shareCustomerInfo}
          disabled={!canEdit}
          onChange={(v) => set('shareCustomerInfo', v)}
          title="Müşteri bilgi ağı"
          hint="Aynı telefonla müşteri kaydeden başka işletmelere ad ve iletişim bilgisi önerilir; siz de onlarınkini görürsünüz. Bakiye, not ve fiyat asla paylaşılmaz."
        />
        <Toggle
          checked={form.shareDebtInfo}
          disabled={!canEdit}
          onChange={(v) => set('shareDebtInfo', v)}
          title="Borç uyarı ağı"
          hint="Borçlu müşteriniz başka işletmede aynı telefonla kaydedilirken o işletmeye 'şu işletmeye borcu var, X gündür' uyarısı çıkar — TUTAR gösterilmez. Karşılıklıdır: kapatırsanız siz de başkalarının uyarılarını görmezsiniz."
        />
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate(form)}>
            {save.isPending && <Spinner />} Kaydet
          </button>
          {dirty && (
            <button className="btn-secondary" onClick={() => setForm(toForm(profile))} disabled={save.isPending}>
              Değişiklikleri geri al
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  hint,
  disabled,
  warn,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint: string;
  disabled?: boolean;
  warn?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-70' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className={`block text-xs ${warn ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-slate-500'}`}>{hint}</span>
      </span>
    </label>
  );
}

// ── Makineler ────────────────────────────────────────────────────────

const emptyMachine = (): MachineInput => ({
  name: '',
  code: '',
  machineTypeId: null,
  sizeId: null,
  workWidthMm: null,
  workHeightMm: null,
  brand: null,
  model: null,
  quantity: 1,
  isPublic: true,
  notes: null,
});

function MachinesCard() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canEdit = can('catalog', 'write');
  const { data: machines, isLoading } = useQuery({ queryKey: ['machines'], queryFn: fetchMachines });
  const { data: types } = useQuery({ queryKey: ['machine-type-tree'], queryFn: fetchMachineTypeTree, staleTime: 5 * 60_000 });
  const [editing, setEditing] = useState<MachineRecord | 'new' | null>(null);
  const byId = useMemo(() => new Map((types ?? []).map((t) => [t.id, t])), [types]);

  const del = useMutation({
    mutationFn: deleteMachine,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines'] });
      toast.success('Makine silindi');
    },
    onError: (e) => toast.error('Silinemedi', apiErrorMessage(e)),
  });

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Makineler</h2>
          <p className="text-xs text-slate-500">
            Türü ve çalışma alanı belli olan makineler rehberde aranabilir ("1300×900 fiber lazeri olan işletme").
          </p>
        </div>
        {canEdit && editing === null && (
          <button className="btn-primary" onClick={() => setEditing('new')}>
            ➕ Makine ekle
          </button>
        )}
      </div>

      {editing !== null && types && (
        <MachineForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          types={types}
          onClose={() => setEditing(null)}
        />
      )}

      {isLoading && <LoadingBlock rows={2} />}
      {machines && machines.length === 0 && editing === null && (
        <EmptyState icon="⚙️" title="Henüz makine yok" hint="İlk makinenizi ekleyin; türünü ve ebadını seçerseniz rehberde görünür." />
      )}
      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {machines?.map((m) => {
          const type = m.machineTypeId ? byId.get(m.machineTypeId) : undefined;
          const listed = !!m.machineTypeId && m.isPublic && m.isActive;
          return (
            <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.name}</span>
                  <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{m.code}</span>
                  {m.quantity > 1 && <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">× {m.quantity}</span>}
                  <span
                    className={`badge ${
                      listed ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                    }`}
                  >
                    {listed ? 'Rehberde' : !m.machineTypeId ? 'Rehberde değil · tür seçin' : 'Rehberde değil'}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                  {[type?.path, sizeLabel(m.workWidthMm, m.workHeightMm), [m.brand, m.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') ||
                    'Tür ve ebat girilmemiş'}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-2">
                  <button className="btn-secondary btn-sm" onClick={() => setEditing(m)}>
                    Düzenle
                  </button>
                  <button
                    className="btn-danger-soft btn-sm"
                    disabled={del.isPending}
                    onClick={async () => {
                      if (await confirmDialog({ title: 'Makine silinsin mi?', message: `"${m.name}" silinecek; kuyruktaki işlerin makine bilgisi boş kalır.`, confirmText: 'Sil', danger: true })) {
                        del.mutate(m.id);
                      }
                    }}
                  >
                    Sil
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MachineForm({
  initial,
  types,
  onClose,
}: {
  initial: MachineRecord | null;
  types: NonNullable<Awaited<ReturnType<typeof fetchMachineTypeTree>>>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<MachineInput>(initial ? { ...initial } : emptyMachine());
  const type = types.find((t) => t.id === f.machineTypeId);
  const set = <K extends keyof MachineInput>(k: K, v: MachineInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body: MachineInput = {
        name: f.name.trim(),
        code: f.code.trim(),
        machineTypeId: f.machineTypeId || null,
        sizeId: f.machineTypeId ? f.sizeId || null : null,
        workWidthMm: f.workWidthMm ? Number(f.workWidthMm) : null,
        workHeightMm: f.workHeightMm ? Number(f.workHeightMm) : null,
        brand: f.brand?.trim() || null,
        model: f.model?.trim() || null,
        quantity: Number(f.quantity) || 1,
        isPublic: !!f.isPublic,
        notes: f.notes?.trim() || null,
      };
      return initial ? updateMachine(initial.id, body) : createMachine(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines'] });
      toast.success(initial ? 'Makine güncellendi' : 'Makine eklendi');
      onClose();
    },
    onError: (e) => toast.error('Kaydedilemedi', apiErrorMessage(e)),
  });

  const presetDims = f.sizeId ? type?.sizes.find((s) => s.id === f.sizeId) : undefined;
  const valid =
    f.name.trim().length >= 2 &&
    f.code.trim().length >= 2 &&
    (!!f.workWidthMm === !!f.workHeightMm || !!presetDims);

  return (
    <form
      className="space-y-3 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/40 p-3 dark:border-blue-800 dark:bg-blue-950/20"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !save.isPending) save.mutate();
      }}
    >
      <p className="text-sm font-semibold">{initial ? 'Makineyi düzenle' : 'Yeni makine'}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Ad *">
          <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} autoFocus />
        </Field>
        <Field label="Kod * (kısa, benzersiz)" hint="Örn. FIBER1, ROUTER">
          <input className="input uppercase" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} maxLength={30} />
        </Field>
        <Field label="Makine türü" hint="Yöneticinin tanımladığı türlerden; seçilmezse rehberde görünmez.">
          <MachineTypeSelect
            types={types}
            value={f.machineTypeId ?? ''}
            placeholder="Tür seçin (rehber için)…"
            onChange={(id) => setF((x) => ({ ...x, machineTypeId: id || null, sizeId: null }))}
          />
        </Field>
        <Field label="Standart ebat">
          <select
            className="input"
            disabled={!type}
            value={f.sizeId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null;
              const s = type?.sizes.find((z) => z.id === id);
              setF((x) => ({ ...x, sizeId: id, workWidthMm: s ? s.widthMm : x.workWidthMm, workHeightMm: s ? s.heightMm : x.workHeightMm }));
            }}
          >
            <option value="">{type ? (type.sizes.length ? 'Özel ebat (aşağıya yazın)' : 'Bu tür için hazır ebat yok') : 'Önce tür seçin'}</option>
            {type?.sizes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Çalışma alanı eni (mm)">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            disabled={!!f.sizeId}
            value={f.workWidthMm ?? ''}
            onChange={(e) => set('workWidthMm', e.target.value ? Number(e.target.value) : null)}
          />
        </Field>
        <Field label="Çalışma alanı boyu (mm)">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            disabled={!!f.sizeId}
            value={f.workHeightMm ?? ''}
            onChange={(e) => set('workHeightMm', e.target.value ? Number(e.target.value) : null)}
          />
        </Field>
        <Field label="Marka">
          <input className="input" value={f.brand ?? ''} onChange={(e) => set('brand', e.target.value)} maxLength={80} />
        </Field>
        <Field label="Model">
          <input className="input" value={f.model ?? ''} onChange={(e) => set('model', e.target.value)} maxLength={80} />
        </Field>
        <Field label="Adet">
          <input className="input" type="number" min={1} max={999} value={f.quantity ?? 1} onChange={(e) => set('quantity', Number(e.target.value) || 1)} />
        </Field>
        <Field label="Not">
          <input className="input" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} maxLength={300} />
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={!!f.isPublic} onChange={(e) => set('isPublic', e.target.checked)} />
        Rehberde göster (işletme rehberde görünüyorsa)
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={!valid || save.isPending}>
          {save.isPending && <Spinner />} Kaydet
        </button>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={save.isPending}>
          Vazgeç
        </button>
      </div>
    </form>
  );
}
