import { useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField,
} from '@mui/material';
import { ParsedPreview } from './ParsedPreview.jsx';
import { SimpleSelect } from './LotteryPrizeSelect.jsx';
import { createSource, fetchSourceNow, previewSource } from '../services/sourcesService.js';
import { FETCH_FREQUENCIES } from '../constants/app.js';

const EMPTY = { name: '', lottery_name: '', url: '', lottery_code: '', fetch_frequency: 'daily' };

/** Add source → Test Source (server-side fetch + parse) → Confirm & Save. */
export function SourceDialog({ open, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target ? e.target.value : e }));
    if (k === 'url' || k === 'lottery_name') setPreview(null);
  };

  const close = () => {
    setForm(EMPTY);
    setPreview(null);
    setError(null);
    onClose();
  };

  const test = async () => {
    setError(null);
    setPreview(null);
    setTesting(true);
    try {
      const res = await previewSource(form.url.trim(), form.lottery_name.trim());
      if (!res.ok) throw new Error(res.error || 'The page could not be fetched.');
      setPreview(res.parsed);
      if (!form.name && res.parsed.lottery_name) setForm((f) => ({ ...f, name: `${res.parsed.lottery_name} — ${new URL(f.url).host}` }));
      if (!form.lottery_name && res.parsed.lottery_name) setForm((f) => ({ ...f, lottery_name: res.parsed.lottery_name }));
    } catch (e) {
      setError(e.message);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const source = await createSource(form);
      let fetchResult = null;
      if (preview?.valid) fetchResult = await fetchSourceNow(source.id).catch((e) => ({ ok: false, error: e.message }));
      onSaved?.(source, fetchResult);
      close();
    } catch (e) {
      setError(/lottery_sources_url_unique/.test(e.message) ? 'A source with this URL already exists.' : e.message);
    } finally {
      setSaving(false);
    }
  };

  const urlValid = /^https?:\/\/\S+\.\S+/.test(form.url.trim());

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md">
      <DialogTitle>Add result source</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            Use a public result page. The page is fetched by the server (Edge Function), never by your browser.
            Sites that block automated access (robots.txt, CAPTCHA, logins, bot challenges) are reported, not bypassed.
          </Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Lottery name" placeholder="Karunya Plus (blank = any lottery on the page)" value={form.lottery_name} onChange={set('lottery_name')} fullWidth />
            <TextField label="Lottery code (optional)" placeholder="KN" value={form.lottery_code} onChange={set('lottery_code')} sx={{ minWidth: 160 }} />
          </Stack>
          <TextField label="URL" placeholder="https://example.com/kerala-lottery-results" value={form.url} onChange={set('url')} fullWidth error={!!form.url && !urlValid} helperText={form.url && !urlValid ? 'Enter a full http(s) URL' : ' '} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Source name" value={form.name} onChange={set('name')} fullWidth />
            <SimpleSelect label="Fetch frequency" value={form.fetch_frequency} onChange={set('fetch_frequency')} options={FETCH_FREQUENCIES} />
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          {preview && (
            <>
              <Divider>Preview</Divider>
              <ParsedPreview parsed={preview} />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button variant="outlined" onClick={test} disabled={!urlValid || testing}>
          {testing ? 'Testing…' : 'Test Source'}
        </Button>
        <Button variant="contained" onClick={save} disabled={!preview || !form.name.trim() || saving}>
          {saving ? 'Saving…' : preview?.valid ? 'Confirm & Save' : 'Save source anyway'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
