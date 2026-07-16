function normalizedCommandName(value) {
  return String(value || '').trim().replace(/^\/+/, '');
}

export function getSlashCommandSuggestions(input, commands, limit = 8) {
  const value = String(input || '').trimStart();
  if (!value.startsWith('/') || /\s/.test(value)) return [];
  const query = value.slice(1).toLowerCase();
  const seen = new Set();
  const matches = [];

  for (const command of Array.isArray(commands) ? commands : []) {
    const name = normalizedCommandName(command?.name);
    if (!name || seen.has(name)) continue;
    const description = String(command?.description || '');
    if (query && !name.toLowerCase().includes(query) && !description.toLowerCase().includes(query)) continue;
    seen.add(name);
    matches.push({ ...command, name });
    if (matches.length >= limit) break;
  }

  return matches;
}

export function slashCommandKeyboardAction(key, suggestionsVisible) {
  if (!suggestionsVisible) return key === 'Enter' ? 'submit' : null;
  if (key === 'ArrowDown') return 'next';
  if (key === 'ArrowUp') return 'previous';
  if (key === 'Enter' || key === 'Tab') return 'select';
  if (key === 'Escape') return 'dismiss';
  return null;
}

export function slashCommandSelectionText(command) {
  const name = normalizedCommandName(command?.name);
  return name ? `/${name} ` : '';
}
