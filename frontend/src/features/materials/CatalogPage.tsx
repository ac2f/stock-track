import { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { useMaterialCategories } from '../../hooks/useReferenceData';
import { CategoriesPanel } from './CategoriesPanel';
import { MaterialTemplatesPage } from './MaterialTemplatesPage';

/**
 * Katalog: malzeme türleri (üst kategoriler) ve ürün türleri TEK pencerede.
 * Solda malzeme türleri (ekle / düzenle / sil / süz), sağda seçili türün ürün türleri.
 * Telefonda tür paneli, seçili türü başlığında gösteren açılır bir şeritte durur.
 */
export function CatalogPage() {
  const [categoryId, setCategoryId] = useState('');
  const [open, setOpen] = useState(false);
  const { data: categories } = useMaterialCategories();
  const selected = categories?.find((c) => c.id === categoryId);

  return (
    <div className="space-y-3">
      <PageHeader
        icon="🗂️"
        title="Katalog"
        subtitle="Malzeme türleri (Pleksi, Dekota…) ana gruplardır; ürün türleri (marka, renk, ebat, kalınlık) bu türlere bağlanır. Stok kalemleri ürün türlerinden oluşturulur ve özelliklerini miras alır."
      />

      {/* Telefon: tür seçici açılır şerit */}
      <div className="lg:hidden">
        <button
          type="button"
          className="card flex w-full items-center justify-between !px-3 !py-2 text-sm"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span>
            <span className="text-slate-500">Malzeme türü: </span>
            <b>{selected?.name ?? 'Tümü'}</b>
          </span>
          <span className="text-xs text-slate-400">{open ? '▲ Kapat' : '▼ Değiştir / düzenle'}</span>
        </button>
        {open && (
          <div className="mt-2">
            <CategoriesPanel
              selectedId={categoryId}
              onSelect={(id) => {
                setCategoryId(id);
                setOpen(false);
              }}
            />
          </div>
        )}
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <CategoriesPanel selectedId={categoryId} onSelect={setCategoryId} />
        </aside>
        <div className="min-w-0">
          <MaterialTemplatesPage embedded categoryFilter={categoryId} onCategoryFilterChange={setCategoryId} />
        </div>
      </div>
    </div>
  );
}
