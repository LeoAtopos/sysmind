import { KeyboardShortcuts, ShortcutConfig } from '../types';

const COMPATIBLE_SHORTCUT_GROUPS: Array<Array<keyof KeyboardShortcuts>> = [
  ['createNode', 'createConnection'],
];

export function formatShortcutLabel(config: ShortcutConfig, ctrlKey: string): string {
  const parts: string[] = [];
  if (config.ctrl) parts.push(ctrlKey);
  if (config.meta && ctrlKey !== 'Cmd') parts.push('Cmd');
  if (config.alt) parts.push('Alt');
  if (config.shift) parts.push('Shift');

  if (config.key === ' ') {
    parts.push('Space');
  } else if (config.key.startsWith('Arrow')) {
    parts.push(config.key.replace('Arrow', ''));
  } else {
    parts.push(config.key);
  }

  return parts.join('+');
}

export function matchesShortcut(e: KeyboardEvent, config: ShortcutConfig): boolean {
  const keyMatch =
    e.key === config.key ||
    e.code === config.key ||
    (config.key === 'Delete' && e.key === 'Backspace');
  const ctrlMatch = !!(e.ctrlKey || e.metaKey) === !!(config.ctrl || config.meta);
  const shiftMatch = e.shiftKey === !!config.shift;
  const altMatch = e.altKey === !!config.alt;

  return keyMatch && ctrlMatch && shiftMatch && altMatch;
}

export function getShortcutConflicts(current: KeyboardShortcuts, ctrlKey: string): Set<string> {
  const seen = new Map<string, keyof KeyboardShortcuts>();
  const conflicts = new Set<string>();

  (Object.entries(current) as Array<[keyof KeyboardShortcuts, ShortcutConfig]>).forEach(([action, config]) => {
    const keyStr = formatShortcutLabel(config, ctrlKey);

    if (!seen.has(keyStr)) {
      seen.set(keyStr, action);
      return;
    }

    const existingAction = seen.get(keyStr)!;
    const isCompatible = COMPATIBLE_SHORTCUT_GROUPS.some(group => group.includes(action) && group.includes(existingAction));

    if (!isCompatible) {
      conflicts.add(action);
      conflicts.add(existingAction);
    }
  });

  return conflicts;
}
