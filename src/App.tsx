/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ArrowRight, ArrowLeft, ArrowLeftRight, Minus, Trash2, MousePointer2 } from 'lucide-react';
import { Node, Connection, ConnectionStyle, FocusedElement } from './types';

const GRID_SIZE = 20;
const NODE_WIDTH = 120;
const NODE_HEIGHT = 40;

const measureText = (text: string, font: string) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (context) {
    context.font = font;
    return context.measureText(text).width;
  }
  return text.length * 8;
};

const TRANSLATIONS = {
  zh: {
    connLength: '连线长度',
    enter: '新建节点/连接',
    space: '编辑文字',
    tab: '切换样式',
    ctrlArrows: '对齐方向',
    search: '搜索链接',
    undo: '撤销',
    redo: '还原',
    arrows: '移动焦点',
    delete: '删除',
    searchPlaceholder: '搜索节点进行链接...',
    noNodesFound: '未找到节点',
    untitledNode: '无标题节点',
    newNode: '新节点',
    style: '样式:',
    tabToCycle: '按 Tab 键切换'
  },
  en: {
    connLength: 'Conn Length',
    enter: 'New Node / Connect',
    space: 'Edit Text',
    tab: 'Cycle Style',
    ctrlArrows: 'Snap Dir',
    search: 'Search Link',
    undo: 'Undo',
    redo: 'Redo',
    arrows: 'Move Focus',
    delete: 'Delete',
    searchPlaceholder: 'Search nodes to link...',
    noNodesFound: 'No nodes found',
    untitledNode: 'Untitled Node',
    newNode: 'New Node',
    style: 'Style:',
    tabToCycle: 'Press Tab to cycle'
  }
};

export default function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [focused, setFocused] = useState<FocusedElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [shouldSelect, setShouldSelect] = useState(true);
  const [lastStyle, setLastStyle] = useState<ConnectionStyle>('forward');
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Node[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [defaultOffset, setDefaultOffset] = useState(100);
  const [lastDirection, setLastDirection] = useState({ x: 100 + 128, y: 0 });

  // Undo/Redo State
  const [history, setHistory] = useState<{
    stack: { nodes: Node[], connections: Connection[], focused: FocusedElement }[],
    index: number
  }>({
    stack: [{ nodes: [], connections: [], focused: null }],
    index: 0
  });

  const pushHistory = useCallback((currentNodes: Node[], currentConnections: Connection[], currentFocused: FocusedElement) => {
    setHistory(prev => {
      const newStack = prev.stack.slice(0, prev.index + 1);
      const last = newStack[newStack.length - 1];
      if (last && JSON.stringify(last.nodes) === JSON.stringify(currentNodes) && 
          JSON.stringify(last.connections) === JSON.stringify(currentConnections) &&
          JSON.stringify(last.focused) === JSON.stringify(currentFocused)) {
        return prev;
      }
      return {
        stack: [...newStack, { nodes: currentNodes, connections: currentConnections, focused: currentFocused }],
        index: newStack.length
      };
    });
  }, []);

  const updateFocus = useCallback((nextFocused: FocusedElement) => {
    setFocused(nextFocused);
    pushHistory(nodes, connections, nextFocused);
  }, [nodes, connections, pushHistory]);

  const undo = useCallback(() => {
    if (history.index > 0) {
      const nextIndex = history.index - 1;
      const state = history.stack[nextIndex];
      setNodes(state.nodes);
      setConnections(state.connections);
      setFocused(state.focused);
      setHistory(prev => ({ ...prev, index: nextIndex }));
    } else if (history.index === 0) {
      setNodes([]);
      setConnections([]);
      setFocused(null);
      setHistory(prev => ({ ...prev, index: -1 }));
    }
  }, [history]);

  const redo = useCallback(() => {
    if (history.index < history.stack.length - 1) {
      const nextIndex = history.index + 1;
      const state = history.stack[nextIndex];
      setNodes(state.nodes);
      setConnections(state.connections);
      setFocused(state.focused);
      setHistory(prev => ({ ...prev, index: nextIndex }));
    }
  }, [history]);

  // No initialization effect needed as we initialize in useState

  const t = useMemo(() => {
    const lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
    return TRANSLATIONS[lang];
  }, []);

  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Helper to get element by ID
  const getNode = (id: string) => nodes.find(n => n.id === id);
  const getConnection = (id: string) => connections.find(c => c.id === id);

  // Helper to calculate intersection with node boundary
  const getNodeRadius = (dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return 0;
    const hw = NODE_WIDTH / 2 + 4;
    const hh = NODE_HEIGHT / 2 + 4;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const scaleX = absDx === 0 ? Infinity : hw / (absDx / dist);
    const scaleY = absDy === 0 ? Infinity : hh / (absDy / dist);
    return Math.min(scaleX, scaleY);
  };

  const handleConnectionTextChange = (connId: string, newText: string) => {
    const textWidth = measureText(newText, '500 10px Inter, ui-sans-serif, system-ui, sans-serif');
    const edgeToEdgeDist = Math.max(defaultOffset, textWidth + 80);

    setConnections(prev => prev.map(c => {
      if (c.id !== connId) return c;
      
      let updatedConn = { ...c, text: newText };
      
      // If it's a pending connection, update tempToPos (only expand while typing)
      if (!c.toId && c.tempToPos) {
        const fromNode = nodes.find(n => n.id === c.fromId);
        if (fromNode) {
          const dx = c.tempToPos.x - fromNode.x;
          const dy = c.tempToPos.y - fromNode.y;
          const currentCenterDist = Math.sqrt(dx * dx + dy * dy);
          const radius = getNodeRadius(dx, dy);
          const requiredCenterDist = edgeToEdgeDist + 2 * radius;
          
          if (currentCenterDist > 0 && currentCenterDist < requiredCenterDist) {
            const scale = requiredCenterDist / currentCenterDist;
            updatedConn.tempToPos = {
              x: fromNode.x + dx * scale,
              y: fromNode.y + dy * scale
            };
          }
        }
      }
      return updatedConn;
    }));
    
    // If it has a target node, push it (only expand while typing)
    const conn = connections.find(c => c.id === connId);
    if (conn && conn.toId) {
      const fromNode = nodes.find(n => n.id === conn.fromId);
      const toNode = nodes.find(n => n.id === conn.toId);
      
      if (fromNode && toNode) {
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const currentCenterDist = Math.sqrt(dx * dx + dy * dy);
        const radius = getNodeRadius(dx, dy);
        const requiredCenterDist = edgeToEdgeDist + 2 * radius;
        
        if (currentCenterDist > 0 && currentCenterDist < requiredCenterDist) {
          const scale = requiredCenterDist / currentCenterDist;
          setNodes(prev => prev.map(n => n.id === toNode.id ? {
            ...n,
            x: fromNode.x + dx * scale,
            y: fromNode.y + dy * scale
          } : n));
        }
      }
    }
  };

  const finalizeConnectionLength = (connId: string) => {
    const conn = getConnection(connId);
    if (!conn) return;

    const textWidth = measureText(conn.text, '500 10px Inter, ui-sans-serif, system-ui, sans-serif');
    const edgeToEdgeDist = Math.max(defaultOffset, textWidth + 80);

    const fromNode = getNode(conn.fromId);
    const toNode = conn.toId ? getNode(conn.toId) : null;
    const toPos = toNode ? { x: toNode.x, y: toNode.y } : conn.tempToPos;

    if (fromNode && toPos) {
      const dx = toPos.x - fromNode.x;
      const dy = toPos.y - fromNode.y;
      const currentCenterDist = Math.sqrt(dx * dx + dy * dy);
      const radius = getNodeRadius(dx, dy);
      const targetCenterDist = edgeToEdgeDist + 2 * radius;

      if (currentCenterDist > 0) {
        const scale = targetCenterDist / currentCenterDist;
        const newX = fromNode.x + dx * scale;
        const newY = fromNode.y + dy * scale;

        if (conn.toId) {
          const nextNodes = nodes.map(n => n.id === conn.toId ? { ...n, x: newX, y: newY } : n);
          setNodes(nextNodes);
          pushHistory(nextNodes, connections, focused);
        } else {
          const nextConns = connections.map(c => c.id === conn.id ? { ...c, tempToPos: { x: newX, y: newY } } : c);
          setConnections(nextConns);
          pushHistory(nodes, nextConns, focused);
        }
        setLastDirection({ x: dx * scale, y: dy * scale });
      }
    }
  };

  // Create a new node
  const createNode = (x: number, y: number, text = '') => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNode = { id, x, y, text };
    setNodes(prev => [...prev, newNode]);
    return newNode;
  };

  // Create a new connection
  const createConnection = (fromId: string, toId: string | null = null, tempPos?: { x: number; y: number }) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newConn: Connection = {
      id,
      fromId,
      toId,
      text: '',
      style: lastStyle,
      tempToPos: tempPos
    };
    setConnections(prev => [...prev, newConn]);
    return newConn;
  };

  // Keyboard Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If editing text, handle finish/cancel
      if (isEditing) {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          if (focused?.type === 'connection') {
            finalizeConnectionLength(focused.id);
          } else {
            pushHistory(nodes, connections, focused);
          }
          setIsEditing(false);
        }
        return;
      }

      // Global Shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      // If an input is already focused (pre-focused), let characters pass through to start IME
      if (e.target === inputRef.current && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Special case: if it's '/' on a connection, we want the search shortcut instead of typing
        if (focused?.type === 'connection' && e.key === '/') {
          // Fall through to the specific handler below
        } else {
          setIsEditing(true);
          return;
        }
      }

      // If searching, handle search specific keys
      if (searchQuery !== null) {
        if (e.key === 'Escape') {
          setSearchQuery(null);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % searchResults.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const target = searchResults[selectedIndex];
          if (target && focused?.type === 'connection') {
            const nextConns = connections.map(c => 
              c.id === focused.id ? { ...c, toId: target.id, tempToPos: undefined } : c
            );
            setConnections(nextConns);
            pushHistory(nodes, nextConns, focused);
            setSearchQuery(null);
          }
          return;
        }
        return;
      }

      // Global Canvas Actions
      if (!focused) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const newNode = createNode(-canvasOffset.x + window.innerWidth / 2, -canvasOffset.y + window.innerHeight / 2);
          const nextFocused = { type: 'node', id: newNode.id };
          setFocused(nextFocused);
          setShouldSelect(true);
          setIsEditing(true);
          pushHistory([...nodes, newNode], connections, nextFocused);
        }
        return;
      }

      // Node Focused Actions
      if (focused.type === 'node') {
        const node = getNode(focused.id);
        if (!node) return;

        if (e.key === ' ') {
          e.preventDefault();
          setShouldSelect(true);
          setIsEditing(true);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const newConn = createConnection(node.id, null, { x: node.x + lastDirection.x, y: node.y + lastDirection.y });
          const nextFocused = { type: 'connection', id: newConn.id };
          setFocused(nextFocused);
          pushHistory(nodes, [...connections, newConn], nextFocused);
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // Just trigger editing mode, browser handles the character
          setIsEditing(true);
        } else if (e.key === 'Tab') {
          e.preventDefault();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          const newNodes = nodes.filter(n => n.id !== node.id);
          const newConns = connections.filter(c => c.fromId !== node.id && c.toId !== node.id);
          setNodes(newNodes);
          setConnections(newConns);
          setFocused(null);
          pushHistory(newNodes, newConns, null);
        } else if ((e.ctrlKey || e.metaKey) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const step = 20;
          let dx = 0;
          let dy = 0;
          if (e.key === 'ArrowRight') dx = step;
          if (e.key === 'ArrowLeft') dx = -step;
          if (e.key === 'ArrowDown') dy = step;
          if (e.key === 'ArrowUp') dy = -step;
          setNodes(prev => prev.map(n => n.id === node.id ? { ...n, x: n.x + dx, y: n.y + dy } : n));
        } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          moveFocus(e.key);
        }
      }

      // Connection Focused Actions
      if (focused.type === 'connection') {
        const conn = getConnection(focused.id);
        if (!conn) return;

        if (e.key === 'Tab') {
          e.preventDefault();
          const styles: ConnectionStyle[] = ['forward', 'backward', 'both', 'none'];
          const nextStyle = styles[(styles.indexOf(conn.style) + 1) % styles.length];
          const nextConns = connections.map(c => c.id === conn.id ? { ...c, style: nextStyle } : c);
          setConnections(nextConns);
          pushHistory(nodes, nextConns, focused);
          setLastStyle(nextStyle);
        } else if (e.key === ' ') {
          e.preventDefault();
          setShouldSelect(true);
          setIsEditing(true);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (!conn.toId) {
            const fromNode = getNode(conn.fromId);
            const x = conn.tempToPos?.x ?? (fromNode ? fromNode.x + lastDirection.x : 0);
            const y = conn.tempToPos?.y ?? (fromNode ? fromNode.y + lastDirection.y : 0);
            const newNode = createNode(x, y);
            const nextConns = connections.map(c => c.id === conn.id ? { ...c, toId: newNode.id, tempToPos: undefined } : c);
            setConnections(nextConns);
            const nextFocused = { type: 'node', id: newNode.id };
            setFocused(nextFocused);
            setShouldSelect(true);
            setIsEditing(true);
            pushHistory([...nodes, newNode], nextConns, nextFocused);
          } else {
            // If already connected, maybe move focus to the target node
            updateFocus({ type: 'node', id: conn.toId });
          }
        } else if (e.key === '/') {
          e.preventDefault();
          setSearchQuery('');
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          const newConns = connections.filter(c => c.id !== conn.id);
          setConnections(newConns);
          setFocused(null);
          pushHistory(nodes, newConns, null);
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // Just trigger editing mode, browser handles the character
          setIsEditing(true);
        } else if ((e.ctrlKey || e.metaKey) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const fromNode = getNode(conn.fromId);
          if (!fromNode) return;

          let edgeToEdgeDist = defaultOffset;
          if (conn.text) {
            const textWidth = measureText(conn.text, '500 10px Inter, ui-sans-serif, system-ui, sans-serif');
            edgeToEdgeDist = Math.max(defaultOffset, textWidth + 80);
          }

          let dx = 0;
          let dy = 0;
          if (e.key === 'ArrowRight') dx = 1;
          if (e.key === 'ArrowLeft') dx = -1;
          if (e.key === 'ArrowDown') dy = 1;
          if (e.key === 'ArrowUp') dy = -1;

          const radius = getNodeRadius(dx, dy);
          const targetCenterDist = edgeToEdgeDist + 2 * radius;
          
          const finalDx = dx * targetCenterDist;
          const finalDy = dy * targetCenterDist;

          const newX = fromNode.x + finalDx;
          const newY = fromNode.y + finalDy;
          setLastDirection({ x: finalDx, y: finalDy });

          if (conn.toId) {
            const nextNodes = nodes.map(n => n.id === conn.toId ? { ...n, x: newX, y: newY } : n);
            setNodes(nextNodes);
            pushHistory(nextNodes, connections, focused);
          } else {
            const nextConns = connections.map(c => c.id === conn.id ? { ...c, tempToPos: { x: newX, y: newY } } : c);
            setConnections(nextConns);
            pushHistory(nodes, nextConns, focused);
          }
        } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          moveFocus(e.key);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const handleKeyUp = (e: KeyboardEvent) => {
      if (((e.ctrlKey || e.metaKey) || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) && focused?.type === 'node' && !isEditing) {
        pushHistory(nodes, connections, focused);
      }
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [focused, isEditing, nodes, connections, canvasOffset, searchQuery, searchResults, selectedIndex, lastStyle, defaultOffset]);

  // Spatial Navigation
  const moveFocus = (key: string) => {
    if (!focused) return;
    
    let currentPos = { x: 0, y: 0 };
    if (focused.type === 'node') {
      const node = getNode(focused.id);
      if (node) currentPos = { x: node.x, y: node.y };
    } else {
      const conn = getConnection(focused.id);
      if (conn) {
        const from = getNode(conn.fromId);
        const to = conn.toId ? getNode(conn.toId) : null;
        const toPos = to ? { x: to.x, y: to.y } : (conn.tempToPos || { x: 0, y: 0 });
        if (from) currentPos = { x: (from.x + toPos.x) / 2, y: (from.y + toPos.y) / 2 };
      }
    }

    const candidates: { type: 'node' | 'connection', id: string, x: number, y: number }[] = [];
    nodes.forEach(n => {
      if (focused.type === 'node' && focused.id === n.id) return;
      candidates.push({ type: 'node', id: n.id, x: n.x, y: n.y });
    });
    connections.forEach(c => {
      if (focused.type === 'connection' && focused.id === c.id) return;
      const from = getNode(c.fromId);
      const to = c.toId ? getNode(c.toId) : null;
      const toPos = to ? { x: to.x, y: to.y } : (c.tempToPos || { x: 0, y: 0 });
      if (from) candidates.push({ type: 'connection', id: c.id, x: (from.x + toPos.x) / 2, y: (from.y + toPos.y) / 2 });
    });

    let best: typeof candidates[0] | null = null;
    let minScore = Infinity;

    candidates.forEach(cand => {
      const dx = cand.x - currentPos.x;
      const dy = cand.y - currentPos.y;
      
      let isCorrectDirection = false;
      if (key === 'ArrowRight' && dx > 0 && Math.abs(dy) < Math.abs(dx)) isCorrectDirection = true;
      if (key === 'ArrowLeft' && dx < 0 && Math.abs(dy) < Math.abs(dx)) isCorrectDirection = true;
      if (key === 'ArrowDown' && dy > 0 && Math.abs(dx) < Math.abs(dy)) isCorrectDirection = true;
      if (key === 'ArrowUp' && dy < 0 && Math.abs(dx) < Math.abs(dy)) isCorrectDirection = true;

      if (isCorrectDirection) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minScore) {
          minScore = dist;
          best = cand;
        }
      }
    });

    if (best) {
      updateFocus({ type: (best as any).type, id: (best as any).id });
    }
  };

  // Search logic
  useEffect(() => {
    if (searchQuery !== null) {
      const filtered = nodes.filter(n => n.text.toLowerCase().includes(searchQuery.toLowerCase()));
      setSearchResults(filtered);
      setSelectedIndex(0);
    }
  }, [searchQuery, nodes]);

  // Dragging logic
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDraggingNode(nodeId);
    updateFocus({ type: 'node', id: nodeId });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingNode) {
      setNodes(prev => prev.map(n => n.id === draggingNode ? { ...n, x: n.x + e.movementX, y: n.y + e.movementY } : n));
    } else if (isPanning) {
      setCanvasOffset(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
    }
  };

  const handleMouseUp = () => {
    if (draggingNode) {
      pushHistory(nodes, connections, focused);
    }
    setDraggingNode(null);
    setIsPanning(false);
  };

  // Camera Tracking
  useEffect(() => {
    if (focused && inputRef.current) {
      inputRef.current.focus();
    }
    
    if (!focused || isPanning || draggingNode) return;

    let targetX = 0;
    let targetY = 0;

    if (focused.type === 'node') {
      const node = getNode(focused.id);
      if (node) {
        targetX = node.x;
        targetY = node.y;
      }
    } else {
      const conn = getConnection(focused.id);
      if (conn) {
        const from = getNode(conn.fromId);
        const to = conn.toId ? getNode(conn.toId) : null;
        const toPos = to ? { x: to.x, y: to.y } : (conn.tempToPos || { x: 0, y: 0 });
        if (from) {
          targetX = (from.x + toPos.x) / 2;
          targetY = (from.y + toPos.y) / 2;
        }
      }
    }

    if (targetX !== 0 || targetY !== 0) {
      setCanvasOffset({
        x: window.innerWidth / 2 - targetX,
        y: window.innerHeight / 2 - targetY
      });
    }
  }, [focused, nodes, connections, isPanning, draggingNode]);

  // Auto-focus input
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (shouldSelect) {
        inputRef.current.select();
        setShouldSelect(false);
      }
    }
  }, [isEditing, shouldSelect]);

  // Helper to calculate intersection with node boundary
  const getEdgePoint = (from: { x: number; y: number }, to: { x: number; y: number }, nodeId?: string) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return to;

    const isNodeFocused = nodeId ? (focused?.type === 'node' && focused.id === nodeId) : false;
    const scaleFactor = isNodeFocused ? 1.05 : 1;

    // Add a small padding (1px) to ensure the arrowhead tip touches the node boundary
    const hw = (NODE_WIDTH * scaleFactor) / 2 + 1;
    const hh = (NODE_HEIGHT * scaleFactor) / 2 + 1;

    const scaleX = dx === 0 ? Infinity : Math.abs(hw / dx);
    const scaleY = dy === 0 ? Infinity : Math.abs(hh / dy);
    const scale = Math.min(scaleX, scaleY);

    return {
      x: to.x - dx * scale,
      y: to.y - dy * scale
    };
  };

  useEffect(() => {
    if (searchQuery !== null && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchQuery]);

  return (
    <div 
      className="w-full h-screen bg-[#F8F9FA] overflow-hidden relative font-sans select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseDown={() => {
        updateFocus(null);
        setIsPanning(true);
      }}
    >
      {/* Grid Pattern */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(#000 1px, transparent 0)`,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          transform: `translate(${canvasOffset.x % GRID_SIZE}px, ${canvasOffset.y % GRID_SIZE}px)`
        }}
      />

      <motion.div 
        className="absolute inset-0"
        animate={{ x: canvasOffset.x, y: canvasOffset.y }}
        transition={(isPanning || draggingNode || (focused && !isEditing)) ? { duration: 0 } : { type: 'spring', stiffness: 150, damping: 25, mass: 0.8 }}
      >
        {/* Connections */}
        <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none overflow-visible">
          <defs>
            <marker id="arrowhead-end" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M 7 2 L 11 6 L 7 10" fill="none" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrowhead-start" markerWidth="12" markerHeight="12" refX="1" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M 5 2 L 1 6 L 5 10" fill="none" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrowhead-end-focused" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M 7 2 L 11 6 L 7 10" fill="none" stroke="#3B82F6" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrowhead-start-focused" markerWidth="12" markerHeight="12" refX="1" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M 5 2 L 1 6 L 5 10" fill="none" stroke="#3B82F6" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {connections.map(conn => {
            const fromNode = getNode(conn.fromId);
            const toNode = conn.toId ? getNode(conn.toId) : null;
            if (!fromNode) return null;

            const rawStartX = fromNode.x;
            const rawStartY = fromNode.y;
            const rawEndX = toNode ? toNode.x : (conn.tempToPos?.x ?? rawStartX + lastDirection.x);
            const rawEndY = toNode ? toNode.y : (conn.tempToPos?.y ?? rawStartY + lastDirection.y);

            // Calculate edge points for both start and end to avoid occlusion
            const startPoint = getEdgePoint({ x: rawEndX, y: rawEndY }, { x: rawStartX, y: rawStartY }, fromNode.id);
            const endPoint = getEdgePoint({ x: rawStartX, y: rawStartY }, { x: rawEndX, y: rawEndY }, toNode?.id);

            const startX = startPoint.x;
            const startY = startPoint.y;
            const endX = endPoint.x;
            const endY = endPoint.y;

            const isFocused = focused?.type === 'connection' && focused.id === conn.id;
            const color = isFocused ? '#3B82F6' : '#94A3B8';
            const strokeWidth = isFocused ? 3 : 2;

            const textWidth = measureText(conn.text, '500 10px Inter, ui-sans-serif, system-ui, sans-serif');
            const labelWidth = Math.max(40, textWidth + 20);

            return (
              <g key={conn.id} className="pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); updateFocus({ type: 'connection', id: conn.id }); }}>
                <path
                  d={`M ${startX} ${startY} L ${endX} ${endY}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  markerEnd={['forward', 'both'].includes(conn.style) ? `url(#${isFocused ? 'arrowhead-end-focused' : 'arrowhead-end'})` : undefined}
                  markerStart={['backward', 'both'].includes(conn.style) ? `url(#${isFocused ? 'arrowhead-start-focused' : 'arrowhead-start'})` : undefined}
                  className="transition-colors duration-200"
                />
                {/* Connection Label */}
                {(conn.text || isFocused) && (
                  <foreignObject 
                    x={(startX + endX) / 2 - labelWidth / 2} 
                    y={(startY + endY) / 2 - 15} 
                    width={labelWidth} 
                    height="30"
                  >
                    <div className="flex items-center justify-center h-full relative">
                      {isFocused && (
                        <input
                          ref={inputRef}
                          className={`absolute inset-0 w-full bg-white border-2 border-blue-500 rounded px-1 text-xs text-center outline-none shadow-lg transition-opacity z-10
                            ${isEditing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                          value={conn.text}
                          onChange={(e) => {
                            if (!isEditing) setIsEditing(true);
                            handleConnectionTextChange(conn.id, e.target.value);
                          }}
                          onBlur={() => {
                            if (isEditing) {
                              finalizeConnectionLength(conn.id);
                              setIsEditing(false);
                              pushHistory(nodes, connections, focused);
                            }
                          }}
                        />
                      )}
                      {!(isFocused && isEditing) && conn.text && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/80 backdrop-blur-sm border border-slate-200 text-slate-600 font-medium shadow-sm whitespace-nowrap relative z-0">
                          {conn.text}
                        </span>
                      )}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map(node => {
          const isFocused = focused?.type === 'node' && focused.id === node.id;
          return (
            <motion.div
              key={node.id}
              initial={false}
              animate={{ 
                x: node.x - NODE_WIDTH / 2, 
                y: node.y - NODE_HEIGHT / 2,
                scale: isFocused ? 1.05 : 1
              }}
              transition={{ 
                type: 'spring', 
                stiffness: 300, 
                damping: 30,
                x: { duration: (draggingNode === node.id || isFocused) ? 0 : undefined },
                y: { duration: (draggingNode === node.id || isFocused) ? 0 : undefined },
                scale: { type: 'spring', stiffness: 300, damping: 30 }
              }}
              onMouseDown={(e) => handleMouseDown(e, node.id)}
              className={`absolute w-[120px] h-[40px] flex items-center justify-center rounded-xl border-2 transition-all duration-200 cursor-grab active:cursor-grabbing
                ${isFocused 
                  ? 'bg-blue-50 border-blue-500 shadow-lg z-20' 
                  : 'bg-white border-slate-200 shadow-sm hover:border-slate-300 z-10'
                }`}
            >
              {isFocused && (
                <input
                  ref={inputRef}
                  className={`absolute inset-0 w-full h-full bg-white rounded-xl text-center outline-none px-2 font-medium text-slate-800 transition-opacity z-10
                    ${isEditing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                  value={node.text}
                  onChange={(e) => {
                    if (!isEditing) setIsEditing(true);
                    setNodes(prev => prev.map(n => n.id === node.id ? { ...n, text: e.target.value } : n));
                  }}
                  onBlur={() => {
                    if (isEditing) {
                      setIsEditing(false);
                      pushHistory(nodes, connections, focused);
                    }
                  }}
                />
              )}
              {!(isFocused && isEditing) && (
                <span className="text-sm font-medium text-slate-700 truncate px-2 relative z-0">
                  {node.text || <span className="text-slate-300 italic">{t.newNode}</span>}
                </span>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Search Overlay */}
      <AnimatePresence>
        {searchQuery !== null && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-12 left-1/2 -translate-x-1/2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50"
          >
            <div className="p-3 border-bottom border-slate-100 flex items-center gap-2">
              <Search size={16} className="text-slate-400" />
              <input
                ref={searchInputRef}
                className="flex-1 outline-none text-sm text-slate-700"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {searchResults.length > 0 ? (
                searchResults.map((node, idx) => (
                  <div
                    key={node.id}
                    className={`px-4 py-2 text-sm cursor-pointer flex items-center justify-between ${idx === selectedIndex ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}
                    onClick={() => {
                      if (focused?.type === 'connection') {
                        setConnections(prev => prev.map(c => c.id === focused.id ? { ...c, toId: node.id, tempToPos: undefined } : c));
                        setSearchQuery(null);
                      }
                    }}
                  >
                    <span>{node.text || t.untitledNode}</span>
                    {idx === selectedIndex && <ArrowRight size={14} />}
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-slate-400 text-xs">
                  {t.noNodesFound}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls Help */}
      <div className="absolute top-6 left-6 flex flex-col gap-4">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <MousePointer2 className="text-blue-500" /> SysMind
          </h1>
          <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-slate-200 px-3 py-1.5 rounded-xl shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t.connLength}</span>
            <input 
              type="number" 
              value={defaultOffset} 
              onChange={(e) => setDefaultOffset(Number(e.target.value))}
              className="w-16 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 text-sm font-bold text-blue-600 outline-none focus:border-blue-400 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1 bg-white/80 backdrop-blur-sm border border-slate-200 p-1 rounded-xl shadow-sm">
            <button 
              onClick={(e) => { e.stopPropagation(); undo(); }}
              disabled={history.index <= 0}
              title={t.undo}
              className="p-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-600"
            >
              <ArrowLeft size={16} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); redo(); }}
              disabled={history.index >= history.stack.length - 1}
              title={t.redo}
              className="p-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-600"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Kbd label="Enter" desc={t.enter} />
          <Kbd label="Space" desc={t.space} />
          <Kbd label="Tab" desc={t.tab} />
          <Kbd label="Ctrl+Arrows" desc={t.ctrlArrows} />
          <Kbd label="/" desc={t.search} />
          <Kbd label="Arrows" desc={t.arrows} />
          <Kbd label="Del" desc={t.delete} />
          <Kbd label="Ctrl+Z" desc={t.undo} />
          <Kbd label="Ctrl+Y" desc={t.redo} />
        </div>
      </div>

      {/* Style Indicator */}
      {focused?.type === 'connection' && (
        <div className="absolute bottom-6 right-6 bg-white px-4 py-2 rounded-full shadow-lg border border-slate-200 flex items-center gap-3 text-sm text-slate-600">
          <span className="font-medium">{t.style}</span>
          {getConnection(focused.id)?.style === 'forward' && <ArrowRight size={18} className="text-blue-500" />}
          {getConnection(focused.id)?.style === 'backward' && <ArrowLeft size={18} className="text-blue-500" />}
          {getConnection(focused.id)?.style === 'both' && <ArrowLeftRight size={18} className="text-blue-500" />}
          {getConnection(focused.id)?.style === 'none' && <Minus size={18} className="text-blue-500" />}
          <span className="text-xs text-slate-400">{t.tabToCycle}</span>
        </div>
      )}
    </div>
  );
}

function Kbd({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-white/80 backdrop-blur-sm border border-slate-200 px-2 py-1 rounded-lg shadow-sm">
      <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-bold text-slate-600 uppercase tracking-wider">{label}</kbd>
      <span className="text-[10px] text-slate-500 font-medium">{desc}</span>
    </div>
  );
}
