import { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { BusinessesTab } from './BusinessesTab';
import { LabelsTab } from './LabelsTab';
import { MachineTypesTab } from './MachineTypesTab';
import { PlatformSettingsTab } from './PlatformSettingsTab';

type Tab = 'businesses' | 'labels' | 'machines' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'businesses', label: '🏭 İşletmeler' },
  { id: 'labels', label: '🏷️ İş kolu etiketleri' },
  { id: 'machines', label: '⚙️ Makine türleri' },
  { id: 'settings', label: '🛠️ Kayıt ve sistem' },
];

/**
 * Platform yönetimi (yalnız sistem sahibi): sistemi kiraladığınız işletmeleri
 * onaylayın, kiralama sürelerini yönetin; iş kolu etiketlerini ve makine
 * türlerini (alt kategoriler, standart ebatlar) tanımlayın.
 */
export function PlatformPage() {
  const [tab, setTab] = useState<Tab>('businesses');
  return (
    <div>
      <PageHeader
        icon="🛰️"
        title="Platform yönetimi"
        subtitle="Kiralanan işletmeler, iş kolu etiketleri, makine türleri ve kayıt ayarları."
      />
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[40px] shrink-0 rounded-lg px-4 text-sm font-medium transition ${
              tab === t.id ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'businesses' && <BusinessesTab />}
      {tab === 'labels' && <LabelsTab />}
      {tab === 'machines' && <MachineTypesTab />}
      {tab === 'settings' && <PlatformSettingsTab />}
    </div>
  );
}
