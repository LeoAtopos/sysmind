
export type ConnectionStyle = 'forward' | 'backward' | 'both' | 'none';
export type NodeStyle = 'default' | 'text' | 'note' | 'warning';

export interface Node {
  id: string;
  x: number;
  y: number;
  text: string;
  style?: NodeStyle;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string | null; // null if pending
  text: string;
  style: ConnectionStyle;
  tempToPos?: { x: number; y: number };
  curveBend?: number;
  curveBendRatio?: number;
}

export type FocusedElement =
  | { type: 'node'; id: string }
  | { type: 'connection'; id: string }
  | null;

// Keyboard shortcuts configuration
export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export interface KeyboardShortcuts {
  createNode: ShortcutConfig;
  createConnection: ShortcutConfig;
  createNodeBelow: ShortcutConfig;
  returnConnection: ShortcutConfig;
  editText: ShortcutConfig;
  delete: ShortcutConfig;
  undo: ShortcutConfig;
  redo: ShortcutConfig;
  zoomIn: ShortcutConfig;
  zoomOut: ShortcutConfig;
  zoomReset: ShortcutConfig;
  moveUp: ShortcutConfig;
  moveDown: ShortcutConfig;
  moveLeft: ShortcutConfig;
  moveRight: ShortcutConfig;
  cycleStyle: ShortcutConfig;
  search: ShortcutConfig;
  openShortcuts: ShortcutConfig;
}

export const DEFAULT_SHORTCUTS: KeyboardShortcuts = {
  createNode: { key: 'Enter' },
  createConnection: { key: 'Enter' },
  createNodeBelow: { key: 'Enter', shift: true },
  returnConnection: { key: 'Enter', ctrl: true },
  editText: { key: ' ' },
  delete: { key: 'Delete' },
  undo: { key: 'z', ctrl: true },
  redo: { key: 'y', ctrl: true },
  zoomIn: { key: '=', ctrl: true },
  zoomOut: { key: '-', ctrl: true },
  zoomReset: { key: '0', ctrl: true },
  moveUp: { key: 'ArrowUp' },
  moveDown: { key: 'ArrowDown' },
  moveLeft: { key: 'ArrowLeft' },
  moveRight: { key: 'ArrowRight' },
  cycleStyle: { key: 'Tab' },
  search: { key: '/' },
  openShortcuts: { key: '?', shift: true },
};
