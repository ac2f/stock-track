import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createEmployee,
  deleteEmployee,
  fetchEmployees,
  updateEmployee,
  type EmployeeInput,
} from '../../api/users.api';
import type { UserRole } from '../../types';

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'İşletme Sahibi',
  employee: 'Çalışan',
};

const EMPTY: EmployeeInput = {
  fullName: '',
  email: '',
  role: 'employee',
  isActive: true,
};

/** Çalışan (personel) yönetimi — yalnızca İşletme Sahibi. */
export function EmployeesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<EmployeeInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: fetchEmployees,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['employees'] });

  const createMut = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<EmployeeInput> }) =>
      updateEmployee(id, input),
    onSuccess: () => {
      invalidate();
      setForm(null);
      setEditingId(null);
    },
  });
  const deleteMut = useMutation({ mutationFn: deleteEmployee, onSuccess: invalidate });

  const error = createMut.error ?? updateMut.error;

  const submit = () => {
    if (!form) return;
    if (editingId) {
      // Düzenlemede boş parola gönderme.
      const { password, ...rest } = form;
      updateMut.mutate({ id: editingId, input: password ? form : rest });
    } else {
      createMut.mutate(form);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Çalışanlar</h1>
        {!form && (
          <button
            className="btn-primary"
            onClick={() => {
              setEditingId(null);
              setForm(EMPTY);
            }}
          >
            + Yeni Çalışan
          </button>
        )}
      </div>

      {error && (
        <p className="card text-sm text-red-600">
          {(error as { response?: { data?: { message?: string } } })?.response
            ?.data?.message ?? 'İşlem başarısız.'}
        </p>
      )}

      {form && (
        <div className="card space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Ad Soyad</span>
            <input
              className="input"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">E-posta (giriş)</span>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Telefon</span>
            <input
              className="input"
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value || undefined })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">
              {editingId ? 'Yeni parola (boş = değişmez)' : 'Parola'}
            </span>
            <input
              className="input"
              type="password"
              value={form.password ?? ''}
              onChange={(e) => setForm({ ...form, password: e.target.value || undefined })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Rol</span>
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <option value="employee">Çalışan</option>
              <option value="owner">İşletme Sahibi</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive ?? true}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Aktif (pasif çalışan giriş yapamaz)
          </label>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={!form.fullName || !form.email} onClick={submit}>
              Kaydet
            </button>
            <button
              className="btn"
              onClick={() => {
                setForm(null);
                setEditingId(null);
              }}
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-slate-400">Yükleniyor…</p>
      ) : (
        <div className="space-y-2">
          {data?.map((e) => (
            <div key={e.id} className="card flex items-center justify-between">
              <div>
                <h3 className="font-medium">
                  {e.fullName}{' '}
                  {!e.isActive && (
                    <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      Pasif
                    </span>
                  )}
                </h3>
                <p className="text-sm text-slate-500">
                  {ROLE_LABELS[e.role]} · {e.email}
                  {e.phone ? ` · ${e.phone}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn"
                  onClick={() => {
                    setEditingId(e.id);
                    setForm({
                      fullName: e.fullName,
                      email: e.email,
                      phone: e.phone,
                      role: e.role,
                      isActive: e.isActive,
                    });
                  }}
                >
                  Düzenle
                </button>
                <button
                  className="btn text-red-600"
                  onClick={() => {
                    if (confirm(`"${e.fullName}" silinsin mi?`)) deleteMut.mutate(e.id);
                  }}
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
          {!data?.length && <p className="text-slate-400">Çalışan yok.</p>}
        </div>
      )}
    </div>
  );
}
