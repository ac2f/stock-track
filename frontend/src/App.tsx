import { Navigate, Route, Routes } from 'react-router-dom';
import { Protected, ResponsiveLayout } from './layouts/ResponsiveLayout';
import { RoleGate } from './components/RoleGate';
import { LoginPage } from './features/auth/LoginPage';
import { PlatesListPage } from './features/materials/PlatesListPage';
import { CustomersListPage } from './features/customers/CustomersListPage';
import { DashboardPage } from './features/reports/DashboardPage';

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

      <Route
        element={
          <Protected>
            <ResponsiveLayout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/plates" replace />} />
        <Route path="/plates" element={<PlatesListPage />} />
        <Route path="/purchases" element={<Placeholder title="Satın Alma" />} />
        <Route path="/processing" element={<Placeholder title="İşleme" />} />
        <Route path="/customers" element={<CustomersListPage />} />
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
