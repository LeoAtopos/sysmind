
export type ConnectionStyle = 'forward' | 'backward' | 'both' | 'none';

export interface Node {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string | null; // null if pending
  text: string;
  style: ConnectionStyle;
  tempToPos?: { x: number; y: number };
}

export type FocusedElement = 
  | { type: 'node'; id: string }
  | { type: 'connection'; id: string }
  | null;
