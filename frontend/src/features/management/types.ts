export type ManagementSettings = {
  orgName: string;
  region: string;
  timezone: string;
  dataResidency: string;
  mfaRequired: boolean;
  sessionTimeoutMinutes: number;
  passwordPolicy: string;
  ipAllowlist: string;
  ssoEnabled: boolean;
  ssoProvider: string;
  apiKeyRotationDays: number;
  auditRetentionDays: number;
  rawRetentionDays: number;
  parsedRetentionDays: number;
  exportAutoSchedule: string;
  notifyOnCritical: boolean;
  notifyOnHigh: boolean;
  notifyChannels: string;
  webhookEndpoint: string;
  pagerDutyKey: string;
  slackChannel: string;
  maintenanceWindow: string;
};

export const defaultManagementSettings: ManagementSettings = {
  orgName: "SocView Platform",
  region: "EU-West",
  timezone: "Europe/Rome",
  dataResidency: "EU",
  mfaRequired: true,
  sessionTimeoutMinutes: 120,
  passwordPolicy: "Strong",
  ipAllowlist: "",
  ssoEnabled: false,
  ssoProvider: "",
  apiKeyRotationDays: 90,
  auditRetentionDays: 365,
  rawRetentionDays: 90,
  parsedRetentionDays: 365,
  exportAutoSchedule: "Weekly",
  notifyOnCritical: true,
  notifyOnHigh: true,
  notifyChannels: "SOC Slack, Email, PagerDuty",
  webhookEndpoint: "https://socview.local/webhooks/notify",
  pagerDutyKey: "pd-key-xxxx",
  slackChannel: "#soc-alerts",
  maintenanceWindow: "Sunday 02:00 - 03:00",
};
