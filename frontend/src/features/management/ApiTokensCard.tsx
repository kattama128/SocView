import { Card, CardContent, Divider, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";

import { surfaceCardSx } from "../../styles/surfaces";

type ApiToken = {
  name: string;
  scope: string;
  lastRotated: string;
};

type Props = {
  tokens: ApiToken[];
};

export default function ApiTokensCard({ tokens }: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>API tokens</Typography>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: "#94a3b8" }}>Token</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Scope</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Last rotated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tokens.map((token) => (
              <TableRow key={token.name}>
                <TableCell sx={{ color: "#e2e8f0" }}>{token.name}</TableCell>
                <TableCell sx={{ color: "#cbd5e1" }}>{token.scope}</TableCell>
                <TableCell sx={{ color: "#94a3b8" }}>{token.lastRotated}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
