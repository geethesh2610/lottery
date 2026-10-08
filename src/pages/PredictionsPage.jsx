import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Snackbar, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useEntries, useLotterySelection } from '../hooks/useLotteryData.js';
import { MODELS, generateCandidates, buildPredictionRows } from '../prediction/index.js';
import { inferNextDrawDate, todayIso } from '../utils/dates.js';
import { listPredictions, savePredictions } from '../services/predictionsService.js';
import { PageHeader, SectionCard, LoadingState, ErrorAlert, EmptyState, Disclaimer, NumberText } from '../components/common.jsx';
import { LotteryPrizeSelect, SimpleSelect } from '../components/LotteryPrizeSelect.jsx';
import { CandidateList } from '../components/CandidateList.jsx';
import { SignInNotice } from '../components/SignInNotice.jsx';
import { INSUFFICIENT_DATA_MESSAGE, MIN_SAMPLE_SIZE } from '../constants/app.js';

function SavedPredictions({ lottery, refreshKey }) {
  const preds = useAsync(() => listPredictions({ lottery, limit: 60 }), [lottery, refreshKey]);
  return (
    <SectionCard title="Saved predictions" subtitle="Evaluated automatically once the target draw is fetched">
      <ErrorAlert error={preds.error} onRetry={preds.reload} />
      {preds.loading ? <LoadingState /> : !preds.data?.length ? (
        <EmptyState title="No saved predictions" />
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Target draw</TableCell>
                <TableCell>Model</TableCell>
                <TableCell>Top candidates</TableCell>
                <TableCell>Actual</TableCell>
                <TableCell>Result</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {preds.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{p.target_draw_date}<br /><Typography variant="caption" color="text.secondary">{p.prize_category}</Typography></TableCell>
                  <TableCell>{MODELS.find((m) => m.id === p.model_name)?.name ?? p.model_name}</TableCell>
                  <TableCell><NumberText sx={{ fontSize: 13 }}>{p.predicted_numbers.slice(0, 3).map((c) => c.number).join(' · ')}{p.predicted_numbers.length > 3 ? ' …' : ''}</NumberText></TableCell>
                  <TableCell>{p.actual_number ? <NumberText>{p.actual_number}</NumberText> : '—'}</TableCell>
                  <TableCell>
                    {p.evaluated ? (
                      <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                        {p.exact_match && <Chip size="small" color="success" label="Exact match" />}
                        <Chip size="small" label={`${p.position_matches} pos`} />
                        <Chip size="small" label={`${p.matching_digits} digits`} />
                        {p.last_digit_match && <Chip size="small" label="last digit" />}
                      </Stack>
                    ) : <Chip size="small" variant="outlined" label="Pending" />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </SectionCard>
  );
}

export default function PredictionsPage() {
  const { user } = useAuth();
  const selection = useLotterySelection();
  const entries = useEntries(selection.lottery, selection.prize);
  const [modelId, setModelId] = useState('ensemble');
  const [count, setCount] = useState(10);
  const [candidates, setCandidates] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const data = entries.data || [];
  const insufficient = data.length < MIN_SAMPLE_SIZE;
  const targetDate = data.length ? inferNextDrawDate(data.map((e) => e.draw_date), todayIso()) : null;

  const generate = () => {
    setError(null);
    const history = data.filter((e) => e.draw_date < targetDate);
    setCandidates(generateCandidates(modelId, history, { count: Number(count) || 10, samples: 3000, seed: `${selection.lottery}|${selection.prize}|${targetDate}` }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { rows } = buildPredictionRows(selection.lottery, selection.prize, data, { modelIds: [modelId], count: Number(count) || 10, samples: 3000, targetDate });
      await savePredictions(rows);
      setToast(`Saved ${MODELS.find((m) => m.id === modelId).name} candidates for ${targetDate}`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  const model = MODELS.find((m) => m.id === modelId);

  return (
    <>
      <PageHeader title="Predictions" subtitle="Generate ranked candidates from experimental statistical models. Use Backtesting to check whether any model beats random." />
      <Disclaimer />
      <SignInNotice action="save predictions" />
      <ErrorAlert error={selection.error || entries.error || error} />
      {selection.lotteryOptions.length === 0 && !selection.loading ? (
        <EmptyState title="No data yet" description="Collect results first." />
      ) : (
        <LotteryPrizeSelect selection={selection}>
          <SimpleSelect label="Model" value={modelId} onChange={(v) => { setModelId(v); setCandidates(null); }} options={MODELS.map((m) => ({ value: m.id, label: m.name }))} minWidth={260} />
          <TextField size="small" type="number" label="Candidates" value={count} onChange={(e) => setCount(e.target.value)} sx={{ width: 120 }} slotProps={{ htmlInput: { min: 1, max: 50 } }} />
        </LotteryPrizeSelect>
      )}
      {entries.loading && <LoadingState />}
      {entries.data && (
        <SectionCard
          title={`Top ${count} statistical candidates`}
          subtitle={targetDate ? `${selection.lottery} · ${selection.prize} · next expected draw ${targetDate} · trained on ${data.filter((e) => e.draw_date < targetDate).length} results` : null}
          action={
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={generate} disabled={insufficient}>Generate candidates</Button>
              <Button variant="outlined" onClick={save} disabled={!user || insufficient || saving || !candidates}>{saving ? 'Saving…' : 'Save for evaluation'}</Button>
            </Stack>
          }
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{model?.description}</Typography>
          {insufficient ? (
            <Alert severity="info">{INSUFFICIENT_DATA_MESSAGE} {data.length} result(s) available; at least {MIN_SAMPLE_SIZE} needed.</Alert>
          ) : candidates ? (
            <CandidateList candidates={candidates} />
          ) : (
            <EmptyState title="No candidates yet" description="Click “Generate candidates”." />
          )}
        </SectionCard>
      )}
      <Box sx={{ mt: 3 }}>
        <SavedPredictions lottery={selection.lottery} refreshKey={refreshKey} />
      </Box>
      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
