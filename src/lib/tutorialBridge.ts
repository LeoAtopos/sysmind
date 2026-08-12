import { Connection, FocusedElement, Node } from '../types';

export const TUTORIAL_CHANNEL = 'sysmind-tutorial-v2';
export const TUTORIAL_QUERY_KEY = 'sysmindTutorialCanvas';

export interface TutorialHistoryState {
  stack: Array<{ nodes: Node[]; connections: Connection[]; focused: FocusedElement }>;
  index: number;
}

export interface TutorialCanvasState {
  nodes: Node[];
  connections: Connection[];
  focused: FocusedElement;
  isEditing: boolean;
  searchQuery: string | null;
  selectedIndex: number;
  canvasView: { x: number; y: number; scale: number };
  selectedNodeIds: string[];
  selectedConnectionIds: string[];
  history: TutorialHistoryState;
  nodeSources: Record<string, string>;
  shortcutsOpen: boolean;
  copySignal: number;
  saveSignal: number;
  actionId: string | null;
}

export interface TutorialScenarioState extends Omit<TutorialCanvasState, 'isEditing' | 'searchQuery' | 'selectedIndex' | 'shortcutsOpen' | 'copySignal' | 'saveSignal' | 'actionId'> {
  isEditing?: boolean;
  searchQuery?: string | null;
  selectedIndex?: number;
}

export type TutorialParentMessage =
  | { channel: typeof TUTORIAL_CHANNEL; kind: 'load-state'; actionId: string; state: TutorialScenarioState }
  | { channel: typeof TUTORIAL_CHANNEL; kind: 'prepare-action'; actionId: string; focused?: FocusedElement; closeSearch?: boolean }
  | { channel: typeof TUTORIAL_CHANNEL; kind: 'restore-state'; actionId: string; state: TutorialCanvasState }
  | { channel: typeof TUTORIAL_CHANNEL; kind: 'set-action-complete'; complete: boolean }
  | { channel: typeof TUTORIAL_CHANNEL; kind: 'simulate-shortcut'; shortcut: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } };

export type TutorialChildMessage =
  | { channel: typeof TUTORIAL_CHANNEL; kind: 'ready' }
  | { channel: typeof TUTORIAL_CHANNEL; kind: 'snapshot'; state: TutorialCanvasState }
  | { channel: typeof TUTORIAL_CHANNEL; kind: 'advance-request' };

export const isTutorialCanvasMode = () => {
  try {
    return new URLSearchParams(window.location.search).get(TUTORIAL_QUERY_KEY) === '1';
  } catch {
    return false;
  }
};
