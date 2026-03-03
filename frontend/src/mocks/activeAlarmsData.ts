export type MockCustomer = {
  id: number;
  name: string;
  code: string;
  sector: string;
  owner: string;
};

export type MockSource = {
  id: number;
  customerId: number;
  name: string;
  type: "imap" | "rest" | "webhook";
  status: "healthy" | "degraded" | "offline";
  lastIngestAt: string;
};

export type MockAlarm = {
  id: number;
  customerId: number;
  sourceId: number;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "new" | "triage" | "investigating";
  eventId: string;
  detectedAt: string;
  assignee: string;
};

export const mockCustomers: MockCustomer[] = [
  { id: 1, name: "Alpina Bank", code: "ALP", sector: "Finance", owner: "SOC Team A" },
  { id: 2, name: "Medisys Group", code: "MED", sector: "Healthcare", owner: "SOC Team B" },
  { id: 3, name: "LogiTrans Global", code: "LOG", sector: "Transport", owner: "SOC Team C" },
  { id: 4, name: "NordCom Energy", code: "NCE", sector: "Energy", owner: "SOC Team D" },
  { id: 5, name: "RetailOne Italia", code: "ROI", sector: "Retail", owner: "SOC Team E" },
];

export const mockSources: MockSource[] = [
  { id: 11, customerId: 1, name: "O365 Security Mailbox", type: "imap", status: "healthy", lastIngestAt: "2026-03-02T20:09:00Z" },
  { id: 12, customerId: 2, name: "EDR Webhook Intake", type: "webhook", status: "healthy", lastIngestAt: "2026-03-02T20:10:00Z" },
  { id: 13, customerId: 3, name: "Cloud Audit Stream", type: "rest", status: "degraded", lastIngestAt: "2026-03-02T20:03:00Z" },
  { id: 14, customerId: 4, name: "OT Gateway Feed", type: "webhook", status: "offline", lastIngestAt: "2026-03-02T17:41:00Z" },
  { id: 15, customerId: 5, name: "POS Security Mailbox", type: "imap", status: "healthy", lastIngestAt: "2026-03-02T19:58:00Z" },
];

const severityCycle: MockAlarm["severity"][] = ["critical", "high", "medium", "low"];
const statusCycle: MockAlarm["status"][] = ["new", "triage", "investigating"];
const assigneeCycle = ["analyst", "manager", "readonly", "unassigned"];
const titleCycle = [
  "Impossible travel on privileged account",
  "VPN brute-force pattern detected",
  "EDR agent disabled on core server",
  "Firewall deny spike from unknown ASN",
  "Root API key used outside policy window",
  "Suspicious PowerShell execution chain",
  "Multiple MFA failures from new geo",
  "Data exfiltration pattern on outbound proxy",
];

export const mockAlarms: MockAlarm[] = Array.from({ length: 50 }, (_, index) => {
  const source = mockSources[index % mockSources.length];
  const customer = mockCustomers.find((item) => item.id === source.customerId)!;
  const detectedAt = new Date(Date.UTC(2026, 2, 2, 20, 0, 0) - index * 9 * 60 * 1000).toISOString();

  return {
    id: 9001 + index,
    customerId: source.customerId,
    sourceId: source.id,
    title: titleCycle[index % titleCycle.length],
    severity: severityCycle[index % severityCycle.length],
    status: statusCycle[index % statusCycle.length],
    eventId: `evt-${customer.code.toLowerCase()}-${String(index + 1).padStart(2, "0")}`,
    detectedAt,
    assignee: assigneeCycle[index % assigneeCycle.length],
  };
});
