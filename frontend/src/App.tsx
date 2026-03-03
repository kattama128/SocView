import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./layout/AppLayout";
import ActiveAlarmsPage from "./pages/ActiveAlarmsPage";
import AdminConfigPage from "./pages/AdminConfigPage";
import CostumersPage from "./pages/CostumersPage";
import CustomerAlarmsPage from "./pages/CustomerAlarmsPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ReportsPage from "./pages/ReportsPage";
import SourcesPage from "./pages/SourcesPage";

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
          <Route path="/tenant" element={<Navigate to="/" replace />} />
          <Route path="/costumers" element={<CostumersPage />} />
          <Route path="/costumers/:customerId" element={<CustomerAlarmsPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/fonti" element={<Navigate to="/sources" replace />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/parser" element={<Navigate to="/sources" replace />} />
          <Route path="/alerts/:alertId" element={<Navigate to="/active-alarms" replace />} />
          <Route path="/configurazione" element={<AdminConfigPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
