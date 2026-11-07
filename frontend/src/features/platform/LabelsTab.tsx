import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLabel, deleteLabel, fetchLabelsAdmin, updateLabel, type BusinessLabel } from '../../api/platform.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock, Spinner } from '../../components/ui/Loading';
import { apiErrorMessage, toast } from '../../lib/toast';

/** İş kolu etiketleri: işletmeler kayıtta ve profilde bunlardan seçer; rehber etikete göre süzer. */
export function LabelsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['platform', 'labels'], queryFn: fetchLabelsAdmin });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['platform', 'labels'] });
    qc.invalidateQueries({ queryKey: ['registration-options'] });
    qc.invalidateQueries({ queryKey: ['directory'] });
  };
  const add = useMutation({
    mutationFn: () => createLabel({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: () => {
      setName('');
      setDescription('');
      toast.success('Etiket eklendi');
      refresh();
    },
    onError: (e) => toast.error('Eklenemedi', apiErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <form
        className="card grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.5fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length >= 2 && !add.isPending) add.mutate();
        }}
      >
        <label className="block">
          <span className="label">Yeni etiket</span>
          <input className="input" placeholder="Örn. Lazer Kesim" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Açıklama (ops.)</span>
          <input className="input" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="flex items-end">
          <button className="btn-primary w-full" disabled={name.trim().length < 2 || add.isPending}>
            {add.isPending && <Spinner />} Ekle
          </button>
        </div>
      </form>

      {isLoading && <LoadingBlock rows={3} />}
      {data?.length === 0 && <EmptyState icon="🏷️" title="Henüz etiket yok" hint="Kayıt olan işletmeler bu etiketlerden seçer; en az bir etiket tanımlayın." />}
      <ul className="space-y-2">
        {data?.map((l) => (
          <LabelRow key={l.id} l={l} onChanged={refresh} />
        ))}
      </ul>
    </div>
  );
}

function LabelRow({ l, onChanged }: { l: BusinessLabel; onChanged: () => void }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(l.name);
  const [desc, setDesc] = useState(l.description);
  const save = useMutation({
    mutationFn: (p: Parameters<typeof updateLabel>[1]) => updateLabel(l.id, p),
    onSuccess: () => {
      setEdit(false);
      onChanged();
    },
    onError: (e) => toast.error('Güncellenemedi', apiErrorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => deleteLabel(l.id),
    onSuccess: () => {
      toast.success('Etiket silindi');
      onChanged();
    },
    onError: (e) => toast.error('Silinemedi', apiErrorMessage(e)),
  });
  return (
    <li className={`card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${l.isActive ? '' : 'opacity-60'}`}>
      {edit ? (
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
          <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Etiket adı" />
          <input className="input" value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} aria-label="Açıklama" />
        </div>
      ) : (
        <div className="min-w-0">
          <p className="font-medium">
            {l.name} {!l.isActive && <span className="badge bg-slate-200 text-slate-700">Pasif</span>}
          </p>
          <p className="text-xs text-slate-500">
            {l.description || 'Açıklama yok'} · {l.shopCount ?? 0} işletme seçmiş
          </p>
        </div>
      )}
      <div className="flex shrink-0 flex-wrap gap-2">
        {edit ? (
          <>
            <button className="btn-primary btn-sm" disabled={save.isPending || name.trim().length < 2} onClick={() => save.mutate({ name: name.trim(), description: desc.trim() })}>
              Kaydet
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setEdit(false)}>
              Vazgeç
            </button>
          </>
        ) : (
          <>
            <button className="btn-secondary btn-sm" onClick={() => setEdit(true)}>
              Düzenle
            </button>
            <button className="btn-secondary btn-sm" disabled={save.isPending} onClick={() => save.mutate({ isActive: !l.isActive })}>
              {l.isActive ? 'Pasife al' : 'Etkinleştir'}
            </button>
            <button
              className="btn-danger-soft btn-sm"
              disabled={del.isPending}
              onClick={async () => {
                if (await confirmDialog({ title: 'Etiket silinsin mi?', message: `"${l.name}" silinecek; ${l.shopCount ?? 0} işletmedeki seçimi de kalkar. Geçici kapatmak için "Pasife al"ı kullanın.`, confirmText: 'Sil', danger: true })) del.mutate();
              }}
            >
              Sil
            </button>
          </>
        )}
      </div>
    </li>
  );
}
