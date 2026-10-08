// Minimal robots.txt support (User-agent groups, Allow/Disallow, `*` and `$`).

export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current) continue;
      if (field === 'allow' || field === 'disallow') {
        if (field === 'disallow' && value === '') continue;
        current.rules.push({ allow: field === 'allow', path: value });
      } else if (field === 'crawl-delay') {
        const n = Number(value);
        if (Number.isFinite(n)) current.crawlDelay = n;
      }
    }
  }
  return groups;
}

function escapeRegex(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function ruleMatches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp('^' + body.split('*').map(escapeRegex).join('.*') + (anchored ? '$' : ''));
  return re.test(path);
}

function groupFor(groups, userAgent) {
  const ua = userAgent.toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  return specific || groups.find((g) => g.agents.includes('*')) || null;
}

/** Returns { allowed, crawlDelay } for a URL path. Longest matching rule wins. */
export function checkRobots(groups, userAgent, pathWithQuery) {
  const group = groupFor(groups, userAgent);
  if (!group) return { allowed: true, crawlDelay: null };
  let best = null;
  for (const rule of group.rules) {
    if (!ruleMatches(rule.path, pathWithQuery)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
      best = rule;
    }
  }
  return { allowed: best ? best.allow : true, crawlDelay: group.crawlDelay };
}
