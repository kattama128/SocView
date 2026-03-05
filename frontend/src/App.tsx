import { LinearProgress } from "@mui/material";
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import ErrorBoundary from "./components/ErrorBoundary";
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
const HomePage = lazy(() => import("./pages/HomePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ParserPage = lazy(() => import("./pages/ParserPage"));
const SearchPage = lazy(() => import("./pages/TenantPage"));
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
      <ErrorBoundary>
        <Suspense fallback={<LinearProgress />}>
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/active-alarms" element={<ActiveAlarmsPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/sources" element={<SourcesPage />} />
              <Route path="/parsers" element={<ParserPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:customerId" element={<CustomerAlarmsPage />} />
              <Route path="/customers/:customerId/settings" element={<CustomerSettingsPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/alerts/:alertId" element={<AlertDetailPage />} />
              <Route path="/configurazione" element={<AdminConfigPage />} />
              <Route path="/admin-panel" element={<AdminPanelPage />} />
              <Route path="/403" element={<ForbiddenPage />} />
              {/* Legacy redirects */}
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/alerts" element={<Navigate to="/active-alarms" replace />} />
              <Route path="/active" element={<Navigate to="/active-alarms" replace />} />
              <Route path="/alarms" element={<Navigate to="/active-alarms" replace />} />
              <Route path="/tenant" element={<Navigate to="/search" replace />} />
              <Route path="/fonti" element={<Navigate to="/sources" replace />} />
              <Route path="/parser" element={<Navigate to="/parsers" replace />} />
              <Route path="/reports" element={<Navigate to="/analytics" replace />} />
              <Route path="/costumers" element={<Navigate to="/customers" replace />} />
              <Route path="/costumers/:customerId" element={<LegacyCustomerRouteRedirect />} />
              <Route path="/costumers/:customerId/settings" element={<LegacyCustomerRouteRedirect suffix="/settings" />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </TimeRangeProvider>
  );
}
