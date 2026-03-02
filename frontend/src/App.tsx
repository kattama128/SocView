import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./layout/AppLayout";
import AdminConfigPage from "./pages/AdminConfigPage";
import AlertDetailPage from "./pages/AlertDetailPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SourcesPage from "./pages/SourcesPage";
import TenantPage from "./pages/TenantPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/tenant" element={<TenantPage />} />
          <Route path="/fonti" element={<SourcesPage />} />
          <Route path="/alerts/:alertId" element={<AlertDetailPage />} />
          <Route path="/configurazione" element={<AdminConfigPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
