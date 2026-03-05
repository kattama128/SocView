import { useMemo } from "react";

import api, { resolveApiBasePath } from "../services/api";

export function useTenantApi() {
  return useMemo(() => api, []);
}

export function useTenantApiBasePath() {
  return resolveApiBasePath();
}
