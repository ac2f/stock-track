import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  addMember,
  createShop,
  fetchManagedShops,
  fetchMembers,
  removeMember,
  updateMember,
  updateMemberAccount,
  updateShop,
  type ManagedShop,
  type ShopMemberView,
} from '../../api/shops.api';
import { deleteEmployee, fetchEmployees, updateEmployee } from '../../api/users.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useUrlParam } from '../../hooks/useUrlParam';
import { PERMISSION_PRESETS, SHOP_MODULES, emptyPermissions } from '../../lib/shop';
import type { ShopModule, ShopPermissions } from '../../types';

const errText = (e: unknown) =>
  ((e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message as string) ??
  'İşlem başarısız.';

// ── Küçük görsel yardımcılar ────────────────────────────────────────────

/** Ad soyadın baş harfleri: "Ayşe Nur Kaya" → "AK". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  return s.toLocaleUpperCase('tr') || '?';
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
];

/** Baş harfli yuvarlak; renk addan türetilir, aynı kişi hep aynı renkte görünür. */
function Avatar({ name, muted, small }: { name: string; muted?: boolean; small?: boolean }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = muted ? 'bg-slate-200 text-slate-500' : AVATAR_COLORS[h % AVATAR_COLORS.length];
  return (
    <span
      aria-hidden
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${
        small ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm'
      } ${color}`}
    >
      {initials(name)}
    </span>
  );
}

/** Okuma/yazma düzeyinin rengi ve adı (özet çiplerinde). */
function levelOf(p: { read?: boolean; write?: boolean } | undefined) {
  if (p?.read && p?.write) return { text: 'okur, yazar', cls: 'bg-emerald-100 text-emerald-800' };
  if (p?.read) return { text: 'okur', cls: 'bg-sky-100 text-sky-800' };
  return { text: 'yazar', cls: 'bg-amber-100 text-amber-800' };
}

/** İki izin kümesi aynı mı? (hazır küme vurgusu, kaydedilmemiş değişiklik) */
function samePerms(a: ShopPermissions, b: ShopPermissions): boolean {
  return SHOP_MODULES.every(
    ({ key }) => !!a[key]?.read === !!b[key]?.read && !!a[key]?.write === !!b[key]?.write,
  );
}

/**
 * Ekip ve yetkiler. Sistem sahibi dükkân açar/kapatır ve herkesin her
 * dükkândaki izinlerini düzenler; dükkân yöneticisi yalnız yönettiği dükkânın
 * ekibini, kendisinde olan izinler kadarıyla düzenler.
 */
export function TeamPage() {
  const { isOwner, refreshMe } = useAuth();
  const qc = useQueryClient();
  const { data: shops, isLoading } = useQuery({ queryKey: ['managed-shops'], queryFn: fetchManagedShops });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Hızlı aramadan /team?new=1 → seçili dükkânda "Kişi ekle" formu açılır.
  const [addRequest, setAddRequest] = useState(false);
  useUrlParam('new', () => setAddRequest(true));

  useEffect(() => {
    if (!selected && shops?.length) setSelected(shops[0].id);
  }, [shops, selected]);

  const current = shops?.find((s) => s.id === selected) ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        icon="👥"
        title="Ekip ve yetkiler"
        subtitle="Her dükkânın deposu, müşterileri, teklifleri ve ödemeleri ayrıdır. Kimin hangi dükkânda neyi görüp (okuma) neyi değiştirebileceğini (yazma) buradan ayarlayın."
        actions={
          isOwner &&
          !creating && (
            <button className="btn-secondary" onClick={() => setCreating(true)}>
              + Yeni dükkân
            </button>
          )
        }
      />

      {creating && (
        <NewShopForm
          shops={shops ?? []}
          onDone={async (id) => {
            setCreating(false);
            await qc.invalidateQueries({ queryKey: ['managed-shops'] });
            await refreshMe();
            if (id) setSelected(id);
          }}
        />
      )}

      {isLoading && <LoadingBlock rows={2} />}

      {!isLoading && shops?.length === 0 && (
        <EmptyState
          icon="🏪"
          title="Yönetebileceğiniz bir dükkân yok"
          hint={
            isOwner
              ? 'Sağ üstteki “+ Yeni dükkân” ile ilk dükkânı açın; ardından ekibini buradan ekleyin.'
              : 'Bir dükkânın yöneticisi olduğunuzda ekibini buradan düzenleyebilirsiniz.'
          }
        />
      )}

      {!!shops?.length && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">
            Dükkân seçin <span className="text-slate-400">({shops.length})</span>
          </div>
          <div role="group" aria-label="Dükkân seçimi" className="flex flex-wrap gap-2">
            {shops.map((s) => {
              const on = s.id === selected;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s.id)}
                  aria-pressed={on}
                  className={`flex min-h-[44px] min-w-0 max-w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition ${
                    on
                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-lg leading-none" aria-hidden>
                    🏪
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="break-words font-semibold">{s.name}</span>
                      {!s.isActive && (
                        <span className={`badge ${on ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                          kapalı
                        </span>
                      )}
                    </span>
                    <span className={`block text-xs ${on ? 'text-blue-100' : 'text-slate-500'}`}>{s.memberCount} kişi</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {current && (
        <ShopPanel
          key={current.id}
          shop={current}
          startAdding={addRequest}
          onStartedAdding={() => setAddRequest(false)}
        />
      )}

      {isOwner && <AccountsSection />}
    </div>
  );
}

// ── Yeni dükkân ─────────────────────────────────────────────────────────

function NewShopForm({ shops, onDone }: { shops: ManagedShop[]; onDone: (id?: string) => void }) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState(shops[0]?.id ?? '');
  const [copyCatalog, setCopyCatalog] = useState(true);
  const [copySettings, setCopySettings] = useState(true);
  const mut = useMutation({
    mutationFn: () =>
      createShop({
        name: name.trim(),
        copyFromShopId: from || undefined,
        copyCatalog: !!from && copyCatalog,
        copySettings: !!from && copySettings,
      }),
    onSuccess: (s) => onDone(s.id),
  });
  return (
    <div className="card space-y-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <span aria-hidden>🏪</span> Yeni dükkân
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="label">
            Dükkân adı <span className="text-red-500">*</span>
          </span>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Merkez, Şube 2"
          />
        </label>
        <label className="block min-w-0">
          <span className="label">Hazır bilgileri şu dükkândan al</span>
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">— Sıfırdan başla —</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {from && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
          <div className="text-xs font-medium text-slate-500">Kopyalanacaklar</div>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={copyCatalog}
              onChange={(e) => setCopyCatalog(e.target.checked)}
            />
            Malzeme kataloğu, tarifeler, makineler ve gider türleri
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={copySettings}
              onChange={(e) => setCopySettings(e.target.checked)}
            />
            Ayarlar (fiyatlar, kesim fiyatlandırması, işletme bilgileri — ad hariç)
          </label>
        </div>
      )}
      <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
        ℹ️ Stok, müşteri, teklif ve ödemeler kopyalanmaz: yeni dükkân bunlarla boş başlar. Corel eklentisi için
        dükkânın Ayarlar sayfasından ayrı bir anahtar üretilir.
      </p>
      {mut.isError && <p className="text-sm text-red-600">{errText(mut.error)}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={name.trim().length < 2 || mut.isPending} onClick={() => mut.mutate()}>
          Dükkânı aç
        </button>
        <button className="btn-secondary" onClick={() => onDone()}>
          İptal
        </button>
      </div>
    </div>
  );
}

// ── Dükkân paneli ───────────────────────────────────────────────────────

function ShopPanel({
  shop,
  startAdding,
  onStartedAdding,
}: {
  shop: ManagedShop;
  startAdding?: boolean;
  onStartedAdding?: () => void;
}) {
  const { isOwner, shops: myShops, refreshMe } = useAuth();
  const qc = useQueryClient();
  const { data: members, isLoading, error } = useQuery({
    queryKey: ['shop-members', shop.id],
    queryFn: () => fetchMembers(shop.id),
  });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(shop.name);

  // ?new=1 ile gelindiyse formu bir kez aç.
  useEffect(() => {
    if (!startAdding) return;
    setAdding(true);
    onStartedAdding?.();
  }, [startAdding, onStartedAdding]);

  // Verebileceğim izinler: sistem sahibi hepsini, yönetici kendisininkini.
  const myPerms = useMemo<ShopPermissions>(() => {
    if (isOwner) return PERMISSION_PRESETS[PERMISSION_PRESETS.length - 1].build();
    return myShops.find((s) => s.id === shop.id)?.permissions ?? emptyPermissions();
  }, [isOwner, myShops, shop.id]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['shop-members', shop.id] });
    await qc.invalidateQueries({ queryKey: ['managed-shops'] });
  };

  const shopMut = useMutation({
    mutationFn: (input: { name?: string; isActive?: boolean }) => updateShop(shop.id, input),
    onSuccess: async () => {
      await refresh();
      await refreshMe();
    },
  });

  const toggleShop = async () => {
    const ok = await confirmDialog(
      shop.isActive
        ? {
            title: 'Dükkân kapatılsın mı?',
            message: `"${shop.name}" kapatılsın mı? Çalışanları giremez; veriler silinmez, yeniden açılabilir.`,
            confirmText: 'Dükkânı kapat',
            danger: true,
          }
        : { message: `"${shop.name}" yeniden açılsın mı?`, confirmText: 'Dükkânı aç', danger: false },
    );
    if (ok) shopMut.mutate({ isActive: !shop.isActive });
  };

  return (
    <div className="space-y-3">
      {isOwner && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Dükkân bilgisi</h2>
            <span className={`badge ${shop.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
              {shop.isActive ? 'Açık' : 'Kapalı'}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block min-w-0 flex-1">
              <span className="label">Dükkân adı</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                disabled={name.trim() === shop.name || name.trim().length < 2 || shopMut.isPending}
                onClick={() => shopMut.mutate({ name: name.trim() })}
              >
                Adı kaydet
              </button>
              <button
                className={shop.isActive ? 'btn-danger-soft' : 'btn-success'}
                disabled={shopMut.isPending}
                onClick={() => void toggleShop()}
              >
                {shop.isActive ? 'Dükkânı kapat' : 'Dükkânı aç'}
              </button>
            </div>
          </div>
          {shopMut.isError && <p className="text-sm text-red-600">{errText(shopMut.error)}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <span className="break-words">{shop.name} ekibi</span>
            {members && <span className="badge bg-slate-100 text-slate-600">{members.length} kişi</span>}
          </h2>
          {isOwner && (
            <p className="text-xs text-slate-500">Sistem sahipleri her dükkâna tam yetkiyle girer.</p>
          )}
        </div>
        {!adding && (
          <button className="btn-primary" data-hotkey="n" title="Kişi ekle (N)" onClick={() => setAdding(true)}>
            + Kişi ekle
          </button>
        )}
      </div>

      {adding && (
        <AddMemberForm
          shopId={shop.id}
          shopName={shop.name}
          grantable={myPerms}
          onDone={async () => {
            setAdding(false);
            await refresh();
          }}
        />
      )}

      {error && <p className="card text-sm text-red-600">{errText(error)}</p>}
      {isLoading && <LoadingBlock rows={2} />}
      {members?.length === 0 && !adding && (
        <EmptyState
          compact
          icon="🧑‍🤝‍🧑"
          title="Bu dükkânda henüz kimse yok."
          hint="“+ Kişi ekle” ile yeni bir hesap açın ya da var olan bir kullanıcıyı bu dükkâna ekleyin."
        />
      )}
      <div className="space-y-2">
        {members?.map((m) => (
          <MemberCard key={m.id} shopId={shop.id} member={m} grantable={myPerms} onChanged={refresh} />
        ))}
      </div>
    </div>
  );
}

// ── Yönetici anahtarı ───────────────────────────────────────────────────

function AdminToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
        checked
          ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30'
          : 'border-slate-200 hover:bg-slate-100'
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span aria-hidden>🛡️</span> Dükkân yöneticisi
          <span className={`badge ${checked ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            {checked ? 'Yönetici' : 'Yönetici değil'}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">
          Bu dükkânın ekibini ve izinlerini düzenler (yalnız kendisinde olan izinler kadarıyla).
        </span>
      </span>
    </label>
  );
}

// ── İzin özeti (kart üstündeki renkli çipler) ───────────────────────────

function PermissionSummary({ perms }: { perms: ShopPermissions }) {
  const granted = SHOP_MODULES.filter(({ key }) => perms[key]?.read || perms[key]?.write);
  if (granted.length === 0) {
    return <span className="badge bg-slate-100 text-slate-500">Hiçbir alana erişimi yok</span>;
  }
  const every = (fn: (p: { read: boolean; write: boolean }) => boolean) =>
    SHOP_MODULES.every(({ key }) => fn({ read: !!perms[key]?.read, write: !!perms[key]?.write }));
  // Hepsi aynıysa tek çip yeter: kart kısa kalır.
  if (every((p) => p.read && p.write)) {
    return <span className="badge bg-emerald-100 text-emerald-800">Tam yetki · bütün alanlarda okur, yazar</span>;
  }
  if (every((p) => p.read && !p.write)) {
    return <span className="badge bg-sky-100 text-sky-800">Bütün alanları görür · değiştiremez</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1" aria-label="İzinler">
      {granted.map(({ key, label, hint }) => {
        const lv = levelOf(perms[key]);
        return (
          <li key={key} className={`badge whitespace-normal ${lv.cls}`} title={`${label}: ${lv.text} — ${hint}`}>
            {label}
            <span className="font-normal opacity-75">· {lv.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── İzin tablosu ────────────────────────────────────────────────────────

function PermissionMatrix({
  value,
  onChange,
  grantable,
  disabled,
}: {
  value: ShopPermissions;
  onChange: (p: ShopPermissions) => void;
  grantable: ShopPermissions;
  disabled?: boolean;
}) {
  const set = (m: ShopModule, level: 'read' | 'write', on: boolean) =>
    onChange({ ...value, [m]: { ...value[m], [level]: on } });

  // Hazır küme, verebileceklerimle sınırlanır.
  const limit = (preset: ShopPermissions) =>
    Object.fromEntries(
      SHOP_MODULES.map(({ key }) => [
        key,
        { read: preset[key].read && grantable[key].read, write: preset[key].write && grantable[key].write },
      ]),
    ) as ShopPermissions;

  // Sütunun tamamı: açarken yalnız verebildiklerim, kapatırken hepsi.
  const columnFull = (level: 'read' | 'write') =>
    SHOP_MODULES.every(({ key }) => !!value[key]?.[level] || !grantable[key][level]);
  const setColumn = (level: 'read' | 'write', on: boolean) =>
    onChange(
      Object.fromEntries(
        SHOP_MODULES.map(({ key }) => [
          key,
          { ...value[key], [level]: on ? grantable[key][level] || !!value[key]?.[level] : false },
        ]),
      ) as ShopPermissions,
    );

  const levels = [
    { level: 'read' as const, title: 'Okuma', icon: '👁' },
    { level: 'write' as const, title: 'Yazma', icon: '✎' },
  ];

  return (
    <div className="space-y-2">
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-slate-500">Hazır:</span>
          {PERMISSION_PRESETS.map((p) => {
            const preset = limit(p.build());
            const on = samePerms(value, preset);
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={on}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  on
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100'
                }`}
                onClick={() => onChange(preset)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-[4.25rem] sm:w-28" />
            <col className="w-[4.25rem] sm:w-28" />
          </colgroup>
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Alan
              </th>
              {levels.map(({ level, title, icon }) => {
                const full = columnFull(level);
                return (
                  <th key={level} scope="col" className="px-1 py-2 text-center font-medium">
                    <span className="block">
                      <span aria-hidden>{icon}</span> {title}
                    </span>
                    {!disabled && (
                      <button
                        type="button"
                        className="mt-0.5 text-[11px] font-medium text-blue-600 hover:underline"
                        title={full ? `${title} izinlerinin hepsini kaldır` : `Verebildiğiniz bütün ${title.toLocaleLowerCase('tr')} izinlerini ver`}
                        onClick={() => setColumn(level, !full)}
                      >
                        {full ? 'hiçbiri' : 'tümü'}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {SHOP_MODULES.map(({ key, label, hint }) => {
              const any = !!value[key]?.read || !!value[key]?.write;
              return (
                <tr key={key} className={any ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="block font-medium text-slate-800">{label}</span>
                    <span className="block text-xs text-slate-500">{hint}</span>
                  </th>
                  {levels.map(({ level }) => {
                    const locked = disabled || (!grantable[key][level] && !value[key]?.[level]);
                    return (
                      <td key={level} className="p-0 text-center align-middle">
                        <label
                          className={`flex min-h-[48px] items-center justify-center ${
                            locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-slate-100'
                          }`}
                          title={locked && !disabled ? 'Sizde olmayan bir izni veremezsiniz.' : undefined}
                        >
                          <input
                            type="checkbox"
                            aria-label={`${label} ${level === 'read' ? 'okuma' : 'yazma'}`}
                            checked={!!value[key]?.[level]}
                            disabled={locked}
                            onChange={(e) => set(key, level, e.target.checked)}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Okuma ve yazma ayrıdır: yalnız yazma izni olan kayıt ekler ama listeyi göremez. Formlarda seçilen depo,
        banka hesabı, makine gibi kısa listeler dükkânın her üyesine açıktır.
      </p>
    </div>
  );
}

// ── Üye kartı ───────────────────────────────────────────────────────────

function MemberCard({
  shopId,
  member,
  grantable,
  onChanged,
}: {
  shopId: string;
  member: ShopMemberView;
  grantable: ShopPermissions;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [perms, setPerms] = useState(member.permissions);
  const [isAdmin, setIsAdmin] = useState(member.isAdmin);
  const [account, setAccount] = useState({ fullName: member.fullName, phone: member.phone ?? '', password: '' });

  useEffect(() => {
    setPerms(member.permissions);
    setIsAdmin(member.isAdmin);
  }, [member]);

  const saveMut = useMutation({
    mutationFn: () => updateMember(shopId, member.id, { isAdmin, permissions: perms }),
    onSuccess: onChanged,
  });
  const accountMut = useMutation({
    mutationFn: (input: { fullName?: string; phone?: string; password?: string; isActive?: boolean }) =>
      updateMemberAccount(shopId, member.id, input),
    onSuccess: async () => {
      setAccount((a) => ({ ...a, password: '' }));
      await onChanged();
    },
  });
  const removeMut = useMutation({ mutationFn: () => removeMember(shopId, member.id), onSuccess: onChanged });

  const dirty = isAdmin !== member.isAdmin || !samePerms(perms, member.permissions);

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Dükkândan çıkarılsın mı?',
      message: `${member.fullName} bu dükkândan çıkarılsın mı? Hesabı silinmez.`,
      confirmText: 'Çıkar',
      danger: true,
    });
    if (ok) removeMut.mutate();
  };

  return (
    <div className={`card transition ${open ? 'ring-2 ring-blue-500/20' : ''}`}>
      <div className="flex items-start gap-3">
        <Avatar name={member.fullName} muted={!member.isActive} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="flex flex-wrap items-center gap-1.5 font-semibold">
                <span className="break-words">{member.fullName}</span>
                {member.isAdmin && <span className="badge bg-indigo-100 text-indigo-700">🛡️ Yönetici</span>}
                {!member.isActive && <span className="badge bg-slate-200 text-slate-600">Pasif</span>}
              </h3>
              <p className="break-words text-sm text-slate-500">
                {member.email}
                {member.phone ? ` · ${member.phone}` : ''}
              </p>
              {member.otherShops > 0 && (
                <p className="text-xs text-slate-400">{member.otherShops} başka dükkânda da çalışıyor</p>
              )}
            </div>
            {member.editable ? (
              <button className="btn-secondary btn-sm shrink-0" aria-expanded={open} onClick={() => setOpen(!open)}>
                {open ? 'Kapat' : 'Düzenle'}
              </button>
            ) : (
              <span
                className="badge shrink-0 bg-slate-100 text-slate-500"
                title="Kendi üyeliğinizi ya da sizden yetkili birini düzenleyemezsiniz."
              >
                🔒 düzenlenemez
              </span>
            )}
          </div>
          <div className="mt-2">
            <PermissionSummary perms={member.permissions} />
          </div>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <AdminToggle checked={isAdmin} onChange={setIsAdmin} />
          <PermissionMatrix value={perms} onChange={setPerms} grantable={grantable} />
          {saveMut.isError && <p className="text-sm text-red-600">{errText(saveMut.error)}</p>}
          {saveMut.isSuccess && !dirty && (
            <p className="text-sm text-emerald-600">Kaydedildi; bir sonraki işleminde geçerli.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              İzinleri kaydet
            </button>
            {dirty && <span className="badge bg-amber-100 text-amber-800">Kaydedilmemiş değişiklik var</span>}
            <button className="btn-danger-soft sm:ml-auto" disabled={removeMut.isPending} onClick={() => void remove()}>
              Dükkândan çıkar
            </button>
          </div>
          {removeMut.isError && <p className="text-sm text-red-600">{errText(removeMut.error)}</p>}

          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <span aria-hidden>👤</span> Hesap
            </h4>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block min-w-0">
                <span className="label">Ad Soyad</span>
                <input
                  className="input"
                  value={account.fullName}
                  onChange={(e) => setAccount({ ...account, fullName: e.target.value })}
                  placeholder="Ad Soyad"
                />
              </label>
              <label className="block min-w-0">
                <span className="label">Telefon</span>
                <input
                  className="input"
                  inputMode="tel"
                  value={account.phone}
                  onChange={(e) => setAccount({ ...account, phone: e.target.value })}
                  placeholder="Telefon"
                />
              </label>
              <label className="block min-w-0">
                <span className="label">Yeni parola</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={account.password}
                  onChange={(e) => setAccount({ ...account, password: e.target.value })}
                  placeholder="Yeni parola (boş = değişmez)"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary btn-sm"
                disabled={accountMut.isPending}
                onClick={() =>
                  accountMut.mutate({
                    fullName: account.fullName,
                    phone: account.phone,
                    ...(account.password ? { password: account.password } : {}),
                  })
                }
              >
                Hesabı kaydet
              </button>
              <button
                className={member.isActive ? 'btn-danger-soft btn-sm' : 'btn-secondary btn-sm'}
                disabled={accountMut.isPending}
                onClick={() => accountMut.mutate({ isActive: !member.isActive })}
              >
                {member.isActive ? 'Girişini kapat' : 'Girişini aç'}
              </button>
            </div>
            {accountMut.isError && <p className="text-sm text-red-600">{errText(accountMut.error)}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kişi ekleme ─────────────────────────────────────────────────────────

function AddMemberForm({
  shopId,
  shopName,
  grantable,
  onDone,
}: {
  shopId: string;
  shopName?: string;
  grantable: ShopPermissions;
  onDone: () => Promise<void>;
}) {
  const { isOwner } = useAuth();
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [newUser, setNewUser] = useState({ fullName: '', email: '', password: '', phone: '' });
  const [isAdmin, setIsAdmin] = useState(false);
  const [perms, setPerms] = useState<ShopPermissions>(emptyPermissions());
  const { data: users } = useQuery({
    queryKey: ['employees'],
    queryFn: fetchEmployees,
    enabled: isOwner && mode === 'existing',
  });

  const mut = useMutation({
    mutationFn: () =>
      addMember(shopId, {
        isAdmin,
        permissions: perms,
        ...(mode === 'new'
          ? { newUser: { ...newUser, phone: newUser.phone || undefined } }
          : isOwner && userId
            ? { userId }
            : { email: email.trim() }),
      }),
    onSuccess: onDone,
  });

  const ready =
    mode === 'new'
      ? newUser.fullName.trim().length >= 2 && newUser.email.includes('@') && newUser.password.length >= 6
      : isOwner
        ? !!userId || email.includes('@')
        : email.includes('@');

  const req = <span className="text-red-500">*</span>;

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Yeni kişi{shopName ? ` — ${shopName}` : ''}</h3>
        <div role="group" aria-label="Hesap türü" className="inline-flex rounded-xl bg-slate-100 p-1">
          {(
            [
              ['new', 'Yeni hesap'],
              ['existing', 'Var olan kullanıcı'],
            ] as const
          ).map(([m, text]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-[36px] rounded-lg px-3 text-sm font-medium transition ${
                mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {mode === 'new' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="label">Ad Soyad {req}</span>
            <input
              className="input"
              autoFocus
              placeholder="Ad Soyad"
              value={newUser.fullName}
              onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
            />
          </label>
          <label className="block min-w-0">
            <span className="label">E-posta {req}</span>
            <input
              className="input"
              placeholder="E-posta (giriş)"
              type="email"
              autoComplete="off"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            />
          </label>
          <label className="block min-w-0">
            <span className="label">Parola {req}</span>
            <input
              className="input"
              placeholder="Parola (en az 6)"
              type="password"
              autoComplete="new-password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            />
          </label>
          <label className="block min-w-0">
            <span className="label">Telefon</span>
            <input
              className="input"
              inputMode="tel"
              placeholder="Telefon (isteğe bağlı)"
              value={newUser.phone}
              onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
            />
          </label>
        </div>
      ) : isOwner ? (
        <label className="block">
          <span className="label">Kullanıcı {req}</span>
          <select className="input" autoFocus value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">— Kullanıcı seçin —</option>
            {users
              ?.filter((u) => u.role !== 'owner')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} · {u.email}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <label className="block">
          <span className="label">Giriş e-postası {req}</span>
          <input
            className="input"
            type="email"
            autoFocus
            placeholder="Kullanıcının giriş e-postası"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      )}

      <AdminToggle checked={isAdmin} onChange={setIsAdmin} />
      <PermissionMatrix value={perms} onChange={setPerms} grantable={grantable} />
      {mut.isError && <p className="text-sm text-red-600">{errText(mut.error)}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={!ready || mut.isPending} onClick={() => mut.mutate()}>
          Ekle
        </button>
        <button className="btn-secondary" onClick={() => void onDone()}>
          İptal
        </button>
        {!ready && (
          <span className="text-xs text-slate-500">
            {mode === 'new'
              ? 'Ad soyad, geçerli bir e-posta ve en az 6 karakterli parola gerekli.'
              : 'Bir kullanıcı seçin ya da giriş e-postasını yazın.'}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Hesaplar (yalnız sistem sahibi) ─────────────────────────────────────

/** Bütün kullanıcı hesapları: sistem sahibi yapma, silme. */
function AccountsSection() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: ['employees'], queryFn: fetchEmployees });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['employees'] });
    void qc.invalidateQueries({ queryKey: ['shop-members'] });
    void qc.invalidateQueries({ queryKey: ['managed-shops'] });
  };
  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'owner' | 'employee' }) => updateEmployee(id, { role }),
    onSuccess: invalidate,
  });
  const delMut = useMutation({ mutationFn: deleteEmployee, onSuccess: invalidate });

  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span aria-hidden>🔑</span> Bütün hesaplar ({data?.length ?? 0})
        </span>
        <span className="text-slate-400 transition group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <p className="mt-2 text-sm text-slate-500">
        Sistem sahibi her dükkâna tam yetkiyle girer, dükkân açar ve herkesin iznini düzenler. Diğer kullanıcılar
        yalnız üye oldukları dükkânlarda, verilen izinlerle çalışır.
      </p>
      {(roleMut.isError || delMut.isError) && (
        <p className="mt-2 text-sm text-red-600">{errText(roleMut.error ?? delMut.error)}</p>
      )}
      <div className="mt-2 divide-y divide-slate-100">
        {data?.map((u) => (
          <div key={u.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={u.fullName} muted={!u.isActive} small />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{u.fullName}</span>
                  {u.id === user?.id && <span className="badge bg-blue-100 text-blue-700">Siz</span>}
                  {!u.isActive && <span className="badge bg-slate-200 text-slate-600">pasif</span>}
                </div>
                <div className="break-words text-xs text-slate-500">{u.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:shrink-0">
              <select
                className="input min-w-0 flex-1 sm:w-44 sm:flex-none"
                aria-label={`${u.fullName} rolü`}
                value={u.role}
                disabled={u.id === user?.id}
                onChange={async (e) => {
                  const role = e.target.value as 'owner' | 'employee';
                  const ok = await confirmDialog(
                    role === 'owner'
                      ? {
                          title: 'Sistem sahibi yapılsın mı?',
                          message: `${u.fullName} sistem sahibi yapılsın mı? Her dükkânda her şeye erişecek.`,
                          confirmText: 'Sistem sahibi yap',
                          danger: true,
                        }
                      : {
                          message: `${u.fullName} sıradan kullanıcı yapılsın mı? Yalnız üye olduğu dükkânlara girebilecek.`,
                          confirmText: 'Kullanıcı yap',
                        },
                  );
                  if (ok) roleMut.mutate({ id: u.id, role });
                }}
              >
                <option value="employee">Kullanıcı</option>
                <option value="owner">Sistem sahibi</option>
              </select>
              {u.id !== user?.id && (
                <button
                  className="btn-danger-soft btn-sm shrink-0"
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: 'Hesap silinsin mi?',
                      message: `"${u.fullName}" hesabı silinsin mi? Bütün dükkânlardan çıkar.`,
                      confirmText: 'Sil',
                      danger: true,
                    });
                    if (ok) delMut.mutate(u.id);
                  }}
                >
                  Sil
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
