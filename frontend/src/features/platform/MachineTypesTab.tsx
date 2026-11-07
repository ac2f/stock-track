import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addMachineTypeSize,
  createMachineType,
  deleteMachineType,
  deleteMachineTypeSize,
  fetchLabelsAdmin,
  fetchMachineTypesAdmin,
  updateMachineType,
  type MachineTypeNode,
} from '../../api/platform.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { sizeLabel } from '../../components/network/MachineTypeSelect';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock, Spinner } from '../../components/ui/Loading';
import { apiErrorMessage, toast } from '../../lib/toast';

/**
 * Makine türleri: ağaç (üst tür › alt tür) ve her türün standart çalışma
 * alanı ebatları. İşletmeler makinelerini bunlara bağlar; rehber "şu türden,
 * en az şu ebatta makinesi olan işletme"yi bulur. Üst tür seçen alt türleri de bulur.
 */
export function MachineTypesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['platform', 'machine-types'], queryFn: fetchMachineTypesAdmin });
  const labels = useQuery({ queryKey: ['platform', 'labels'], queryFn: fetchLabelsAdmin });
  const [name, setName] = useState('');
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['platform', 'machine-types'] });
    qc.invalidateQueries({ queryKey: ['machine-type-tree'] });
    qc.invalidateQueries({ queryKey: ['directory'] });
  };
  const add = useMutation({
    mutationFn: () => createMachineType({ name: name.trim() }),
    onSuccess: () => {
      setName('');
      toast.success('Makine türü eklendi');
      refresh();
    },
    onError: (e) => toast.error('Eklenemedi', apiErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <form
        className="card flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length >= 2 && !add.isPending) add.mutate();
        }}
      >
        <label className="block flex-1">
          <span className="label">Yeni ana tür</span>
          <input className="input" placeholder="Örn. Lazer, CNC, Plotter, Bükme makinesi" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn-primary" disabled={name.trim().length < 2 || add.isPending}>
          {add.isPending && <Spinner />} Ana tür ekle
        </button>
      </form>

      {isLoading && <LoadingBlock rows={3} />}
      {data?.length === 0 && (
        <EmptyState icon="⚙️" title="Henüz makine türü yok" hint='Önce ana türleri ekleyin (Lazer, CNC...), sonra her birine alt tür ve ebat tanımlayın (Lazer › Fiber lazer › 1300×900).' />
      )}
      <ul className="space-y-2">
        {data?.map((t) => (
          <TypeRow key={t.id} t={t} all={data} labels={labels.data ?? []} onChanged={refresh} />
        ))}
      </ul>
    </div>
  );
}

function TypeRow({
  t,
  all,
  labels,
  onChanged,
}: {
  t: MachineTypeNode;
  all: MachineTypeNode[];
  labels: { id: string; name: string }[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState('');
  const [w, setW] = useState('');
  const [h, setH] = useState('');
  const [editName, setEditName] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: (p: Parameters<typeof updateMachineType>[1]) => updateMachineType(t.id, p),
    onSuccess: () => {
      setEditName(null);
      onChanged();
    },
    onError: (e) => toast.error('Güncellenemedi', apiErrorMessage(e)),
  });
  const addSub = useMutation({
    mutationFn: () => createMachineType({ name: sub.trim(), parentId: t.id }),
    onSuccess: () => {
      setSub('');
      onChanged();
    },
    onError: (e) => toast.error('Alt tür eklenemedi', apiErrorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => deleteMachineType(t.id),
    onSuccess: () => {
      toast.success('Makine türü silindi');
      onChanged();
    },
    onError: (e) => toast.error('Silinemedi', apiErrorMessage(e)),
  });
  const addSize = useMutation({
    mutationFn: () => addMachineTypeSize(t.id, { widthMm: Number(w), heightMm: Number(h) }),
    onSuccess: () => {
      setW('');
      setH('');
      onChanged();
    },
    onError: (e) => toast.error('Ebat eklenemedi', apiErrorMessage(e)),
  });
  const delSize = useMutation({
    mutationFn: (id: string) => deleteMachineTypeSize(id),
    onSuccess: onChanged,
    onError: (e) => toast.error('Ebat silinemedi', apiErrorMessage(e)),
  });

  // Taşınabilecek üst türler: kendisi ve altındakiler hariç.
  const descendants = new Set<string>([t.id]);
  for (let i = 0; i < 20; i++) for (const x of all) if (x.parentId && descendants.has(x.parentId)) descendants.add(x.id);
  const parents = all.filter((x) => !descendants.has(x.id));

  return (
    <li className={`card space-y-2 ${t.isActive ? '' : 'opacity-60'}`} style={{ marginLeft: `${Math.min(t.depth, 4) * 14}px` }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {editName !== null ? (
            <div className="flex gap-2">
              <input className="input" value={editName} maxLength={100} onChange={(e) => setEditName(e.target.value)} aria-label="Tür adı" />
              <button className="btn-primary btn-sm" disabled={patch.isPending || editName.trim().length < 2} onClick={() => patch.mutate({ name: editName.trim() })}>
                Kaydet
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setEditName(null)}>
                Vazgeç
              </button>
            </div>
          ) : (
            <p className="font-medium">
              {t.depth > 0 && <span className="text-slate-400">↳ </span>}
              {t.name} {!t.isActive && <span className="badge bg-slate-200 text-slate-700">Pasif</span>}
            </p>
          )}
          <p className="text-xs text-slate-500">
            {t.path} · {t.sizes.length} ebat · {t.machineCount ?? 0} işletme makinesi
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Kapat' : 'Ebat / alt tür'}
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setEditName(t.name)}>
            Adı
          </button>
          <button className="btn-secondary btn-sm" disabled={patch.isPending} onClick={() => patch.mutate({ isActive: !t.isActive })}>
            {t.isActive ? 'Pasife al' : 'Etkinleştir'}
          </button>
          <button
            className="btn-danger-soft btn-sm"
            disabled={del.isPending}
            onClick={async () => {
              if (await confirmDialog({ title: 'Makine türü silinsin mi?', message: `"${t.name}" ve ebatları silinecek; bu türe bağlı işletme makineleri tür bilgisini kaybeder (rehberden kalkar).`, confirmText: 'Sil', danger: true })) del.mutate();
            }}
          >
            Sil
          </button>
        </div>
      </div>

      {t.sizes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {t.sizes.map((s) => (
            <span key={s.id} className="badge bg-sky-50 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100">
              {sizeLabel(s.widthMm, s.heightMm)}
              <button
                className="ml-1 rounded px-1 text-sky-700 hover:bg-sky-100 dark:text-sky-200"
                aria-label={`${sizeLabel(s.widthMm, s.heightMm)} ebadını sil`}
                disabled={delSize.isPending}
                onClick={() => delSize.mutate(s.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 lg:grid-cols-2">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (Number(w) > 0 && Number(h) > 0 && !addSize.isPending) addSize.mutate();
            }}
          >
            <p className="label">Standart ebat ekle (çalışma alanı, mm)</p>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input !w-28" type="number" inputMode="numeric" min={1} placeholder="en" value={w} onChange={(e) => setW(e.target.value)} aria-label="En (mm)" />
              <span>×</span>
              <input className="input !w-28" type="number" inputMode="numeric" min={1} placeholder="boy" value={h} onChange={(e) => setH(e.target.value)} aria-label="Boy (mm)" />
              <button className="btn-primary btn-sm" disabled={!(Number(w) > 0 && Number(h) > 0) || addSize.isPending}>
                Ekle
              </button>
            </div>
          </form>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (sub.trim().length >= 2 && !addSub.isPending) addSub.mutate();
            }}
          >
            <p className="label">Alt tür ekle</p>
            <div className="flex gap-2">
              <input className="input" placeholder={`Örn. ${t.name} › …`} value={sub} maxLength={100} onChange={(e) => setSub(e.target.value)} />
              <button className="btn-primary btn-sm" disabled={sub.trim().length < 2 || addSub.isPending}>
                Ekle
              </button>
            </div>
          </form>
          <label className="block">
            <span className="label">Üst tür</span>
            <select className="input" value={t.parentId ?? ''} onChange={(e) => patch.mutate({ parentId: e.target.value || null })}>
              <option value="">(Ana tür)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.path}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">İş kolu (gruplama için, ops.)</span>
            <select className="input" value={t.labelId ?? ''} onChange={(e) => patch.mutate({ labelId: e.target.value || null })}>
              <option value="">—</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </li>
  );
}
