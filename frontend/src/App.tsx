import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./layout/AppLayout";
import ActiveAlarmsPage from "./pages/ActiveAlarmsPage";
import AdminConfigPage from "./pages/AdminConfigPage";
import AlertDetailPage from "./pages/AlertDetailPage";
import CostumersPage from "./pages/CostumersPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ParserPage from "./pages/ParserPage";
import ReportsPage from "./pages/ReportsPage";
import SourcesPage from "./pages/SourcesPage";
import TenantPage from "./pages/TenantPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/active-alarms" element={<ActiveAlarmsPage />} />
          <Route path="/active" element={<Navigate to="/active-alarms" replace />} />
          <Route path="/alarms" element={<Navigate to="/active-alarms" replace />} />
          <Route path="/tenant" element={<TenantPage />} />
          <Route path="/costumers" element={<CostumersPage />} />
          <Route path="/fonti" element={<SourcesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/parser" element={<ParserPage />} />
          <Route path="/alerts/:alertId" element={<AlertDetailPage />} />
          <Route path="/configurazione" element={<AdminConfigPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
