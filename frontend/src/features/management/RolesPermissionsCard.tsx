import { Card, CardContent, Divider, Table, TableBody, TableCell, TableHead, TableRow, Chip, Typography } from "@mui/material";

import type { RoleDefinition } from "../../types/users";
import { surfaceCardSx } from "../../styles/surfaces";

type Props = {
  roles: RoleDefinition[];
};

export default function RolesPermissionsCard({ roles }: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Ruoli & Permessi</Typography>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: "#94a3b8" }}>Ruolo</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>View</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Triage</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Sources</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Customer</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Users</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Export</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Admin</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.role}>
                <TableCell sx={{ color: "#e2e8f0" }}>{role.role}</TableCell>
                {[
                  role.permissions.view,
                  role.permissions.triage,
                  role.permissions.manage_sources,
                  role.permissions.manage_customers,
                  role.permissions.manage_users,
                  role.permissions.export,
                  role.permissions.admin,
                ].map((flag, idx) => (
                  <TableCell key={`${role.role}-${idx}`}>
                    <Chip size="small" label={flag ? "Si" : "No"} sx={{ color: flag ? "#34d399" : "#fca5a5", border: "1px solid rgba(148,163,184,0.2)" }} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
