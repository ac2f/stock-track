import { Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Protected, ResponsiveLayout } from './layouts/ResponsiveLayout';
import { LoginPage } from './features/auth/LoginPage';
import { Can, NoAccess } from './components/Can';
import { useAuth } from './context/AuthContext';
import { PageFallback } from './components/ui/Loading';
import { lazyPage } from './lib/lazyPage';

const PlatesListPage = lazyPage(() => import('./features/materials/PlatesListPage'), 'PlatesListPage');
const MaterialCategoriesPage = lazyPage(
  () => import('./features/materials/MaterialCategoriesPage'),
  'MaterialCategoriesPage',
);
const MaterialTemplatesPage = lazyPage(
  () => import('./features/materials/MaterialTemplatesPage'),
  'MaterialTemplatesPage',
);
const PriceRulesPage = lazyPage(() => import('./features/materials/PriceRulesPage'), 'PriceRulesPage');
const CustomersListPage = lazyPage(() => import('./features/customers/CustomersListPage'), 'CustomersListPage');
const DashboardPage = lazyPage(() => import('./features/reports/DashboardPage'), 'DashboardPage');
const QuotesPage = lazyPage(() => import('./features/quotes/QuotesPage'), 'QuotesPage');
const ProcessingQueuePage = lazyPage(
  () => import('./features/processing/ProcessingQueuePage'),
  'ProcessingQueuePage',
);
const PortalPage = lazyPage(() => import('./features/portal/PortalPage'), 'PortalPage');
const TeamPage = lazyPage(() => import('./features/team/TeamPage'), 'TeamPage');
const PaymentsPage = lazyPage(() => import('./features/payments/PaymentsPage'), 'PaymentsPage');
const BankReconciliationPage = lazyPage(
  () => import('./features/banking/BankReconciliationPage'),
  'BankReconciliationPage',
);
const ExpensesPage = lazyPage(() => import('./features/expenses/ExpensesPage'), 'ExpensesPage');
const PurchasesPage = lazyPage(() => import('./features/purchases/PurchasesPage'), 'PurchasesPage');
const ShopTransfersPage = lazyPage(
  () => import('./features/shop-transfers/ShopTransfersPage'),
  'ShopTransfersPage',
);
const SettingsPage = lazyPage(() => import('./features/settings/SettingsPage'), 'SettingsPage');
const SyncPage = lazyPage(() => import('./features/sync/SyncPage'), 'SyncPage');

/** Ekip ekranı: sistem sahibi ve en az bir dükkânın yöneticisi. */
function TeamGate({ children }: { children: ReactNode }) {
  const { managesAnyShop } = useAuth();
  return <>{managesAnyShop ? children : <NoAccess what="Ekip ve yetkiler" />}</>;
}

/** Dükkânlar arası satış: satışları ya da satın almaları görebilen. */
function TransfersGate({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  return <>{can('sales') || can('purchases') ? children : <NoAccess what="Dükkânlar arası satış" />}</>;
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="card">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">
        Bu ekran aynı <code>features/*</code> desenini izleyerek eklenecektir.
      </p>
    </div>
  );
}

/** Açılış ekranı: görebildiği ilk alan (stok görmeyen çalışan boş sayfaya düşmesin). */
function HomeRedirect() {
  const { can, managesAnyShop } = useAuth();
  const first =
    (
      [
        ['stock', '/plates'],
        ['quotes', '/quotes'],
        ['processing', '/queue'],
        ['customers', '/customers'],
        ['payments', '/payments'],
        ['purchases', '/purchases'],
        ['expenses', '/expenses'],
        ['reports', '/reports'],
        ['settings', '/settings'],
      ] as const
    ).find(([m]) => can(m))?.[1] ?? (managesAnyShop ? '/team' : '/plates');
  return <Navigate to={first} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Müşteri portalı — PUBLIC (Protected dışında, giriş gerektirmez). */}
      <Route
        path="/portal/:token"
        element={
          <Suspense fallback={<PageFallback />}>
            <PortalPage />
          </Suspense>
        }
      />

      <Route
        element={
          <Protected>
            <ResponsiveLayout />
          </Protected>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route
          path="/plates"
          element={
            <Can module="stock" fallback={<NoAccess what="Stok" />}>
              <PlatesListPage />
            </Can>
          }
        />
        <Route
          path="/material-categories"
          element={
            <Can module="catalog" fallback={<NoAccess what="Katalog" />}>
              <MaterialCategoriesPage />
            </Can>
          }
        />
        <Route
          path="/material-templates"
          element={
            <Can module="catalog" fallback={<NoAccess what="Katalog" />}>
              <MaterialTemplatesPage />
            </Can>
          }
        />
        <Route
          path="/price-rules"
          element={
            <Can module="catalog" fallback={<NoAccess what="Katalog" />}>
              <PriceRulesPage />
            </Can>
          }
        />
        <Route
          path="/purchases"
          element={
            <Can module="purchases" fallback={<NoAccess what="Satın alma" />}>
              <PurchasesPage />
            </Can>
          }
        />
        <Route
          path="/shop-transfers"
          element={
            <TransfersGate>
              <ShopTransfersPage />
            </TransfersGate>
          }
        />
        {/* Yerel sunucu (replika) eşitleme durumu ve kararlar — her oturum açan görür. */}
        <Route path="/sync" element={<SyncPage />} />
        <Route path="/processing" element={<Placeholder title="İşleme" />} />
        <Route
          path="/queue"
          element={
            <Can module="processing" fallback={<NoAccess what="İş kuyruğu" />}>
              <ProcessingQueuePage />
            </Can>
          }
        />
        <Route
          path="/quotes"
          element={
            <Can module="quotes" fallback={<NoAccess what="Teklifler" />}>
              <QuotesPage />
            </Can>
          }
        />
        <Route
          path="/customers"
          element={
            <Can module="customers" fallback={<NoAccess what="Müşteriler" />}>
              <CustomersListPage />
            </Can>
          }
        />
        <Route
          path="/payments"
          element={
            <Can module="payments" fallback={<NoAccess what="Ödemeler" />}>
              <PaymentsPage />
            </Can>
          }
        />
        <Route
          path="/bank-reconciliation"
          element={
            <Can module="banking" fallback={<NoAccess what="Banka mutabakatı" />}>
              <BankReconciliationPage />
            </Can>
          }
        />
        <Route
          path="/team"
          element={
            <TeamGate>
              <TeamPage />
            </TeamGate>
          }
        />
        <Route path="/employees" element={<Navigate to="/team" replace />} />
        <Route
          path="/expenses"
          element={
            <Can module="expenses" fallback={<NoAccess what="Giderler" />}>
              <ExpensesPage />
            </Can>
          }
        />
        {/* Her ekran seçili dükkândaki okuma iznine bağlı (sunucu da denetler). */}
        <Route
          path="/reports"
          element={
            <Can module="reports" fallback={<NoAccess what="Raporlar" />}>
              <DashboardPage />
            </Can>
          }
        />
        <Route
          path="/settings"
          element={
            <Can module="settings" fallback={<NoAccess what="Dükkân ayarları" />}>
              <SettingsPage />
            </Can>
          }
        />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
