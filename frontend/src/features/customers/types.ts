export type CustomerSettings = {
  tier: string;
  timezone: string;
  slaTarget: string;
  primaryContact: string;
  contactEmail: string;
  contactPhone: string;
  notifyChannels: string;
  escalationMatrix: string;
  maintenanceWindow: string;
  defaultSeverity: string;
  autoAssignTeam: string;
  notifyOnCritical: boolean;
  notifyOnHigh: boolean;
  allowSuppress: boolean;
  retentionDays: number;
  tagDefaults: string;
  enrichGeo: boolean;
  enrichThreatIntel: boolean;
  allowExternalSharing: boolean;
};

export const defaultCustomerSettings: CustomerSettings = {
  tier: "Gold",
  timezone: "Europe/Rome",
  slaTarget: "15m",
  primaryContact: "SOC Lead",
  contactEmail: "soc@example.com",
  contactPhone: "+39 000 000 000",
  notifyChannels: "Email, Slack, PagerDuty",
  escalationMatrix: "L1 -> L2 -> L3",
  maintenanceWindow: "Sunday 02:00 - 03:00",
  defaultSeverity: "medium",
  autoAssignTeam: "SOC L1",
  notifyOnCritical: true,
  notifyOnHigh: true,
  allowSuppress: true,
  retentionDays: 365,
  tagDefaults: "customer, socview",
  enrichGeo: true,
  enrichThreatIntel: true,
  allowExternalSharing: false,
};
