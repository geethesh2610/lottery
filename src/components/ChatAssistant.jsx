import { Fragment, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Drawer, Fab, IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ChatIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { invokeFunction } from '../services/functionsService.js';
import { useAuth } from '../hooks/useAuth.jsx';

const STORAGE_KEY = 'klpa.chat';
const SUGGESTIONS = [
  'Predict 5th prize for Karunya',
  'What were the latest Karunya results?',
  'How have the predictions performed?',
  'How does the pattern model work?',
];

function loadHistory() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function inline(p, j) {
  if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) return <strong key={j}>{p.slice(2, -2)}</strong>;
  if (p.length > 2 && p.startsWith('*') && p.endsWith('*')) return <em key={j}>{p.slice(1, -1)}</em>;
  return <Fragment key={j}>{p}</Fragment>;
}

/** Minimal formatting for model replies: **bold**, *italic*, "-" bullets, line breaks. */
function FormattedText({ text }) {
  return text.split('\n').map((line, i) => {
    const bullet = /^\s*[-*•]\s+/.test(line);
    const content = line.replace(/^\s*[-*•]\s+/, '').split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map(inline);
    return (
      <Box key={i} sx={{ minHeight: '1em', pl: bullet ? 2 : 0, position: 'relative' }}>
        {bullet && <Box component="span" sx={{ position: 'absolute', left: 4 }}>•</Box>}
        {content}
      </Box>
    );
  });
}

function Message({ role, text }) {
  const mine = role === 'user';
  return (
    <Box sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <Box
        sx={{
          maxWidth: '88%',
          px: 1.5,
          py: 1,
          borderRadius: 2,
          bgcolor: mine ? 'primary.main' : 'action.hover',
          color: mine ? 'primary.contrastText' : 'text.primary',
          typography: 'body2',
          wordBreak: 'break-word',
        }}
      >
        {mine ? text : <FormattedText text={text} />}
      </Box>
    </Box>
  );
}

export function ChatAssistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(loadHistory);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      // ignore
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy, open]);

  const send = async (text) => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...messages, { role: 'user', text: q }];
    setMessages(next);
    setInput('');
    setError(null);
    setBusy(true);
    try {
      const { reply } = await invokeFunction('chat', { messages: next });
      setMessages((m) => [...m, { role: 'model', text: reply }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <Tooltip title="Ask the assistant">
          <Fab color="primary" onClick={() => setOpen(true)} aria-label="Open assistant" sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: (t) => t.zIndex.drawer + 1 }}>
            <ChatIcon />
          </Fab>
        </Tooltip>
      )}
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', sm: 420 }, display: 'flex', flexDirection: 'column' } }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1 }}>Assistant</Typography>
          {messages.length > 0 && (
            <Tooltip title="Clear chat">
              <IconButton size="small" onClick={() => { setMessages([]); setError(null); }} aria-label="Clear chat"><DeleteIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={() => setOpen(false)} aria-label="Close assistant"><CloseIcon fontSize="small" /></IconButton>
        </Stack>

        <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
          {!user ? (
            <Alert severity="info" action={<Button size="small" component={NavLink} to="/login" onClick={() => setOpen(false)}>Sign in</Button>}>
              Sign in to use the assistant.
            </Alert>
          ) : (
            <Stack spacing={1.5}>
              {messages.length === 0 && (
                <>
                  <Typography variant="body2" color="text.secondary">
                    Ask anything about the app or your data: predictions, past results, how a number has done, performance, sources…
                  </Typography>
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                    {SUGGESTIONS.map((s) => <Chip key={s} label={s} onClick={() => send(s)} variant="outlined" />)}
                  </Stack>
                </>
              )}
              {messages.map((m, i) => <Message key={i} role={m.role} text={m.text} />)}
              {busy && (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2">Thinking…</Typography>
                </Stack>
              )}
              {error && <Alert severity="error">{error}</Alert>}
              <div ref={endRef} />
            </Stack>
          )}
        </Box>

        {user && (
          <Box component="form" onSubmit={(e) => { e.preventDefault(); send(input); }} sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              multiline
              maxRows={4}
              placeholder="e.g. Predict 5th prize for Karunya"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <IconButton type="submit" color="primary" disabled={busy || !input.trim()} aria-label="Send"><SendIcon /></IconButton>
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, pb: 1 }}>
          Powered by Gemini (free tier). Answers can be wrong; lottery draws are random.
        </Typography>
      </Drawer>
    </>
  );
}
