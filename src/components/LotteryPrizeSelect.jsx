import { FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material';

export function SimpleSelect({ label, value, onChange, options, minWidth = 180, allowEmpty = false, emptyLabel = 'All', disabled }) {
  return (
    <FormControl size="small" sx={{ minWidth }} disabled={disabled}>
      <InputLabel>{label}</InputLabel>
      <Select label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty && <MenuItem value="">{emptyLabel}</MenuItem>}
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return (
            <MenuItem key={v} value={v}>
              {l}
            </MenuItem>
          );
        })}
      </Select>
    </FormControl>
  );
}

export function LotteryPrizeSelect({ selection, children }) {
  const { lottery, setLottery, prize, setPrize, lotteryOptions, prizeOptions } = selection;
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, flexWrap: 'wrap', gap: 2 }}>
      <SimpleSelect label="Lottery" value={lottery} onChange={setLottery} options={lotteryOptions} minWidth={220} />
      <SimpleSelect label="Prize" value={prize} onChange={setPrize} options={prizeOptions} />
      {children}
    </Stack>
  );
}
