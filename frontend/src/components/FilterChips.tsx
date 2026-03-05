import ClearAllIcon from "@mui/icons-material/ClearAll";
import CloseIcon from "@mui/icons-material/Close";
import { Button, Chip, Stack } from "@mui/material";

export type FilterChipItem = {
  id: string;
  label: string;
  onDelete: () => void;
};

type Props = {
  items: FilterChipItem[];
  onClearAll: () => void;
};

export default function FilterChips({ items, onClearAll }: Props) {
  if (!items.length) {
    return null;
  }

  return (
    <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" alignItems="center">
      {items.map((item) => (
        <Chip
          key={item.id}
          size="small"
          label={item.label}
          onDelete={item.onDelete}
          deleteIcon={<CloseIcon data-testid="remove-filter" />}
          data-testid="filter-chip"
          sx={{ background: "rgba(15,23,42,0.65)", border: "1px solid rgba(71,85,105,0.4)" }}
        />
      ))}
      <Button size="small" startIcon={<ClearAllIcon />} onClick={onClearAll}>
        Rimuovi filtri
      </Button>
    </Stack>
  );
}
