import { LinearProgress } from "@mui/material";
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import { TimeRangeProvider } from "./contexts/TimeRangeContext";
import AppLayout from "./layout/AppLayout";

const ActiveAlarmsPage = lazy(() => import("./pages/ActiveAlarmsPage"));
const AnalyticsPage = lazy(() => import("./pages/Analytics"));
const AdminPanelPage = lazy(() => import("./pages/AdminPanel"));
const AdminConfigPage = lazy(() => import("./pages/AdminConfigPage"));
const AlertDetailPage = lazy(() => import("./pages/AlertDetailPage"));
const CustomerAlarmsPage = lazy(() => import("./pages/CustomerAlarmsPage"));
const CustomerSettingsPage = lazy(() => import("./pages/CustomerSettingsPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const ForbiddenPage = lazy(() => import("./pages/ForbiddenPage"));
const HomePage = lazy(() => import("./pages/Home"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SourcesPage = lazy(() => import("./pages/SourcesPage"));

function LegacyCustomerRouteRedirect({ suffix = "" }: { suffix?: string }) {
  const { customerId } = useParams<{ customerId: string }>();
  if (!customerId) {
    return <Navigate to="/customers" replace />;
  }
  return <Navigate to={`/customers/${customerId}${suffix}`} replace />;
}

export default function App() {
  return (
    <TimeRangeProvider>
      <Suspense fallback={<LinearProgress />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/dashboard" element={<HomePage />} />
              <Route path="/active-alarms" element={<ActiveAlarmsPage />} />
              <Route path="/alerts" element={<ActiveAlarmsPage />} />
              <Route path="/active" element={<Navigate to="/active-alarms" replace />} />
              <Route path="/alarms" element={<Navigate to="/active-alarms" replace />} />
              <Route path="/tenant" element={<Navigate to="/" replace />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:customerId" element={<CustomerAlarmsPage />} />
              <Route path="/customers/:customerId/settings" element={<CustomerSettingsPage />} />
              <Route path="/costumers" element={<Navigate to="/customers" replace />} />
              <Route path="/costumers/:customerId" element={<LegacyCustomerRouteRedirect />} />
              <Route path="/costumers/:customerId/settings" element={<LegacyCustomerRouteRedirect suffix="/settings" />} />
              <Route path="/sources" element={<SourcesPage />} />
              <Route path="/fonti" element={<Navigate to="/sources" replace />} />
              <Route path="/reports" element={<Navigate to="/analytics" replace />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/parser" element={<Navigate to="/sources" replace />} />
              <Route path="/parsers" element={<SourcesPage />} />
              <Route path="/alerts/:alertId" element={<AlertDetailPage />} />
              <Route path="/configurazione" element={<AdminConfigPage />} />
              <Route path="/admin-panel" element={<AdminPanelPage />} />
              <Route path="/403" element={<ForbiddenPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </TimeRangeProvider>
  );
}
