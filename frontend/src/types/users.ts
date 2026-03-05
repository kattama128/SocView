export type PermissionMap = {
  view: boolean;
  triage: boolean;
  manage_sources: boolean;
  manage_customers: boolean;
  manage_users: boolean;
  export: boolean;
  admin: boolean;
};

export type UserMembership = {
  id: number;
  customer_id: number;
  customer_name: string;
  scope: "viewer" | "triage" | "manager";
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type UserAccount = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  permissions: PermissionMap;
  is_active: boolean;
  last_login: string | null;
  date_joined: string;
  memberships: UserMembership[];
  is_public_schema?: boolean;
};

export type RoleDefinition = {
  role: string;
  label: string;
  description: string;
  permissions: PermissionMap;
};

export type UserAccountPayload = {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active?: boolean;
  password?: string;
  memberships?: Array<{
    customer_id: number;
    scope?: "viewer" | "triage" | "manager";
    is_active?: boolean;
    notes?: string;
  }>;
};
