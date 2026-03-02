import { Alert, Card, CardContent, CircularProgress, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import api from "../services/api";

type TenantContext = {
  schema: string;
  tenant: string;
};

export default function TenantPage() {
  const [data, setData] = useState<TenantContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get<TenantContext>("/tenancy/tenant-context/");
        setData(response.data);
      } catch {
        setError("Impossibile recuperare il contesto tenant.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 200 }}>
        <CircularProgress />
      </Stack>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          Tenant
        </Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {data ? (
          <Typography>
            Schema corrente: <strong>{data.schema}</strong> | Tenant: <strong>{data.tenant}</strong>
          </Typography>
        ) : (
          <Typography color="text.secondary">Nessun contesto disponibile.</Typography>
        )}
      </CardContent>
    </Card>
  );
}
