import { Navigate, Route, Routes } from 'react-router-dom';
import { Protected, ResponsiveLayout } from './layouts/ResponsiveLayout';
import { RoleGate } from './components/RoleGate';
import { LoginPage } from './features/auth/LoginPage';
import { PlatesListPage } from './features/materials/PlatesListPage';
import { MaterialCategoriesPage } from './features/materials/MaterialCategoriesPage';
import { MaterialTemplatesPage } from './features/materials/MaterialTemplatesPage';
import { CustomersListPage } from './features/customers/CustomersListPage';
import { DashboardPage } from './features/reports/DashboardPage';
import { QuotesPage } from './features/quotes/QuotesPage';
import { ProcessingQueuePage } from './features/processing/ProcessingQueuePage';
import { PortalPage } from './features/portal/PortalPage';
import { EmployeesPage } from './features/employees/EmployeesPage';
import { PaymentsPage } from './features/payments/PaymentsPage';
import { ExpensesPage } from './features/expenses/ExpensesPage';

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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Müşteri portalı — PUBLIC (Protected dışında, giriş gerektirmez). */}
      <Route path="/portal/:token" element={<PortalPage />} />

      <Route
        element={
          <Protected>
            <ResponsiveLayout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/plates" replace />} />
        <Route path="/plates" element={<PlatesListPage />} />
        <Route
          path="/material-categories"
          element={
            <RoleGate roles={['owner']} fallback={<Placeholder title="Yetkisiz" />}>
              <MaterialCategoriesPage />
            </RoleGate>
          }
        />
        <Route
          path="/material-templates"
          element={
            <RoleGate roles={['owner']} fallback={<Placeholder title="Yetkisiz" />}>
              <MaterialTemplatesPage />
            </RoleGate>
          }
        />
        <Route path="/purchases" element={<Placeholder title="Satın Alma" />} />
        <Route path="/processing" element={<Placeholder title="İşleme" />} />
        <Route path="/queue" element={<ProcessingQueuePage />} />
        <Route path="/quotes" element={<QuotesPage />} />
        <Route path="/customers" element={<CustomersListPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route
          path="/employees"
          element={
            <RoleGate roles={['owner']} fallback={<Placeholder title="Yetkisiz" />}>
              <EmployeesPage />
            </RoleGate>
          }
        />
        <Route
          path="/expenses"
          element={
            <RoleGate roles={['owner']} fallback={<Placeholder title="Yetkisiz" />}>
              <ExpensesPage />
            </RoleGate>
          }
        />
        {/* Mali raporlar yalnızca İşletme Sahibi (RBAC). */}
        <Route
          path="/reports"
          element={
            <RoleGate
              roles={['owner']}
              fallback={<Placeholder title="Yetkisiz" />}
            >
              <DashboardPage />
            </RoleGate>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/plates" replace />} />
    </Routes>
  );
}
