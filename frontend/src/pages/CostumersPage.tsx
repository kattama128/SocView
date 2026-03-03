import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Box,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useCustomer } from "../context/CustomerContext";
import { mockAlarms, mockCustomers } from "../mocks/activeAlarmsData";
import { isSourceEnabledForCustomer, loadCustomerSourcePreferences } from "../mocks/sourceCatalog";

const orderStorageKey = "socview_costumers_order";

type DragState = { index: number } | null;

type CustomerWithStats = {
  id: number;
  name: string;
  code: string;
  sector: string;
  owner: string;
  total: number;
  bySeverity: Record<"critical" | "high" | "medium" | "low", number>;
};

function loadOrder(): number[] {
  try {
    const raw = localStorage.getItem(orderStorageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as number[];
    return Array.isArray(parsed) ? parsed.filter((value) => Number.isFinite(value)) : [];
  } catch {
    return [];
  }
}

export default function CostumersPage() {
  const navigate = useNavigate();
  const { selectedCustomerId, setSelectedCustomerId } = useCustomer();
  const sourcePreferences = useMemo(() => loadCustomerSourcePreferences(), []);
  const [dragState, setDragState] = useState<DragState>(null);
  const [order, setOrder] = useState<number[]>(loadOrder);

  const customers = useMemo<CustomerWithStats[]>(() => {
    const base = mockCustomers.map((customer) => {
      const alarms = mockAlarms.filter(
        (alarm) =>
          alarm.customerId === customer.id && isSourceEnabledForCustomer(customer.id, alarm.sourceId, sourcePreferences),
      );
      const bySeverity = {
        critical: alarms.filter((item) => item.severity === "critical").length,
        high: alarms.filter((item) => item.severity === "high").length,
        medium: alarms.filter((item) => item.severity === "medium").length,
        low: alarms.filter((item) => item.severity === "low").length,
      };

      return {
        ...customer,
        total: alarms.length,
        bySeverity,
      };
    });

    if (!order.length) {
      return base;
    }

    const rank = new Map<number, number>();
    order.forEach((id, index) => rank.set(id, index));

    return [...base].sort((a, b) => {
      const ra = rank.has(a.id) ? (rank.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b.id) ? (rank.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
      if (ra !== rb) {
        return ra - rb;
      }
      return a.name.localeCompare(b.name, "it", { sensitivity: "base" });
    });
  }, [order, sourcePreferences]);

  const persistOrder = (ids: number[]) => {
    setOrder(ids);
    localStorage.setItem(orderStorageKey, JSON.stringify(ids));
  };

  const handleDrop = (dropIndex: number) => {
    if (!dragState) {
      return;
    }
    const fromIndex = dragState.index;
    setDragState(null);
    if (fromIndex === dropIndex) {
      return;
    }

    const next = [...customers];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(dropIndex, 0, moved);
    persistOrder(next.map((item) => item.id));
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>Costumers</Typography>
        <Typography sx={{ color: "#64748b" }}>Elenco clienti in ordine configurabile (drag & drop).</Typography>
      </Box>

      <Paper
        sx={{
          borderRadius: 3,
          border: "1px solid rgba(148,163,184,0.24)",
          background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))",
          p: 2,
        }}
      >
        <Stack spacing={1}>
          {customers.map((customer, index) => (
            <Box
              key={customer.id}
              draggable
              onDragStart={() => setDragState({ index })}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(index)}
              onClick={() => {
                setSelectedCustomerId(customer.id);
                navigate(`/costumers/${customer.id}`);
              }}
              sx={{
                p: 1.2,
                borderRadius: 2,
                border:
                  selectedCustomerId === customer.id
                    ? "1px solid rgba(96,165,250,0.7)"
                    : "1px solid rgba(71,85,105,0.4)",
                bgcolor:
                  dragState?.index === index
                    ? "rgba(37,99,235,0.16)"
                    : selectedCustomerId === customer.id
                      ? "rgba(30,64,175,0.2)"
                      : "rgba(15,23,42,0.55)",
                cursor: "pointer",
              }}
            >
              <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <DragIndicatorIcon sx={{ color: "#64748b" }} />
                  <Box>
                    <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }}>
                      {customer.name} ({customer.code})
                    </Typography>
                    <Typography sx={{ color: "#64748b", fontSize: 12 }}>
                      {customer.sector} • Owner: {customer.owner}
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction="row" spacing={0.8} alignItems="center" useFlexGap flexWrap="wrap">
                  <Chip size="small" label={`Tot: ${customer.total}`} sx={{ color: "#e2e8f0", border: "1px solid rgba(148,163,184,0.4)", background: "rgba(15,23,42,0.8)" }} />
                  <Chip size="small" label={`C: ${customer.bySeverity.critical}`} sx={{ color: "#fca5a5", border: "1px solid rgba(248,113,113,0.4)", background: "rgba(127,29,29,0.2)" }} />
                  <Chip size="small" label={`H: ${customer.bySeverity.high}`} sx={{ color: "#fdba74", border: "1px solid rgba(249,115,22,0.35)", background: "rgba(124,45,18,0.2)" }} />
                  <Chip size="small" label={`M: ${customer.bySeverity.medium}`} sx={{ color: "#fcd34d", border: "1px solid rgba(234,179,8,0.35)", background: "rgba(113,63,18,0.2)" }} />
                  <Chip size="small" label={`L: ${customer.bySeverity.low}`} sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.2)" }} />
                  <Chip size="small" icon={<OpenInNewIcon />} label="Apri" sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.45)", background: "rgba(30,64,175,0.18)" }} />
                </Stack>
              </Stack>
            </Box>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
