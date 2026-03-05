import { Autocomplete, TextField } from "@mui/material";

import mitreTechniques from "../data/mitre_techniques.json";

type MitreTechnique = {
  id: string;
  name: string;
};

type MitreAutocompleteProps = {
  value?: string | null;
  disabled?: boolean;
  onChange: (techniqueId: string | null) => void;
};

export default function MitreAutocomplete({ value, disabled = false, onChange }: MitreAutocompleteProps) {
  const options = mitreTechniques as MitreTechnique[];
  const selectedOption = options.find((item) => item.id === value) ?? null;

  return (
    <Autocomplete
      options={options}
      value={selectedOption}
      disabled={disabled}
      getOptionLabel={(option) => `${option.id} - ${option.name}`}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      onChange={(_, next) => onChange(next?.id ?? null)}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Tecnica MITRE ATT&CK"
          size="small"
          inputProps={{
            ...params.inputProps,
            "data-testid": "mitre-technique-field",
          }}
        />
      )}
      noOptionsText="Nessuna tecnica trovata"
    />
  );
}
