import { Chip, Stack } from "@mui/material";

type Props = {
  customerName: string;
  enabledCount: number;
  sourcesCount: number;
  tier: string;
};

export default function CustomerSummaryChips({ customerName, enabledCount, sourcesCount, tier }: Props) {
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap">
      <Chip size="small" label={`Cliente: ${customerName}`} sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.18)" }} />
      <Chip size="small" label={`Fonti abilitate: ${enabledCount}/${sourcesCount}`} sx={{ color: "#86efac", border: "1px solid rgba(74,222,128,0.35)", background: "rgba(20,83,45,0.2)" }} />
      <Chip size="small" label={`Tier: ${tier}`} sx={{ color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.35)", background: "rgba(76,29,149,0.2)" }} />
    </Stack>
  );
}
