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
import { useAuth } from '../../context/AuthContext';
import { PERMISSION_PRESETS, SHOP_MODULES, emptyPermissions } from '../../lib/shop';
import type { ShopModule, ShopPermissions } from '../../types';

const errText = (e: unknown) =>
  ((e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message as string) ??
  'İşlem başarısız.';

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

  useEffect(() => {
    if (!selected && shops?.length) setSelected(shops[0].id);
  }, [shops, selected]);

  const current = shops?.find((s) => s.id === selected) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Ekip ve yetkiler</h1>
          <p className="text-sm text-slate-500">
            Her dükkânın deposu, müşterileri, teklifleri ve ödemeleri ayrıdır. Kimin hangi dükkânda neyi
            görüp (okuma) neyi değiştirebileceğini (yazma) buradan ayarlayın.
          </p>
        </div>
        {isOwner && !creating && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + Yeni dükkân
          </button>
        )}
      </div>

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

      {isLoading && <p className="text-slate-400">Yükleniyor…</p>}

      <div className="flex flex-wrap gap-2">
        {shops?.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s.id)}
            className={`rounded-xl border px-3 py-2 text-left text-sm ${
              s.id === selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="font-medium">
              🏪 {s.name} {!s.isActive && <span className="text-xs opacity-70">(kapalı)</span>}
            </div>
            <div className="text-xs opacity-70">{s.memberCount} kişi</div>
          </button>
        ))}
      </div>

      {current && <ShopPanel key={current.id} shop={current} />}

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
    <div className="card space-y-3">
      <h2 className="font-semibold">Yeni dükkân</h2>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">Dükkân adı</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Merkez, Şube 2" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">Hazır bilgileri şu dükkândan al</span>
        <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">— Sıfırdan başla —</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {from && (
        <div className="space-y-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={copyCatalog} onChange={(e) => setCopyCatalog(e.target.checked)} />
            Malzeme kataloğu, tarifeler, makineler ve gider türleri
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={copySettings} onChange={(e) => setCopySettings(e.target.checked)} />
            Ayarlar (fiyatlar, kesim fiyatlandırması, işletme bilgileri — ad hariç)
          </label>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Stok, müşteri, teklif ve ödemeler kopyalanmaz: yeni dükkân bunlarla boş başlar. Corel eklentisi için
        dükkânın Ayarlar sayfasından ayrı bir anahtar üretilir.
      </p>
      {mut.isError && <p className="text-sm text-red-600">{errText(mut.error)}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={name.trim().length < 2 || mut.isPending} onClick={() => mut.mutate()}>
          Dükkânı aç
        </button>
        <button className="btn" onClick={() => onDone()}>
          İptal
        </button>
      </div>
    </div>
  );
}

// ── Dükkân paneli ───────────────────────────────────────────────────────

function ShopPanel({ shop }: { shop: ManagedShop }) {
  const { isOwner, shops: myShops, refreshMe } = useAuth();
  const qc = useQueryClient();
  const { data: members, isLoading, error } = useQuery({
    queryKey: ['shop-members', shop.id],
    queryFn: () => fetchMembers(shop.id),
  });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(shop.name);

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

  return (
    <div className="space-y-3">
      {isOwner && (
        <div className="card flex flex-wrap items-end gap-2">
          <label className="block flex-1 text-sm">
            <span className="mb-1 block text-xs text-slate-500">Dükkân adı</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button
            className="btn"
            disabled={name.trim() === shop.name || name.trim().length < 2}
            onClick={() => shopMut.mutate({ name: name.trim() })}
          >
            Adı kaydet
          </button>
          <button
            className={`btn ${shop.isActive ? 'text-red-600' : 'text-emerald-700'}`}
            onClick={() => {
              const msg = shop.isActive
                ? `"${shop.name}" kapatılsın mı? Çalışanları giremez; veriler silinmez, yeniden açılabilir.`
                : `"${shop.name}" yeniden açılsın mı?`;
              if (confirm(msg)) shopMut.mutate({ isActive: !shop.isActive });
            }}
          >
            {shop.isActive ? 'Dükkânı kapat' : 'Dükkânı aç'}
          </button>
          {shopMut.isError && <p className="w-full text-sm text-red-600">{errText(shopMut.error)}</p>}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          {shop.name} ekibi {isOwner && <span className="text-xs font-normal text-slate-500">· sistem sahipleri her dükkâna tam yetkiyle girer</span>}
        </h2>
        {!adding && (
          <button className="btn-primary" onClick={() => setAdding(true)}>
            + Kişi ekle
          </button>
        )}
      </div>

      {adding && (
        <AddMemberForm
          shopId={shop.id}
          grantable={myPerms}
          onDone={async () => {
            setAdding(false);
            await refresh();
          }}
        />
      )}

      {error && <p className="card text-sm text-red-600">{errText(error)}</p>}
      {isLoading && <p className="text-slate-400">Yükleniyor…</p>}
      {members?.length === 0 && <p className="text-sm text-slate-400">Bu dükkânda henüz kimse yok.</p>}
      <div className="space-y-2">
        {members?.map((m) => (
          <MemberCard key={m.id} shopId={shop.id} member={m} grantable={myPerms} onChanged={refresh} />
        ))}
      </div>
    </div>
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

  return (
    <div className="space-y-2">
      {!disabled && (
        <div className="flex flex-wrap gap-1">
          {PERMISSION_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn px-2 py-1 text-xs"
              onClick={() => {
                // Hazır küme, verebileceklerimle sınırlanır.
                const preset = p.build();
                const limited = Object.fromEntries(
                  SHOP_MODULES.map(({ key }) => [
                    key,
                    { read: preset[key].read && grantable[key].read, write: preset[key].write && grantable[key].write },
                  ]),
                ) as ShopPermissions;
                onChange(limited);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-2 font-normal">Alan</th>
              <th className="px-2 py-1 text-center font-normal">Okuma</th>
              <th className="px-2 py-1 text-center font-normal">Yazma</th>
            </tr>
          </thead>
          <tbody>
            {SHOP_MODULES.map(({ key, label, hint }) => (
              <tr key={key} className="border-t border-slate-100">
                <td className="py-1 pr-2" title={hint}>
                  {label}
                </td>
                {(['read', 'write'] as const).map((level) => {
                  const locked = disabled || (!grantable[key][level] && !value[key][level]);
                  return (
                    <td key={level} className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${label} ${level === 'read' ? 'okuma' : 'yazma'}`}
                        checked={!!value[key]?.[level]}
                        disabled={locked}
                        title={locked && !disabled ? 'Sizde olmayan bir izni veremezsiniz.' : undefined}
                        onChange={(e) => set(key, level, e.target.checked)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
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

  const granted = SHOP_MODULES.filter(({ key }) => member.permissions[key].read || member.permissions[key].write);

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">
            {member.fullName}
            {member.isAdmin && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">Yönetici</span>}
            {!member.isActive && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Pasif</span>}
          </h3>
          <p className="text-sm text-slate-500">
            {member.email}
            {member.phone ? ` · ${member.phone}` : ''}
            {member.otherShops > 0 ? ` · ${member.otherShops} başka dükkânda da çalışıyor` : ''}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {granted.length === 0
              ? 'Hiçbir alana erişimi yok.'
              : granted
                  .map(({ key, label }) => {
                    const p = member.permissions[key];
                    return `${label} (${p.read && p.write ? 'okur, yazar' : p.read ? 'okur' : 'yazar'})`;
                  })
                  .join(' · ')}
          </p>
        </div>
        {member.editable ? (
          <button className="btn" onClick={() => setOpen(!open)}>
            {open ? 'Kapat' : 'Düzenle'}
          </button>
        ) : (
          <span className="text-xs text-slate-400" title="Kendi üyeliğinizi ya da sizden yetkili birini düzenleyemezsiniz.">
            düzenlenemez
          </span>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-4 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            Dükkân yöneticisi (bu dükkânın ekibini ve izinlerini düzenler)
          </label>
          <PermissionMatrix value={perms} onChange={setPerms} grantable={grantable} />
          {saveMut.isError && <p className="text-sm text-red-600">{errText(saveMut.error)}</p>}
          {saveMut.isSuccess && <p className="text-sm text-emerald-600">Kaydedildi; bir sonraki işleminde geçerli.</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              İzinleri kaydet
            </button>
            <button
              className="btn text-red-600"
              onClick={() => {
                if (confirm(`${member.fullName} bu dükkândan çıkarılsın mı? Hesabı silinmez.`)) removeMut.mutate();
              }}
            >
              Dükkândan çıkar
            </button>
          </div>
          {removeMut.isError && <p className="text-sm text-red-600">{errText(removeMut.error)}</p>}

          <div className="space-y-2 rounded-xl bg-slate-50 p-3">
            <h4 className="text-sm font-medium">Hesap</h4>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="input"
                value={account.fullName}
                onChange={(e) => setAccount({ ...account, fullName: e.target.value })}
                placeholder="Ad Soyad"
              />
              <input
                className="input"
                value={account.phone}
                onChange={(e) => setAccount({ ...account, phone: e.target.value })}
                placeholder="Telefon"
              />
              <input
                className="input"
                type="password"
                value={account.password}
                onChange={(e) => setAccount({ ...account, password: e.target.value })}
                placeholder="Yeni parola (boş = değişmez)"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn"
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
              <button className="btn" onClick={() => accountMut.mutate({ isActive: !member.isActive })}>
                {member.isActive ? 'Girişini kapat' : 'Girişini aç'}
              </button>
            </div>
            {accountMut.isError && <p className="text-sm text-red-600">{errText(accountMut.error)}</p>}
            {accountMut.isSuccess && <p className="text-sm text-emerald-600">Hesap güncellendi.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kişi ekleme ─────────────────────────────────────────────────────────

function AddMemberForm({
  shopId,
  grantable,
  onDone,
}: {
  shopId: string;
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

  return (
    <div className="card space-y-3">
      <div className="flex gap-2">
        <button className={`btn ${mode === 'new' ? 'bg-slate-900 text-white' : ''}`} onClick={() => setMode('new')}>
          Yeni hesap
        </button>
        <button className={`btn ${mode === 'existing' ? 'bg-slate-900 text-white' : ''}`} onClick={() => setMode('existing')}>
          Var olan kullanıcı
        </button>
      </div>

      {mode === 'new' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input" placeholder="Ad Soyad" value={newUser.fullName} onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })} />
          <input className="input" placeholder="E-posta (giriş)" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
          <input className="input" placeholder="Parola (en az 6)" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
          <input className="input" placeholder="Telefon (isteğe bağlı)" value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} />
        </div>
      ) : isOwner ? (
        <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">— Kullanıcı seçin —</option>
          {users
            ?.filter((u) => u.role !== 'owner')
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} · {u.email}
              </option>
            ))}
        </select>
      ) : (
        <input
          className="input"
          type="email"
          placeholder="Kullanıcının giriş e-postası"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
        Dükkân yöneticisi
      </label>
      <PermissionMatrix value={perms} onChange={setPerms} grantable={grantable} />
      {mut.isError && <p className="text-sm text-red-600">{errText(mut.error)}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={!ready || mut.isPending} onClick={() => mut.mutate()}>
          Ekle
        </button>
        <button className="btn" onClick={() => void onDone()}>
          İptal
        </button>
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
    <details className="card">
      <summary className="cursor-pointer font-semibold">Bütün hesaplar ({data?.length ?? 0})</summary>
      <p className="mt-2 text-sm text-slate-500">
        Sistem sahibi her dükkâna tam yetkiyle girer, dükkân açar ve herkesin iznini düzenler. Diğer kullanıcılar
        yalnız üye oldukları dükkânlarda, verilen izinlerle çalışır.
      </p>
      {(roleMut.isError || delMut.isError) && (
        <p className="text-sm text-red-600">{errText(roleMut.error ?? delMut.error)}</p>
      )}
      <div className="mt-2 divide-y divide-slate-100">
        {data?.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div>
              <span className="font-medium">{u.fullName}</span>{' '}
              <span className="text-slate-500">· {u.email}</span>
              {!u.isActive && <span className="ml-2 text-xs text-slate-400">(pasif)</span>}
            </div>
            <div className="flex gap-2">
              <select
                className="input py-1 text-sm"
                value={u.role}
                disabled={u.id === user?.id}
                onChange={(e) => {
                  const role = e.target.value as 'owner' | 'employee';
                  const msg =
                    role === 'owner'
                      ? `${u.fullName} sistem sahibi yapılsın mı? Her dükkânda her şeye erişecek.`
                      : `${u.fullName} sıradan kullanıcı yapılsın mı? Yalnız üye olduğu dükkânlara girebilecek.`;
                  if (confirm(msg)) roleMut.mutate({ id: u.id, role });
                }}
              >
                <option value="employee">Kullanıcı</option>
                <option value="owner">Sistem sahibi</option>
              </select>
              {u.id !== user?.id && (
                <button
                  className="btn text-red-600"
                  onClick={() => {
                    if (confirm(`"${u.fullName}" hesabı silinsin mi? Bütün dükkânlardan çıkar.`)) delMut.mutate(u.id);
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
