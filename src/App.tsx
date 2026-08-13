/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ArrowRight, ArrowLeft, ArrowLeftRight, Minus, Download, Upload, Save, FilePlus2, ChevronDown, ChevronUp, Settings, GraduationCap } from 'lucide-react';

import { QuickStartGuide } from './components/QuickStartGuide';
import { ShortcutsModal } from './components/ShortcutsModal';
import {
  CONNECTION_LABEL_H_PADDING,
  CONNECTION_LABEL_LINE_HEIGHT,
  CONNECTION_LABEL_MAX_WIDTH,
  CONNECTION_LABEL_MIN_HEIGHT,
  CONNECTION_LABEL_MIN_WIDTH,
  CONNECTION_LABEL_V_PADDING,
  GRID_SIZE,
  LANGUAGE_STORAGE_KEY,
  MAX_SCALE,
  MIN_SCALE,
  NODE_HEIGHT,
  NODE_MAX_WIDTH,
  NODE_MIN_HEIGHT,
  NODE_MIN_WIDTH,
  NODE_REPEL_MAX_ITERATIONS,
  NODE_REPEL_PADDING,
  NODE_WIDTH,
  QUICK_START_SEEN_STORAGE_KEY,
  NODE_TEXT_H_PADDING,
  NODE_TEXT_LINE_HEIGHT,
  NODE_TEXT_V_PADDING,
  RETURN_CONN_TARGET_OFFSET_Y,
  THEME_STORAGE_KEY,
  ZOOM_STEP,
} from './lib/constants';
import { createGraphId, getBestEffortFilePath, triggerDownload } from './lib/fileUtils';
import {
  buildConnectionGeometry,
  chooseBestCurveBend,
  getConnectionCurveOffsetRaw,
  getConnectionFocusPoint,
} from './lib/graphGeometry';
import { getNodeCanvasVisual, getNodeStyleClasses, getNodeTextClasses } from './lib/nodePresentation';
import {
  isTutorialCanvasMode,
  TUTORIAL_CHANNEL,
  TutorialCanvasState,
  TutorialParentMessage,
} from './lib/tutorialBridge';
import { formatShortcutLabel, matchesShortcut } from './lib/shortcuts';
import { AppLanguage, TRANSLATIONS } from './lib/translations';
import { Node, Connection, ConnectionStyle, NodeStyle, FocusedElement, KeyboardShortcuts, ShortcutConfig, DEFAULT_SHORTCUTS } from './types';

type PerfDebugState = {
  lastFlushTs: number;
  renderCount: number;
  renderTotalMs: number;
  measureTextCount: number;
  measureTextTotalMs: number;
  adaptiveCount: number;
  adaptiveTotalMs: number;
  overlapCount: number;
  overlapTotalMs: number;
  hoverCount: number;
  hoverTotalMs: number;
  historyCount: number;
  historyTotalMs: number;
};

const getPerfDebugState = (): PerfDebugState | null => {
  if (typeof window === 'undefined') return null;
  const debugWindow = window as typeof window & { __sysmindPerfDebug?: PerfDebugState };
  if (!debugWindow.__sysmindPerfDebug) {
    debugWindow.__sysmindPerfDebug = {
      lastFlushTs: 0,
      renderCount: 0,
      renderTotalMs: 0,
      measureTextCount: 0,
      measureTextTotalMs: 0,
      adaptiveCount: 0,
      adaptiveTotalMs: 0,
      overlapCount: 0,
      overlapTotalMs: 0,
      hoverCount: 0,
      hoverTotalMs: 0,
      historyCount: 0,
      historyTotalMs: 0,
    };
  }
  return debugWindow.__sysmindPerfDebug;
};

const resetPerfDebugCounters = (state: PerfDebugState) => {
  state.renderCount = 0;
  state.renderTotalMs = 0;
  state.measureTextCount = 0;
  state.measureTextTotalMs = 0;
  state.adaptiveCount = 0;
  state.adaptiveTotalMs = 0;
  state.overlapCount = 0;
  state.overlapTotalMs = 0;
  state.hoverCount = 0;
  state.hoverTotalMs = 0;
  state.historyCount = 0;
  state.historyTotalMs = 0;
};

// #region debug-point A:perf-report
// Debug perf reporting — currently disabled (no-op). Enable when running local debug server.
const reportPerfDebug = (_hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E', _location: string, _msg: string, _data: Record<string, unknown>) => {
  // fetch('http://127.0.0.1:7777/event', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     sessionId: 'large-graph-lag',
  //     runId: PERF_DEBUG_RUN_ID,
  //     hypothesisId: _hypothesisId,
  //     location: _location,
  //     msg: `[DEBUG] ${_msg}`,
  //     data: _data,
  //     ts: Date.now(),
  //   }),
  // }).catch(() => {});
};
// #endregion

const textMeasureCache = new Map<string, number>();
const adaptiveTextBoxCache = new Map<string, { width: number; height: number; lines: string[] }>();
const PERF_DEBUG_RUN_ID = 'post-fix';

const textMeasureSpan = typeof document !== 'undefined' ? (() => {
  const el = document.createElement('span');
  el.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;pointer-events:none;top:-9999px;left:-9999px;';
  document.body.appendChild(el);
  return el;
})() : null;

const measureText = (text: string, font: string) => {
  const perfStart = performance.now();
  const cacheKey = `${font}__${text}`;
  const cachedWidth = textMeasureCache.get(cacheKey);
  if (cachedWidth !== undefined) {
    const perfState = getPerfDebugState();
    if (perfState) {
      perfState.measureTextCount += 1;
      perfState.measureTextTotalMs += performance.now() - perfStart;
    }
    return cachedWidth;
  }

  let width: number;
  if (textMeasureSpan) {
    textMeasureSpan.style.font = font;
    textMeasureSpan.textContent = text;
    width = textMeasureSpan.getBoundingClientRect().width;
  } else {
    width = text.length * 8;
  }
  textMeasureCache.set(cacheKey, width);
  const perfState = getPerfDebugState();
  if (perfState) {
    perfState.measureTextCount += 1;
    perfState.measureTextTotalMs += performance.now() - perfStart;
  }
  return width;
};

const isMostlyChineseText = (text: string) => {
  if (!text) return false;
  let chineseCount = 0;
  let totalCount = 0;
  for (const ch of text) {
    if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(ch)) {
      chineseCount += 1;
    }
    if (ch.trim() !== '') {
      totalCount += 1;
    }
  }
  return totalCount > 0 && chineseCount / totalCount >= 0.6;
};

const balancedChineseLines = (text: string, maxCharsPerLine: number) => {
  const chars = Array.from(text);
  if (chars.length <= maxCharsPerLine) return [text];
  const lineCount = Math.ceil(chars.length / maxCharsPerLine);
  const baseSize = Math.floor(chars.length / lineCount);
  const remainder = chars.length % lineCount;
  const lines: string[] = [];
  let idx = 0;
  for (let i = 0; i < lineCount; i += 1) {
    const count = baseSize + (i < remainder ? 1 : 0);
    lines.push(chars.slice(idx, idx + count).join(''));
    idx += count;
  }
  return lines;
};

const wrapTextLines = (text: string, maxTextWidth: number, font: string) => {
  if (!text) return [''];
  if (isMostlyChineseText(text)) {
    const lines = balancedChineseLines(text, 7);
    const widest = Math.max(...lines.map(line => measureText(line, font)), 0);
    if (widest <= maxTextWidth) {
      return lines;
    }
  }

  const lines: string[] = [];
  let piece = '';
  for (const ch of text) {
    const test = piece + ch;
    if (measureText(test, font) <= maxTextWidth) {
      piece = test;
    } else {
      if (piece) lines.push(piece);
      piece = ch;
    }
  }
  if (piece) lines.push(piece);
  return lines.length > 0 ? lines : [''];
};

const getAdaptiveTextBoxSize = (
  text: string,
  config: {
    minWidth: number;
    maxWidth: number;
    hPadding: number;
    vPadding: number;
    lineHeight: number;
    font: string;
    fallbackText?: string;
    minHeight?: number;
  },
) => {
  const perfStart = performance.now();
  const content = text || config.fallbackText || '';
  const cacheKey = [
    content,
    config.minWidth,
    config.maxWidth,
    config.hPadding,
    config.vPadding,
    config.lineHeight,
    config.font,
    config.minHeight ?? 0,
  ].join('__');
  const cachedResult = adaptiveTextBoxCache.get(cacheKey);
  if (cachedResult) {
    const perfState = getPerfDebugState();
    if (perfState) {
      perfState.adaptiveCount += 1;
      perfState.adaptiveTotalMs += performance.now() - perfStart;
    }
    return cachedResult;
  }
  const maxTextWidth = Math.max(1, config.maxWidth - config.hPadding);
  let finalLines = wrapTextLines(content, maxTextWidth, config.font);
  const widest = Math.max(...finalLines.map(line => measureText(line, config.font)), 0);
  let width = Math.max(config.minWidth, Math.min(config.maxWidth, Math.ceil(widest + config.hPadding + 1)));
  for (let iter = 0; iter < 5; iter++) {
    const contentWidth = width - config.hPadding;
    if (contentWidth >= maxTextWidth) break;
    const actualLines = wrapTextLines(content, contentWidth, config.font);
    if (actualLines.length <= finalLines.length) break;
    finalLines = actualLines;
    const w2 = Math.max(...actualLines.map(l => measureText(l, config.font)), 0);
    width = Math.max(config.minWidth, Math.min(config.maxWidth, Math.ceil(w2 + config.hPadding + 1)));
    if (width >= config.maxWidth) break;
  }
  const rawHeight = Math.ceil(finalLines.length * config.lineHeight + config.vPadding);
  const height = Math.max(config.minHeight ?? 0, rawHeight);
  const result = { width, height, lines: finalLines };
  adaptiveTextBoxCache.set(cacheKey, result);
  const perfState = getPerfDebugState();
  if (perfState) {
    perfState.adaptiveCount += 1;
    perfState.adaptiveTotalMs += performance.now() - perfStart;
  }
  return result;
};

const resolveNodeOverlaps = (inputNodes: Node[], lockedNodeId?: string) => {
  const perfStart = performance.now();


  if (inputNodes.length < 2) return inputNodes;

  const nodes = inputNodes.map(n => ({ ...n }));
  const minDistX = NODE_WIDTH + NODE_REPEL_PADDING;
  const minDistY = NODE_HEIGHT + NODE_REPEL_PADDING;

  for (let iter = 0; iter < NODE_REPEL_MAX_ITERATIONS; iter++) {
    let movedInIteration = false;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = minDistX - Math.abs(dx);
        const overlapY = minDistY - Math.abs(dy);

        if (overlapX <= 0 || overlapY <= 0) continue;

        const lockA = lockedNodeId === a.id;
        const lockB = lockedNodeId === b.id;

        const useX = overlapX < overlapY;
        const baseSign = useX
          ? (Math.abs(dx) < 0.001 ? (i % 2 === 0 ? -1 : 1) : Math.sign(dx))
          : (Math.abs(dy) < 0.001 ? (j % 2 === 0 ? -1 : 1) : Math.sign(dy));
        const push = (useX ? overlapX : overlapY) + 0.5;

        let moveA = -baseSign * (push / 2);
        let moveB = baseSign * (push / 2);

        if (lockA && !lockB) {
          moveA = 0;
          moveB = baseSign * push;
        } else if (!lockA && lockB) {
          moveA = -baseSign * push;
          moveB = 0;
        }

        if (useX) {
          if (!lockA) a.x += moveA;
          if (!lockB) b.x += moveB;
        } else {
          if (!lockA) a.y += moveA;
          if (!lockB) b.y += moveB;
        }

        movedInIteration = true;
      }
    }

    if (!movedInIteration) break;
  }

  const changed = nodes.some((n, idx) => n.x !== inputNodes[idx].x || n.y !== inputNodes[idx].y);
  const perfState = getPerfDebugState();
  if (perfState) {
    perfState.overlapCount += 1;
    perfState.overlapTotalMs += performance.now() - perfStart;
  }
  return changed ? nodes : inputNodes;
};


export default function App() {
  const tutorialCanvasMode = useMemo(isTutorialCanvasMode, []);
  const [language, setLanguage] = useState<AppLanguage>(() => {
    try {
      const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLanguage === 'zh' || savedLanguage === 'en') return savedLanguage;
    } catch {
      // Ignore localStorage access failures and fall back to browser language.
    }
    return navigator.language.startsWith('zh') ? 'zh' : 'en';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch {
      // Ignore localStorage access failures and fall back to system preference.
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [nodes, setNodes] = useState<Node[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [focused, setFocused] = useState<FocusedElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [shouldSelect, setShouldSelect] = useState(true);
  const [lastStyle, setLastStyle] = useState<ConnectionStyle>('forward');
  const [canvasView, setCanvasView] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Node[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [defaultOffset, setDefaultOffset] = useState(100);
  const [lastDirection, setLastDirection] = useState({ x: 100 + 128, y: 0 });
  const [loadedFileHandle, setLoadedFileHandle] = useState<any | null>(null);
  const [loadedFileMeta, setLoadedFileMeta] = useState<{ name: string; path: string | null; writable: boolean } | null>(null);
  const [isShortcutsExpanded, setIsShortcutsExpanded] = useState(true);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcuts>(DEFAULT_SHORTCUTS);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isQuickStartOpen, setIsQuickStartOpen] = useState(() => {
    if (tutorialCanvasMode) return false;
    try {
      return window.localStorage.getItem(QUICK_START_SEEN_STORAGE_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tutorialActionId, setTutorialActionId] = useState<string | null>(null);
  const [tutorialActionComplete, setTutorialActionComplete] = useState(false);
  const [tutorialCopySignal, setTutorialCopySignal] = useState(0);
  const [tutorialSaveSignal, setTutorialSaveSignal] = useState(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const tutorialActionCompleteRef = useRef(false);
  const tutorialScenarioLoadedRef = useRef(false);
  const tutorialNodeSourceRef = useRef<Record<string, string>>({});

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);
  const closeQuickStart = useCallback(() => {
    setIsQuickStartOpen(false);
    try {
      window.localStorage.setItem(QUICK_START_SEEN_STORAGE_KEY, '1');
    } catch {
      // The guide can still be closed when localStorage is unavailable.
    }
  }, []);
  const previousGraphSizeRef = useRef({ nodes: 0, connections: 0 });




  const canvasOffset = useMemo(() => ({ x: canvasView.x, y: canvasView.y }), [canvasView.x, canvasView.y]);
  const canvasScale = canvasView.scale;


  // Undo/Redo State
  const [history, setHistory] = useState<{
    stack: { nodes: Node[], connections: Connection[], focused: FocusedElement }[],
    index: number
  }>({
    stack: [{ nodes: [], connections: [], focused: null }],
    index: 0
  });
  const renderPerfStart = performance.now();

  const pushHistory = useCallback((currentNodes: Node[], currentConnections: Connection[], currentFocused: FocusedElement) => {
    const perfStart = performance.now();
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
    const perfState = getPerfDebugState();
    if (perfState) {
      perfState.historyCount += 1;
      perfState.historyTotalMs += performance.now() - perfStart;
    }
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
      setSelectedNodeIds([]);
      setSelectedConnectionIds([]);
      setHistory(prev => ({ ...prev, index: nextIndex }));
    } else if (history.index === 0) {
      setNodes([]);
      setConnections([]);
      setFocused(null);
      setSelectedNodeIds([]);
      setSelectedConnectionIds([]);
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
      setSelectedNodeIds([]);
      setSelectedConnectionIds([]);
      setHistory(prev => ({ ...prev, index: nextIndex }));
    }
  }, [history]);

  // No initialization effect needed as we initialize in useState

  const isMac = useMemo(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent), []);
  const isBrowserApp = true;
  const ctrlKey = isMac ? 'Cmd' : 'Ctrl';

  const t = useMemo(() => TRANSLATIONS[language], [language]);
  const isDarkTheme = theme === 'dark';
  const themeColors = useMemo(() => ({
    canvasBackground: isDarkTheme ? '#0f172a' : '#f8fafc',
    canvasGrid: isDarkTheme ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.04)',
    canvasHintTitle: isDarkTheme ? '#94a3b8' : '#94a3b8',
    canvasHintSubtitle: isDarkTheme ? '#64748b' : '#cbd5e1',
    connectionBase: isDarkTheme ? '#64748b' : '#94a3b8',
    connectionSelected: '#60a5fa',
    connectionFocused: isDarkTheme ? '#93c5fd' : '#3b82f6',
    handleStroke: isDarkTheme ? '#0f172a' : '#ffffff',
    labelBackground: isDarkTheme ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.92)',
    labelBorder: isDarkTheme ? 'rgba(148,163,184,0.24)' : '#E2E8F0',
    labelText: isDarkTheme ? '#E2E8F0' : '#475569',
    nodePlaceholder: isDarkTheme ? '#64748b' : '#cbd5e1',
    shadowFocused: isDarkTheme ? 'rgba(2, 6, 23, 0.5)' : 'rgba(15, 23, 42, 0.22)',
    shadowSelected: isDarkTheme ? 'rgba(2, 6, 23, 0.4)' : 'rgba(15, 23, 42, 0.16)',
    shadowBase: isDarkTheme ? 'rgba(2, 6, 23, 0.32)' : 'rgba(15, 23, 42, 0.12)',
  }), [isDarkTheme]);
  const commonShortcutHints = useMemo(() => ({
    title: t.commonActions,
    items: [
      { label: `${ctrlKey}+ +/-`, desc: t.zoom },
      { label: formatShortcutLabel(shortcuts.zoomReset, ctrlKey), desc: t.zoomReset },
      { label: 'Arrows', desc: t.arrows },
      { label: formatShortcutLabel(shortcuts.undo, ctrlKey), desc: t.undo },
      { label: formatShortcutLabel(shortcuts.redo, ctrlKey), desc: t.redo },
      { label: formatShortcutLabel(shortcuts.save, ctrlKey), desc: t.save },
      { label: formatShortcutLabel(shortcuts.copy, ctrlKey), desc: t.actionCopy },
      { label: formatShortcutLabel(shortcuts.paste, ctrlKey), desc: t.actionPaste },
    ],
  }), [ctrlKey, shortcuts, t]);
  const currentShortcutHints = useMemo(() => {
    if (isEditing && focused?.type === 'node') {
      return {
        title: t.nodeEditingActions,
        items: [
          { label: language === 'zh' ? '输入' : 'Type', desc: t.typeText },
          { label: 'Enter / Esc', desc: t.finishEditing },
        ],
      };
    }

    if (isEditing && focused?.type === 'connection') {
      return {
        title: t.connectionEditingActions,
        items: [
          { label: language === 'zh' ? '输入' : 'Type', desc: t.typeText },
          { label: 'Enter / Esc', desc: t.finishEditing },
        ],
      };
    }

    if (focused?.type === 'node') {
      return {
        title: t.nodeActions,
        items: [
          { label: formatShortcutLabel(shortcuts.editText, ctrlKey), desc: t.space },
          { label: formatShortcutLabel(shortcuts.createConnection, ctrlKey), desc: t.enterNode },
          { label: formatShortcutLabel(shortcuts.createNodeBelow, ctrlKey), desc: t.shiftEnterNode },
          { label: formatShortcutLabel(shortcuts.cycleStyle, ctrlKey), desc: t.tabNode },
          { label: `${ctrlKey}+Arrows`, desc: t.ctrlArrowsNode },
          { label: formatShortcutLabel(shortcuts.delete, ctrlKey), desc: t.deleteNode },
        ],
      };
    }

    if (focused?.type === 'connection') {
      return {
        title: t.connectionActions,
        items: [
          { label: formatShortcutLabel(shortcuts.editText, ctrlKey), desc: t.space },
          { label: formatShortcutLabel(shortcuts.createNode, ctrlKey), desc: t.enterConnection },
          { label: formatShortcutLabel(shortcuts.cycleStyle, ctrlKey), desc: t.tab },
          { label: formatShortcutLabel(shortcuts.search, ctrlKey), desc: t.search },
          { label: `${ctrlKey}+Arrows`, desc: t.ctrlArrowsConnection },
          { label: 'Shift+Arrows', desc: t.adjustCurve },
          { label: 'Shift+Enter', desc: t.straightenLine },
          { label: formatShortcutLabel(shortcuts.delete, ctrlKey), desc: t.deleteConnection },
        ],
      };
    }

    if (focused?.type === 'multi-select') {
      return {
        title: t.multiSelectActions,
        items: [
          { label: `${ctrlKey}+Arrows`, desc: t.ctrlArrowsMoveSelected },
          { label: formatShortcutLabel(shortcuts.delete, ctrlKey), desc: t.deleteSelected },
          { label: formatShortcutLabel(shortcuts.copy, ctrlKey), desc: t.actionCopy },
        ],
      };
    }

    return {
      title: t.emptyFocusActions,
      items: [
        { label: formatShortcutLabel(shortcuts.createNode, ctrlKey), desc: t.enterGlobal },
      ],
    };
  }, [ctrlKey, focused?.type, isEditing, language, shortcuts, t]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skipNextConnectionCenterRef = useRef(false);
  const currentNodeFocusRef = useRef<string | null>(null);
  const previousNodeFocusRef = useRef<string | null>(null);
  const nodeSourceRef = useRef<Record<string, string>>({});
  const currentFocusRef = useRef<FocusedElement>(null);
  const previousFocusRef = useRef<FocusedElement>(null);
  const beforePreviousFocusRef = useRef<FocusedElement>(null);
  const clearBeforePreviousOnNextFocusRef = useRef(false);
  const skipAutoFocusOnceRef = useRef(false);
  const prevFocusedRef = useRef<FocusedElement | null>(null);
  const skipFocusHistorySyncOnceRef = useRef(false);
  const clipboardRef = useRef<{ nodes: Node[]; connections: Connection[] } | null>(null);
  const narrowSelectOnMouseUpRef = useRef<string | null>(null);

  // Native wheel event handler ref to allow adding/removing non-passive listener
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);

  useEffect(() => {
    if (!tutorialCanvasMode) return;
    const animationFrame = window.requestAnimationFrame(() => {
      window.focus();
      canvasRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [tutorialActionId, tutorialCanvasMode]);


  const isSameFocus = (a: FocusedElement, b: FocusedElement) => {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    if (a.type !== b.type) return false;
    if (a.type === 'multi-select' || b.type === 'multi-select') return true;
    return (a as { id: string }).id === (b as { id: string }).id;
  };

  useEffect(() => {
    tutorialActionCompleteRef.current = tutorialActionComplete;
  }, [tutorialActionComplete]);

  useEffect(() => {
    tutorialNodeSourceRef.current = { ...nodeSourceRef.current };
  }, [connections, focused, nodes]);

  useEffect(() => {
    if (!tutorialCanvasMode || !tutorialScenarioLoadedRef.current) return;
    const state: TutorialCanvasState = {
      nodes,
      connections,
      focused,
      isEditing,
      searchQuery,
      selectedIndex,
      canvasView,
      selectedNodeIds,
      selectedConnectionIds,
      history,
      nodeSources: { ...tutorialNodeSourceRef.current },
      shortcutsOpen: isShortcutsModalOpen,
      copySignal: tutorialCopySignal,
      saveSignal: tutorialSaveSignal,
      actionId: tutorialActionId,
    };
    window.parent.postMessage({ channel: TUTORIAL_CHANNEL, kind: 'snapshot', state }, '*');
  }, [canvasView, connections, focused, history, isEditing, isShortcutsModalOpen, nodes, searchQuery, selectedConnectionIds, selectedIndex, selectedNodeIds, tutorialActionId, tutorialCanvasMode, tutorialCopySignal, tutorialSaveSignal]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore localStorage access failures.
    }
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore localStorage access failures.
    }
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);



  useEffect(() => {
    if (focused?.type !== 'node') return;
    if (currentNodeFocusRef.current === focused.id) return;
    previousNodeFocusRef.current = currentNodeFocusRef.current;
    currentNodeFocusRef.current = focused.id;
  }, [focused]);

  useEffect(() => {
    if (skipFocusHistorySyncOnceRef.current) {
      skipFocusHistorySyncOnceRef.current = false;
      if (clearBeforePreviousOnNextFocusRef.current) {
        clearBeforePreviousOnNextFocusRef.current = false;
      }
      return;
    }

    const current = currentFocusRef.current;
    if (isSameFocus(current, focused)) {
      if (clearBeforePreviousOnNextFocusRef.current) {
        clearBeforePreviousOnNextFocusRef.current = false;
      }
      return;
    }


    if (clearBeforePreviousOnNextFocusRef.current) {
      previousFocusRef.current = current;
      beforePreviousFocusRef.current = null;
      clearBeforePreviousOnNextFocusRef.current = false;
    } else {
      beforePreviousFocusRef.current = previousFocusRef.current;
      previousFocusRef.current = current;
    }

    currentFocusRef.current = focused;
  }, [focused]);

  const exportData = useMemo(() => ({
    version: 1,
    nodes,
    connections,
    canvasOffset,
    canvasScale,
    defaultOffset,
    shortcuts,
  }), [nodes, connections, canvasOffset, canvasScale, defaultOffset, shortcuts]);

  const applyImportedData = useCallback((data: any) => {
    // More lenient validation for itch.io compatibility
    if (!data || typeof data !== 'object') {
      throw new Error('invalid');
    }
    const loadedNodes: Node[] = Array.isArray(data.nodes) ? data.nodes : [];
    const loadedConns: Connection[] = Array.isArray(data.connections) ? data.connections : [];
    reportPerfDebug('C', 'App.tsx:applyImportedData', 'import applied', {
      nodes: loadedNodes.length,
      connections: loadedConns.length,
    });
    setNodes(loadedNodes);
    setConnections(loadedConns);
    setFocused(null);
    setCanvasView(prev => ({
      x: typeof data.canvasOffset?.x === 'number' ? data.canvasOffset.x : prev.x,
      y: typeof data.canvasOffset?.y === 'number' ? data.canvasOffset.y : prev.y,
      scale: typeof data.canvasScale === 'number'
        ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, data.canvasScale))
        : prev.scale,
    }));
    if (typeof data.defaultOffset === 'number') setDefaultOffset(data.defaultOffset);
    // Load shortcuts if present, otherwise keep defaults
    if (data.shortcuts && typeof data.shortcuts === 'object') {
      setShortcuts(prev => ({ ...prev, ...data.shortcuts }));
    }
    pushHistory(loadedNodes, loadedConns, null);
  }, [pushHistory]);

  // Export to JSON
  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `sysmind-${new Date().toISOString().slice(0, 10)}.json`);
  }, [exportData]);

  // Export image handled after helper function declarations

  // #region debug-point C:graph-reset-trace
  useEffect(() => {
    const previous = previousGraphSizeRef.current;
    if (
      previous.nodes > 0 &&
      nodes.length === 0
    ) {
      reportPerfDebug('C', 'App.tsx:graph-reset-trace', 'graph cleared after non-empty state', {
        previousNodes: previous.nodes,
        previousConnections: previous.connections,
        nextNodes: nodes.length,
        nextConnections: connections.length,
        historyIndex: history.index,
        historySize: history.stack.length,
        focusedType: focused?.type ?? 'none',
        isEditing,
        isPanning,
      });
    }
    previousGraphSizeRef.current = { nodes: nodes.length, connections: connections.length };
  }, [connections.length, focused?.type, history.index, history.stack.length, isEditing, isPanning, nodes.length]);
  // #endregion

  const handleSaveToLoadedFile = useCallback(async (): Promise<boolean> => {
    try {
      // Check if running in iframe (itch.io) - use download fallback
      const isInIframe = window.self !== window.top;
      if (isInIframe || !(window as any).showSaveFilePicker) {
        // Fallback to download for itch.io
        handleExport();
        return true;
      }

      let targetHandle = loadedFileHandle;
      if (!targetHandle) {
        const suggestedName = loadedFileMeta?.name || `sysmind-${new Date().toISOString().slice(0, 10)}.json`;
        targetHandle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [{
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] },
          }],
        });
        if (!targetHandle) return false;
        setLoadedFileHandle(targetHandle);
        setLoadedFileMeta(prev => ({
          name: targetHandle.name || prev?.name || suggestedName,
          path: null,
          writable: true,
        }));
      }

      if (typeof targetHandle.queryPermission === 'function') {
        let permission = await targetHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted' && typeof targetHandle.requestPermission === 'function') {
          permission = await targetHandle.requestPermission({ mode: 'readwrite' });
        }
        if (permission !== 'granted') {
          throw new Error('permission denied');
        }
      }

      const writable = await targetHandle.createWritable();
      await writable.write(JSON.stringify(exportData, null, 2));
      await writable.close();
      showToast(t.saveSuccess);
      return true;
    } catch (err: any) {
      if (err?.name === 'AbortError') return false;
      const detail = err?.message ? `\n${err.message}` : '';
      showToast(`${t.saveFailed}${detail}`, 'error');
      return false;
    }
  }, [loadedFileHandle, loadedFileMeta, exportData, t, handleExport, showToast]);

  const toggleFullscreen = useCallback(async () => {
    if (!isBrowserApp) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
  }, [isBrowserApp]);

  const handleNewCanvas = useCallback(async () => {
    const saved = await handleSaveToLoadedFile();
    if (!saved) return;
    setNodes([]);
    setConnections([]);
    setFocused(null);
    setIsEditing(false);
    setSearchQuery(null);
    setSearchResults([]);
    setSelectedIndex(0);
    setCanvasView({ x: 0, y: 0, scale: 1 });
    setLoadedFileHandle(null);
    setLoadedFileMeta(null);
    setHistory({
      stack: [{ nodes: [], connections: [], focused: null }],
      index: 0,
    });
  }, [handleSaveToLoadedFile]);

  useEffect(() => {
    if (!tutorialCanvasMode) return;

    const applyTutorialState = (state: TutorialCanvasState | (Omit<TutorialCanvasState, 'isEditing' | 'searchQuery' | 'selectedIndex' | 'shortcutsOpen' | 'copySignal' | 'saveSignal' | 'actionId'> & Partial<TutorialCanvasState>), actionId: string) => {
      setNodes(state.nodes);
      setConnections(state.connections);
      setFocused(state.focused);
      setIsEditing(state.isEditing ?? false);
      setShouldSelect(true);
      setSearchQuery(state.searchQuery ?? null);
      setSelectedIndex(state.selectedIndex ?? 0);
      setCanvasView(state.canvasView);
      setSelectedNodeIds(state.selectedNodeIds);
      setSelectedConnectionIds(state.selectedConnectionIds);
      setHistory(state.history);
      nodeSourceRef.current = { ...state.nodeSources };
      tutorialNodeSourceRef.current = { ...state.nodeSources };
      setIsShortcutsModalOpen(state.shortcutsOpen ?? false);
      setTutorialCopySignal(state.copySignal ?? 0);
      setTutorialSaveSignal(state.saveSignal ?? 0);
      setTutorialActionId(actionId);
      setTutorialActionComplete(false);
      tutorialScenarioLoadedRef.current = true;
      clipboardRef.current = null;
    };

    const handleTutorialMessage = (event: MessageEvent<TutorialParentMessage>) => {
      if (event.source !== window.parent || event.data?.channel !== TUTORIAL_CHANNEL) return;
      const message = event.data;

      if (message.kind === 'load-state' || message.kind === 'restore-state') {
        applyTutorialState(message.state, message.actionId);
        return;
      }

      if (message.kind === 'prepare-action') {
        setTutorialActionId(message.actionId);
        setTutorialActionComplete(false);
        if (message.focused !== undefined) setFocused(message.focused);
        if (message.closeSearch) setSearchQuery(null);
        setIsEditing(false);
        setIsShortcutsModalOpen(false);
        return;
      }

      if (message.kind === 'set-action-complete') {
        setTutorialActionComplete(message.complete);
        return;
      }

      if (message.kind === 'simulate-shortcut') {
        const config = message.shortcut;
        const key = config.key;
        const code = key === ' ' ? 'Space' : key;
        const eventOptions = {
          key,
          code,
          ctrlKey: !!config.ctrl,
          metaKey: !!config.meta,
          shiftKey: !!config.shift,
          altKey: !!config.alt,
          bubbles: true,
          cancelable: true,
        };
        window.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
        window.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
      }
    };

    window.addEventListener('message', handleTutorialMessage);
    window.parent.postMessage({ channel: TUTORIAL_CHANNEL, kind: 'ready' }, '*');
    return () => window.removeEventListener('message', handleTutorialMessage);
  }, [tutorialCanvasMode]);

  const handleImportFromPicker = useCallback(async () => {
    try {
      // Check if running in iframe (itch.io) - fallback to file input
      const isInIframe = window.self !== window.top;
      if (isInIframe || !(window as any).showOpenFilePicker) {
        fileInputRef.current?.click();
        return;
      }
      const [handle] = await (window as any).showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'JSON Files',
          accept: { 'application/json': ['.json'] },
        }],
      });
      if (!handle) return;
      const file = await handle.getFile();
      const content = await file.text();
      const data = JSON.parse(content);
      applyImportedData(data);
      setLoadedFileHandle(handle);
      setLoadedFileMeta({
        name: handle.name || file.name || 'unknown.json',
        path: getBestEffortFilePath(file),
        writable: true,
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Import from picker error:', err);
        showToast(`${t.importError}${err?.message ? ': ' + err.message : ''}`, 'error');
      }
    }
  }, [applyImportedData, getBestEffortFilePath, t, showToast]);


  // Load from JSON
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const pickedPath = e.target.value;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const content = ev.target?.result as string;
        if (!content || content.trim().length === 0) {
          throw new Error('empty file');
        }
        const data = JSON.parse(content);
        applyImportedData(data);
        setLoadedFileHandle(null);
        setLoadedFileMeta({
          name: file.name,
          path: getBestEffortFilePath(file, pickedPath),
          writable: false,
        });
      } catch (err: any) {
        console.error('Import error:', err);
        showToast(`${t.importError}${err?.message ? ': ' + err.message : ''}`, 'error');
      }
    };
    reader.onerror = () => {
      showToast(t.importError + ': Failed to read file', 'error');
    };
    reader.readAsText(file);
    // Reset so same file can be reloaded
    e.target.value = '';
  }, [t, applyImportedData, getBestEffortFilePath, showToast]);



  // Helper to get element by ID
  const nodeMap = useMemo(() => new Map(nodes.map(node => [node.id, node] as const)), [nodes]);
  const connectionMap = useMemo(() => new Map(connections.map(connection => [connection.id, connection] as const)), [connections]);
  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const selectedConnectionIdSet = useMemo(() => new Set(selectedConnectionIds), [selectedConnectionIds]);
  const getNode = (id: string) => nodeMap.get(id);
  const getConnection = (id: string) => connectionMap.get(id);
  const getConnectionFocus = useCallback(
    (conn: Connection) => getConnectionFocusPoint(conn, getNode, lastDirection),
    [getNode, lastDirection],
  );
  const getBestCurveBend = useCallback(
    (fromId: string, toId: string, excludeConnId?: string) =>
      chooseBestCurveBend({ fromId, toId, connections, getNode, excludeConnId }),
    [connections, getNode],
  );

  const getNodeBoxSize = useCallback((nodeText: string) => {
    return getAdaptiveTextBoxSize(nodeText, {
      minWidth: NODE_MIN_WIDTH,
      maxWidth: NODE_MAX_WIDTH,
      hPadding: NODE_TEXT_H_PADDING,
      vPadding: NODE_TEXT_V_PADDING,
      lineHeight: NODE_TEXT_LINE_HEIGHT,
      font: '500 14px Inter, ui-sans-serif, system-ui, sans-serif',
      fallbackText: t.newNode,
      minHeight: NODE_MIN_HEIGHT,
    });
  }, [t.newNode]);

  const getConnectionLabelSize = useCallback((text: string) => {
    return getAdaptiveTextBoxSize(text, {
      minWidth: CONNECTION_LABEL_MIN_WIDTH,
      maxWidth: CONNECTION_LABEL_MAX_WIDTH,
      hPadding: CONNECTION_LABEL_H_PADDING,
      vPadding: CONNECTION_LABEL_V_PADDING,
      lineHeight: CONNECTION_LABEL_LINE_HEIGHT,
      font: '500 10px Inter, ui-sans-serif, system-ui, sans-serif',
      minHeight: CONNECTION_LABEL_MIN_HEIGHT,
    });
  }, []);
  const getConnectionGeometry = useCallback(
    (conn: Connection) =>
      buildConnectionGeometry({
        conn,
        getNode,
        getNodeBoxSize,
        lastDirection,
        isNodeFocused: (nodeId: string) => focused?.type === 'node' && focused.id === nodeId,
      }),
    [focused, getNode, getNodeBoxSize, lastDirection],
  );

  const resolveDeleteFallbackFocus = (
    nextNodes: Node[],
    nextConnections: Connection[],
    deletedPos: { x: number; y: number },
  ): FocusedElement => {
    let best: FocusedElement = null;
    let bestDist = Infinity;

    for (const n of nextNodes) {
      const d = Math.hypot(n.x - deletedPos.x, n.y - deletedPos.y);
      if (d < bestDist) {
        bestDist = d;
        best = { type: 'node', id: n.id };
      }
    }

    for (const c of nextConnections) {
      const from = nextNodes.find(n => n.id === c.fromId);
      if (!from) continue;
      const to = c.toId ? nextNodes.find(n => n.id === c.toId) : null;
      const end = to
        ? { x: to.x, y: to.y }
        : (c.tempToPos ?? { x: from.x + lastDirection.x, y: from.y + lastDirection.y });
      const cx = (from.x + end.x) / 2;
      const cy = (from.y + end.y) / 2;
      const d = Math.hypot(cx - deletedPos.x, cy - deletedPos.y);
      if (d < bestDist) {
        bestDist = d;
        best = { type: 'connection', id: c.id };
      }
    }

    return best;
  };
  const handleConnectionTextChange = (connId: string, newText: string) => {
    setConnections(prev => prev.map(c => c.id === connId ? { ...c, text: newText } : c));
  };

  const finalizeConnectionLength = (_connId: string) => {
    pushHistory(nodes, connections, focused);
  };

  // Create a new node
  const createNode = (x: number, y: number, text = '') => {
    const id = createGraphId();
    const newNode = { id, x, y, text };
    setNodes(prev => [...prev, newNode]);
    return newNode;
  };

  // Create a new connection
  const createConnection = (
    fromId: string,
    toId: string | null = null,
    tempPos?: { x: number; y: number },
    curveBendOverride?: number,
  ) => {
    const id = createGraphId();
    const newConn: Connection = {
      id,
      fromId,
      toId,
      text: '',
      style: lastStyle,
      tempToPos: tempPos,
      curveBend:
        typeof curveBendOverride === 'number'
          ? curveBendOverride
          : (toId
              ? chooseBestCurveBend({ fromId, toId, connections, getNode, excludeConnId: id })
              : 0),
      curveBendRatio: undefined,

    };
    setConnections(prev => [...prev, newConn]);
    return newConn;
  };

  // Port-to-port new connection drag state
  const [draggingNewConnection, setDraggingNewConnection] = useState<{
    fromNodeId: string;
    connId: string;
    port: 'left' | 'right';
  } | null>(null);
  const [hoveredNewConnTarget, setHoveredNewConnTarget] = useState<string | null>(null);

  // Keyboard Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isQuickStartOpen) return;

      if (tutorialCanvasMode && tutorialActionCompleteRef.current && e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage({ channel: TUTORIAL_CHANNEL, kind: 'advance-request' }, '*');
        return;
      }

      if (tutorialCanvasMode) {
        const repeatableActionComplete = tutorialActionCompleteRef.current
          && ['cycle-node-style', 'move-node', 'cycle-connection-style', 'move-endpoint', 'adjust-curve', 'zoom-in', 'zoom-out'].includes(tutorialActionId ?? '');
        if (tutorialActionCompleteRef.current && !repeatableActionComplete) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        const isPlainTextEditingKey = !e.ctrlKey && !e.metaKey && !e.altKey && (
          e.key.length === 1
          || ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', 'Escape'].includes(e.key)
        );
        const isEditingCommand = (e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase());
        const isCtrlArrow = (e.ctrlKey || e.metaKey) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
        const isShiftArrow = e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
        const actionShortcut: Partial<Record<string, ShortcutConfig>> = {
          'create-node': shortcuts.createNode,
          'edit-node': shortcuts.editText,
          'create-connection': shortcuts.createConnection,
          'complete-connection': shortcuts.createNode,
          'create-node-below': shortcuts.createNodeBelow,
          'return-connection': shortcuts.returnConnection,
          'cycle-node-style': shortcuts.cycleStyle,
          'edit-connection': shortcuts.editText,
          'cycle-connection-style': shortcuts.cycleStyle,
          'search-link': shortcuts.search,
          'focus-left': shortcuts.moveLeft,
          'focus-right': shortcuts.moveRight,
          'focus-up': shortcuts.moveUp,
          'focus-down': shortcuts.moveDown,
          'delete-node': shortcuts.delete,
          'delete-connection': shortcuts.delete,
          'zoom-in': shortcuts.zoomIn,
          'zoom-out': shortcuts.zoomOut,
          'zoom-reset': shortcuts.zoomReset,
          undo: shortcuts.undo,
          redo: shortcuts.redo,
          copy: shortcuts.copy,
          paste: shortcuts.paste,
          save: shortcuts.save,
          'open-settings': shortcuts.openShortcuts,
        };

        let allowed = false;
        if (isEditing) {
          allowed = isPlainTextEditingKey || isEditingCommand;
        } else if (searchQuery !== null) {
          allowed = isPlainTextEditingKey
            || isEditingCommand
            || matchesShortcut(e, shortcuts.moveUp)
            || matchesShortcut(e, shortcuts.moveDown)
            || e.key === 'Tab';
        } else if (tutorialActionId === 'move-node' || tutorialActionId === 'move-endpoint') {
          allowed = isCtrlArrow;
        } else if (tutorialActionId === 'adjust-curve') {
          allowed = isShiftArrow;
        } else if (tutorialActionId === 'straighten-line') {
          allowed = e.shiftKey && e.key === 'Enter';
        } else {
          const allowedShortcut = tutorialActionId ? actionShortcut[tutorialActionId] : undefined;
          allowed = !!allowedShortcut && matchesShortcut(e, allowedShortcut);
        }

        if (!allowed) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
      }

      // If editing text, handle finish/cancel
      if (isEditing) {
        if (matchesShortcut(e, shortcuts.save)) {
          e.preventDefault();
          handleSaveToLoadedFile();
          return;
        }
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

      // Open shortcuts modal
      if (matchesShortcut(e, shortcuts.openShortcuts)) {
        e.preventDefault();
        setIsShortcutsModalOpen(true);
        return;
      }

      // Global Shortcuts - Undo/Redo
      if (matchesShortcut(e, shortcuts.undo)) {
        e.preventDefault();
        undo();
        return;
      }
      if (matchesShortcut(e, shortcuts.redo)) {
        e.preventDefault();
        redo();
        return;
      }

      // Save file (override browser's Cmd+S / Ctrl+S)
      if (matchesShortcut(e, shortcuts.save)) {
        e.preventDefault();
        if (tutorialCanvasMode) {
          setTutorialSaveSignal(current => current + 1);
          showToast(t.saveSuccess);
          return;
        }
        handleSaveToLoadedFile();
        return;
      }

      // Copy
      if (matchesShortcut(e, shortcuts.copy)) {
        e.preventDefault();
        const copyNodeIds = new Set<string>();

        if (selectedNodeIds.length > 0) {
          selectedNodeIds.forEach(id => copyNodeIds.add(id));
        } else if (focused?.type === 'node') {
          copyNodeIds.add(focused.id);
        }

        if (copyNodeIds.size === 0) return;

        const copiedNodes = nodes.filter(n => copyNodeIds.has(n.id));
        const copiedConnections = connections.filter(
          c => copyNodeIds.has(c.fromId) && c.toId && copyNodeIds.has(c.toId)
        );

        clipboardRef.current = { nodes: copiedNodes, connections: copiedConnections };
        if (tutorialCanvasMode) setTutorialCopySignal(current => current + 1);
        showToast(`${t.copySuccess} (${copiedNodes.length})`);
        return;
      }

      // Paste
      if (matchesShortcut(e, shortcuts.paste)) {
        e.preventDefault();
        const clip = clipboardRef.current;

        if (clip && clip.nodes.length > 0) {
          // Internal clipboard — duplicate copied nodes/connections
          const PASTE_OFFSET = 40;
          const idMap = new Map<string, string>();

          const newNodes: Node[] = clip.nodes.map(n => {
            const newId = createGraphId();
            idMap.set(n.id, newId);
            return { ...n, id: newId, x: n.x + PASTE_OFFSET, y: n.y + PASTE_OFFSET };
          });

          const newConnections: Connection[] = clip.connections.map(c => ({
            ...c,
            id: createGraphId(),
            fromId: idMap.get(c.fromId) ?? c.fromId,
            toId: c.toId ? (idMap.get(c.toId) ?? c.toId) : c.toId,
          }));

          const nextNodes = [...nodes, ...newNodes];
          const nextConns = [...connections, ...newConnections];
          const newNodeIds = newNodes.map(n => n.id);

          setNodes(nextNodes);
          setConnections(nextConns);
          setSelectedNodeIds(newNodeIds);
          setSelectedConnectionIds([]);
          if (newNodes.length === 1) {
            setFocused({ type: 'node', id: newNodes[0].id });
          } else {
            setFocused(null);
          }
          pushHistory(nextNodes, nextConns, newNodes.length === 1 ? { type: 'node', id: newNodes[0].id } : null);
          showToast(`${t.pasteSuccess} (${newNodes.length})`);
        } else {
          // No internal clipboard — try reading text from system clipboard
          navigator.clipboard.readText().then(text => {
            if (!text || !text.trim()) return;
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length === 0) return;

            const scale = canvasScale || 1;
            const centerX = (-canvasOffset.x + window.innerWidth / 2) / scale;
            const centerY = (-canvasOffset.y + window.innerHeight / 2) / scale;
            const spacingY = NODE_HEIGHT + 20;
            const startY = centerY - ((lines.length - 1) / 2) * spacingY;

            const newNodes: Node[] = lines.map((line, i) => ({
              id: createGraphId(),
              x: centerX,
              y: startY + i * spacingY,
              text: line.trim(),
            }));

            const nextNodes = [...nodes, ...newNodes];
            const newNodeIds = newNodes.map(n => n.id);

            setNodes(nextNodes);
            setSelectedNodeIds(newNodeIds);
            setSelectedConnectionIds([]);
            setFocused(newNodes.length === 1 ? { type: 'node', id: newNodes[0].id } : null);
            pushHistory(nextNodes, connections, newNodes.length === 1 ? { type: 'node', id: newNodes[0].id } : null);
            showToast(`${t.pasteSuccess} (${newNodes.length})`);
          }).catch(() => {});
        }
        return;
      }

      // Zoom shortcuts
      if (matchesShortcut(e, shortcuts.zoomIn) || matchesShortcut(e, shortcuts.zoomOut) || matchesShortcut(e, shortcuts.zoomReset)) {
        e.preventDefault();
        const isZoomIn = matchesShortcut(e, shortcuts.zoomIn);
        const isZoomReset = matchesShortcut(e, shortcuts.zoomReset);
        setCanvasView(prev => {
          const rawNext = isZoomReset ? 1 : (isZoomIn ? prev.scale + ZOOM_STEP : prev.scale - ZOOM_STEP);
          const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(rawNext.toFixed(2))));
          if (nextScale === prev.scale) return prev;

          const anchorX = window.innerWidth / 2;
          const anchorY = window.innerHeight / 2;
          const worldX = (anchorX - prev.x) / prev.scale;
          const worldY = (anchorY - prev.y) / prev.scale;

          return {
            x: anchorX - worldX * nextScale,
            y: anchorY - worldY * nextScale,
            scale: nextScale,
          };
        });
        return;
      }

      // If an input is already focused (pre-focused), let characters pass through to start IME
      if (e.target === inputRef.current && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Space is used as edit shortcut and should not be inserted as content on first press
        if (matchesShortcut(e, shortcuts.editText)) {
          e.preventDefault();
          setShouldSelect(true);
          setIsEditing(true);
          return;
        }
        // Special case: if it's search key on a connection, we want the search shortcut instead of typing
        if (focused?.type === 'connection' && matchesShortcut(e, shortcuts.search)) {
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
        if (matchesShortcut(e, shortcuts.moveDown)) {
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % searchResults.length);
          return;
        }
        if (matchesShortcut(e, shortcuts.moveUp)) {
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const target = searchResults[selectedIndex];
          if (target && focused?.type === 'connection') {
            const pendingConn = getConnection(focused.id);
            const nextBend = pendingConn ? getBestCurveBend(pendingConn.fromId, target.id, pendingConn.id) : 0;
            const nextConns = connections.map(c =>
              c.id === focused.id ? { ...c, toId: target.id, tempToPos: undefined, curveBend: nextBend, curveBendRatio: undefined } : c

            );
            setConnections(nextConns);
            pushHistory(nodes, nextConns, focused);
            setSearchQuery(null);
          }
          return;
        }
        if (matchesShortcut(e, shortcuts.save)) {
          e.preventDefault();
          handleSaveToLoadedFile();
          return;
        }
        return;
      }

      const selectedTotal = selectedNodeIds.length + selectedConnectionIds.length;
      if (matchesShortcut(e, shortcuts.delete)) {
        e.preventDefault();
        if (focused && focused.type !== 'multi-select') {
          if (focused.type === 'node') {
            const node = getNode(focused.id);
            if (!node) return;
            const deletedPos = { x: node.x, y: node.y };
            const newNodes = nodes.filter(n => n.id !== node.id);
            const newConns = connections
              .map(c => {
                const sourceDeleted = c.fromId === node.id;
                const targetDeleted = c.toId === node.id;
                if (!sourceDeleted && !targetDeleted) return c;

                if (sourceDeleted && targetDeleted) return null;

                if (sourceDeleted) {
                  if (!c.toId) return null;
                  return {
                    ...c,
                    fromId: c.toId,
                    toId: null,
                    tempToPos: deletedPos,
                    curveBend: 0,
                    curveBendRatio: undefined,

                  };
                }

                return {
                  ...c,
                  toId: null,
                  tempToPos: deletedPos,
                  curveBend: 0,
                  curveBendRatio: undefined,
                };

              })
              .filter((c): c is Connection => !!c);

            delete nodeSourceRef.current[node.id];
            Object.keys(nodeSourceRef.current).forEach((k) => {
              if (nodeSourceRef.current[k] === node.id) delete nodeSourceRef.current[k];
            });

            const fallbackFocus = resolveDeleteFallbackFocus(newNodes, newConns, deletedPos);

            if (fallbackFocus) {
              skipAutoFocusOnceRef.current = true;
            }
            setIsEditing(false);
            setNodes(newNodes);
            setConnections(newConns);
            setFocused(fallbackFocus);
            pushHistory(newNodes, newConns, fallbackFocus);
          } else if (focused.type === 'connection') {
            const conn = getConnection(focused.id);
            if (!conn) return;
            const newConns = connections.filter(c => c.id !== conn.id);
            const connFocusPoint = getConnectionFocus(conn) ?? { x: 0, y: 0 };
            const fallbackFocus = resolveDeleteFallbackFocus(nodes, newConns, connFocusPoint);

            if (fallbackFocus) {
              skipAutoFocusOnceRef.current = true;
            }
            setIsEditing(false);
            setConnections(newConns);
            setFocused(fallbackFocus);
            pushHistory(nodes, newConns, fallbackFocus);
          }
        } else if (selectedTotal > 0) {
          const nodeDeleteSet = new Set(selectedNodeIds);
          const connDeleteSet = new Set(selectedConnectionIds);

          const deletedPoints: { x: number; y: number }[] = [];
          nodes.forEach((n) => {
            if (nodeDeleteSet.has(n.id)) deletedPoints.push({ x: n.x, y: n.y });
          });
          connections.forEach((c) => {
            if (!connDeleteSet.has(c.id)) return;
            const p = getConnectionFocus(c);
            if (p) deletedPoints.push(p);
          });

          const nextNodes = nodes.filter(n => !nodeDeleteSet.has(n.id));
          const nextConns = connections.filter(c => {
            if (connDeleteSet.has(c.id)) return false;
            if (nodeDeleteSet.has(c.fromId)) return false;
            if (c.toId && nodeDeleteSet.has(c.toId)) return false;
            return true;
          });

          selectedNodeIds.forEach((id) => { delete nodeSourceRef.current[id]; });
          Object.keys(nodeSourceRef.current).forEach((k) => {
            if (nodeDeleteSet.has(nodeSourceRef.current[k])) delete nodeSourceRef.current[k];
          });

          const center = deletedPoints.length > 0
            ? deletedPoints.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
            : { x: 0, y: 0 };
          const deletedPos = deletedPoints.length > 0
            ? { x: center.x / deletedPoints.length, y: center.y / deletedPoints.length }
            : { x: 0, y: 0 };

          const fallbackFocus = resolveDeleteFallbackFocus(nextNodes, nextConns, deletedPos);

          if (fallbackFocus) {
            skipAutoFocusOnceRef.current = true;
          }

          setIsEditing(false);
          setNodes(nextNodes);
          setConnections(nextConns);
          setFocused(fallbackFocus);
          setSelectedNodeIds([]);
          setSelectedConnectionIds([]);
          pushHistory(nextNodes, nextConns, fallbackFocus);
        }
        return;
      }

      // Global Canvas Actions

      if (!focused) {
        if (matchesShortcut(e, shortcuts.createNode)) {
          e.preventDefault();
          const scale = canvasScale || 1;
          const newNode = createNode(
            (window.innerWidth / 2 - canvasOffset.x) / scale,
            (window.innerHeight / 2 - canvasOffset.y) / scale
          );
          const nextFocused = { type: 'node', id: newNode.id };
          setFocused(nextFocused);
          setShouldSelect(true);
          setIsEditing(true);
          pushHistory([...nodes, newNode], connections, nextFocused);
        } else if (matchesShortcut(e, shortcuts.moveUp) || matchesShortcut(e, shortcuts.moveDown) || matchesShortcut(e, shortcuts.moveLeft) || matchesShortcut(e, shortcuts.moveRight)) {
          // When no focus, arrow keys move focus to the node closest to the center of the viewport
          e.preventDefault();
          if (nodes.length === 0) return;

          // Calculate the center of the current viewport in world coordinates
          const scale = canvasScale || 1;
          const viewportCenterX = (window.innerWidth / 2 - canvasOffset.x) / scale;
          const viewportCenterY = (window.innerHeight / 2 - canvasOffset.y) / scale;

          // Find the node closest to the viewport center
          let closestNode = nodes[0];
          let minDistance = Infinity;

          for (const node of nodes) {
            const distance = Math.hypot(node.x - viewportCenterX, node.y - viewportCenterY);
            if (distance < minDistance) {
              minDistance = distance;
              closestNode = node;
            }
          }

          const nextFocused = { type: 'node', id: closestNode.id };
          setFocused(nextFocused);
          pushHistory(nodes, connections, nextFocused);
        }
        return;
      }

      // Multi-select Focused Actions
      if (focused?.type === 'multi-select') {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault();
          const step = 20;
          let dx = 0;
          let dy = 0;
          if (e.key === 'ArrowRight') dx = step;
          if (e.key === 'ArrowLeft') dx = -step;
          if (e.key === 'ArrowDown') dy = step;
          if (e.key === 'ArrowUp') dy = -step;
          const movableNodeIds = getSelectedNodeIdsByCurrentSelection(selectedNodeIds, selectedConnectionIds);
          setNodes(prev => prev.map(n => movableNodeIds.includes(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n));
          return;
        }
        if (matchesShortcut(e, shortcuts.moveUp) || matchesShortcut(e, shortcuts.moveDown) || matchesShortcut(e, shortcuts.moveLeft) || matchesShortcut(e, shortcuts.moveRight)) {
          e.preventDefault();
          setSelectedNodeIds([]);
          setSelectedConnectionIds([]);
          if (nodes.length === 0) {
            setFocused(null);
            return;
          }
          const scale = canvasScale || 1;
          const viewportCenterX = (window.innerWidth / 2 - canvasOffset.x) / scale;
          const viewportCenterY = (window.innerHeight / 2 - canvasOffset.y) / scale;
          let closestNode = nodes[0];
          let minDistance = Infinity;
          for (const node of nodes) {
            const distance = Math.hypot(node.x - viewportCenterX, node.y - viewportCenterY);
            if (distance < minDistance) {
              minDistance = distance;
              closestNode = node;
            }
          }
          const nextFocused = { type: 'node' as const, id: closestNode.id };
          setFocused(nextFocused);
          pushHistory(nodes, connections, nextFocused);
          return;
        }
        if (e.key === 'Escape') {
          setSelectedNodeIds([]);
          setSelectedConnectionIds([]);
          setFocused(null);
          return;
        }
        return;
      }

      // Node Focused Actions
      if (focused.type === 'node') {
        const node = getNode(focused.id);
        if (!node) return;

        if (matchesShortcut(e, shortcuts.editText)) {
          e.preventDefault();
          setShouldSelect(true);
          setIsEditing(true);
        } else if (matchesShortcut(e, shortcuts.returnConnection)) {
          e.preventDefault();
          const previousNodeId = nodeSourceRef.current[node.id] ?? previousNodeFocusRef.current;

          const previousNode = previousNodeId ? getNode(previousNodeId) : null;
          if (previousNode && previousNode.id !== node.id) {
            const targetPos = {
              x: node.x,
              y: node.y + RETURN_CONN_TARGET_OFFSET_Y,
            };
            const newConn = createConnection(previousNode.id, null, targetPos);
            const nextFocused = { type: 'connection', id: newConn.id };
            setSelectedNodeIds([]);
            setSelectedConnectionIds([]);
            setFocused(nextFocused);
            pushHistory(nodes, [...connections, newConn], nextFocused);
          }
        } else if (matchesShortcut(e, shortcuts.createNodeBelow)) {
          // Shift+Enter: Create a new node below the current node and enter editing mode
          e.preventDefault();
          const newNodeY = node.y + NODE_HEIGHT + 60; // Place below with some distance
          const newNode = createNode(node.x, newNodeY);
          const nextFocused = { type: 'node', id: newNode.id };
          setSelectedNodeIds([]);
          setSelectedConnectionIds([]);
          setFocused(nextFocused);
          setShouldSelect(true);
          setIsEditing(true);
          pushHistory([...nodes, newNode], connections, nextFocused);
        } else if (matchesShortcut(e, shortcuts.createConnection)) {
          e.preventDefault();
          const newConn = createConnection(node.id, null, { x: node.x + lastDirection.x, y: node.y + lastDirection.y });
          const nextFocused = { type: 'connection', id: newConn.id };
          setSelectedNodeIds([]);
          setSelectedConnectionIds([]);
          setFocused(nextFocused);
          pushHistory(nodes, [...connections, newConn], nextFocused);
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // Just trigger editing mode, browser handles the character
          setIsEditing(true);
        } else if (matchesShortcut(e, shortcuts.cycleStyle)) {
          e.preventDefault();
          // Cycle through node styles: default -> text -> note -> warning -> default
          const styles: NodeStyle[] = ['default', 'text', 'note', 'warning'];
          const currentStyle = node.style || 'default';
          const nextStyle = styles[(styles.indexOf(currentStyle) + 1) % styles.length];
          const nextNodes = nodes.map(n => n.id === node.id ? { ...n, style: nextStyle } : n);
          setNodes(nextNodes);
          pushHistory(nextNodes, connections, focused);
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          // Ctrl/Cmd + Arrow keys: Move node
          e.preventDefault();
          const step = 20;
          let dx = 0;
          let dy = 0;
          if (e.key === 'ArrowRight') dx = step;
          if (e.key === 'ArrowLeft') dx = -step;
          if (e.key === 'ArrowDown') dy = step;
          if (e.key === 'ArrowUp') dy = -step;
          setNodes(prev => prev.map(n => n.id === node.id ? { ...n, x: n.x + dx, y: n.y + dy } : n));
        } else if (matchesShortcut(e, shortcuts.moveUp) || matchesShortcut(e, shortcuts.moveDown) || matchesShortcut(e, shortcuts.moveLeft) || matchesShortcut(e, shortcuts.moveRight)) {
          e.preventDefault();
          if (matchesShortcut(e, shortcuts.moveUp)) moveFocus('ArrowUp');
          else if (matchesShortcut(e, shortcuts.moveDown)) moveFocus('ArrowDown');
          else if (matchesShortcut(e, shortcuts.moveLeft)) moveFocus('ArrowLeft');
          else if (matchesShortcut(e, shortcuts.moveRight)) moveFocus('ArrowRight');
        }
      }

      // Connection Focused Actions
      if (focused.type === 'connection') {
        const conn = getConnection(focused.id);
        if (!conn) return;

        if (matchesShortcut(e, shortcuts.cycleStyle)) {
          e.preventDefault();
          const styles: ConnectionStyle[] = ['forward', 'backward', 'both', 'none'];
          const nextStyle = styles[(styles.indexOf(conn.style) + 1) % styles.length];
          const nextConns = connections.map(c => c.id === conn.id ? { ...c, style: nextStyle } : c);
          setConnections(nextConns);
          pushHistory(nodes, nextConns, focused);
          setLastStyle(nextStyle);
        } else if (matchesShortcut(e, shortcuts.editText)) {
          e.preventDefault();
          setShouldSelect(true);
          setIsEditing(true);
        } else if (matchesShortcut(e, shortcuts.createNode)) {
          e.preventDefault();
          if (!conn.toId) {
            const fromNode = getNode(conn.fromId);
            const x = conn.tempToPos?.x ?? (fromNode ? fromNode.x + lastDirection.x : 0);
            const y = conn.tempToPos?.y ?? (fromNode ? fromNode.y + lastDirection.y : 0);
            const newNode = createNode(x, y);
            nodeSourceRef.current[newNode.id] = conn.fromId;
            const nextBend = getBestCurveBend(conn.fromId, newNode.id, conn.id);

            const nextConns = connections.map(c => c.id === conn.id ? { ...c, toId: newNode.id, tempToPos: undefined, curveBend: nextBend, curveBendRatio: undefined } : c);

            setConnections(nextConns);
            const nextFocused = { type: 'node', id: newNode.id };
            setSelectedNodeIds([]);
            setSelectedConnectionIds([]);
            setFocused(nextFocused);
            setShouldSelect(true);
            setIsEditing(true);
            pushHistory([...nodes, newNode], nextConns, nextFocused);
          } else {
            // If already connected, maybe move focus to the target node
            updateFocus({ type: 'node', id: conn.toId });
          }
        } else if (matchesShortcut(e, shortcuts.search)) {
          e.preventDefault();
          setSearchQuery('');
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {

          // Just trigger editing mode, browser handles the character
          setIsEditing(true);
        } else if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          // Shift + Arrow keys: Adjust curve bend
          e.preventDefault();
          const step = 10;
          const delta = (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ? step : -step;
          const currentBend = conn.curveBend ?? 0;
          const nextBend = currentBend + delta;
          const nextConns = connections.map(c => c.id === conn.id ? { ...c, curveBend: nextBend, curveBendRatio: undefined } : c);
          setConnections(nextConns);
          pushHistory(nodes, nextConns, focused);
        } else if (e.shiftKey && e.key === 'Enter') {
          // Shift + Enter: Reset curve bend to straight line
          e.preventDefault();
          const nextConns = connections.map(c => c.id === conn.id ? { ...c, curveBend: 0, curveBendRatio: undefined } : c);
          setConnections(nextConns);
          pushHistory(nodes, nextConns, focused);
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          // Ctrl/Cmd + Arrow keys: Move connection endpoint
          e.preventDefault();
          const fromNode = getNode(conn.fromId);
          if (!fromNode) return;

          const step = GRID_SIZE;
          let dx = 0;
          let dy = 0;
          if (e.key === 'ArrowRight') dx = step;
          if (e.key === 'ArrowLeft') dx = -step;
          if (e.key === 'ArrowDown') dy = step;
          if (e.key === 'ArrowUp') dy = -step;

          const currentEnd = conn.toId
            ? (() => {
                const target = getNode(conn.toId);
                return target ? { x: target.x, y: target.y } : null;
              })()
            : (conn.tempToPos ?? { x: fromNode.x + lastDirection.x, y: fromNode.y + lastDirection.y });

          if (!currentEnd) return;

          const newX = currentEnd.x + dx;
          const newY = currentEnd.y + dy;
          setLastDirection({ x: newX - fromNode.x, y: newY - fromNode.y });

          if (conn.toId) {
            const nextNodes = nodes.map(n => n.id === conn.toId ? { ...n, x: newX, y: newY } : n);
            setNodes(nextNodes);
            pushHistory(nextNodes, connections, focused);
          } else {
            const nextConns = connections.map(c => c.id === conn.id ? { ...c, tempToPos: { x: newX, y: newY } } : c);
            setConnections(nextConns);
            pushHistory(nodes, nextConns, focused);
          }
        } else if (matchesShortcut(e, shortcuts.moveUp) || matchesShortcut(e, shortcuts.moveDown) || matchesShortcut(e, shortcuts.moveLeft) || matchesShortcut(e, shortcuts.moveRight)) {
          e.preventDefault();
          if (matchesShortcut(e, shortcuts.moveUp)) moveFocus('ArrowUp');
          else if (matchesShortcut(e, shortcuts.moveDown)) moveFocus('ArrowDown');
          else if (matchesShortcut(e, shortcuts.moveLeft)) moveFocus('ArrowLeft');
          else if (matchesShortcut(e, shortcuts.moveRight)) moveFocus('ArrowRight');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const handleKeyUp = (e: KeyboardEvent) => {
      if (((e.ctrlKey || e.metaKey) || matchesShortcut(e, shortcuts.moveUp) || matchesShortcut(e, shortcuts.moveDown) || matchesShortcut(e, shortcuts.moveLeft) || matchesShortcut(e, shortcuts.moveRight)) && focused?.type === 'node' && !isEditing) {
        pushHistory(nodes, connections, focused);
      }
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [focused, isEditing, nodes, connections, canvasOffset, canvasScale, searchQuery, searchResults, selectedIndex, lastStyle, defaultOffset, selectedNodeIds, selectedConnectionIds, shortcuts, matchesShortcut, handleSaveToLoadedFile, showToast, t, pushHistory, draggingNewConnection, getNode, createConnection, getBestCurveBend, lastDirection, isQuickStartOpen, tutorialCanvasMode, tutorialActionId]);

  // Spatial Navigation
  const moveFocus = (key: string) => {
    if (!focused) return;

    const directionMap: Record<string, { x: number; y: number }> = {
      ArrowRight: { x: 1, y: 0 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowDown: { x: 0, y: 1 },
      ArrowUp: { x: 0, y: -1 },
    };
    const dir = directionMap[key];
    if (!dir) return;

    let currentPos: { x: number; y: number } | null = null;
    if (focused.type === 'node') {
      const node = getNode(focused.id);
      if (node) currentPos = { x: node.x, y: node.y };
    } else {
      const conn = getConnection(focused.id);
      if (conn) currentPos = getConnectionFocus(conn);
    }
    if (!currentPos) return;

    const candidates: { type: 'node' | 'connection'; id: string; x: number; y: number }[] = [];
    for (const n of nodes) {
      if (focused.type === 'node' && focused.id === n.id) continue;
      candidates.push({ type: 'node', id: n.id, x: n.x, y: n.y });
    }
    for (const c of connections) {
      if (focused.type === 'connection' && focused.id === c.id) continue;
      const pos = getConnectionFocus(c);
      if (!pos) continue;
      candidates.push({ type: 'connection', id: c.id, x: pos.x, y: pos.y });
    }

    const perp = { x: -dir.y, y: dir.x };
    let best: { type: 'node' | 'connection'; id: string } | null = null;
    let bestScore = Infinity;

    for (const cand of candidates) {
      const dx = cand.x - currentPos.x;
      const dy = cand.y - currentPos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) continue;

      const forward = dx * dir.x + dy * dir.y;
      if (forward <= 0) continue;

      const cos = forward / dist;
      if (cos < 0.25) continue;

      const lateral = Math.abs(dx * perp.x + dy * perp.y);
      const score = dist + lateral * 1.6 + (1 - cos) * 220;

      if (score < bestScore) {
        bestScore = score;
        best = { type: cand.type, id: cand.id };
      }
    }

    if (best) {
      if (best.type === 'node') {
        setSelectedNodeIds([best.id]);
        setSelectedConnectionIds([]);
      } else {
        setSelectedNodeIds([]);
        setSelectedConnectionIds([best.id]);
      }
      updateFocus(best);
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

  useEffect(() => {
    const nodeSet = new Set(nodes.map(n => n.id));
    const connSet = new Set(connections.map(c => c.id));
    setSelectedNodeIds(prev => prev.filter(id => nodeSet.has(id)));
    setSelectedConnectionIds(prev => prev.filter(id => connSet.has(id)));
  }, [nodes, connections]);

  // Dragging & multi-select logic

  const [draggingNodeIds, setDraggingNodeIds] = useState<string[] | null>(null);
  const [draggingPendingConnectionIds, setDraggingPendingConnectionIds] = useState<string[] | null>(null);
  const [draggingEndpoint, setDraggingEndpoint] = useState<{
    connId: string;
    endpoint: 'start' | 'end';
    fixedNodeId: string;
  } | null>(null);
  const [draggingCurveControl, setDraggingCurveControl] = useState<{ connId: string } | null>(null);
  const [hoveredEndpoint, setHoveredEndpoint] = useState<{ connId: string; endpoint: 'start' | 'end' } | null>(null);




  const getSelectionWorldRect = (box: { start: { x: number; y: number }; current: { x: number; y: number } }) => {
    const scale = canvasScale === 0 ? 1 : canvasScale;
    const left = Math.min(box.start.x, box.current.x);
    const right = Math.max(box.start.x, box.current.x);
    const top = Math.min(box.start.y, box.current.y);
    const bottom = Math.max(box.start.y, box.current.y);
    return {
      left: (left - canvasOffset.x) / scale,
      right: (right - canvasOffset.x) / scale,
      top: (top - canvasOffset.y) / scale,
      bottom: (bottom - canvasOffset.y) / scale,
    };
  };

  const pointInRect = (x: number, y: number, rect: { left: number; right: number; top: number; bottom: number }) => {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const getWorldPointFromClient = (clientX: number, clientY: number) => {
    const scale = canvasScale === 0 ? 1 : canvasScale;
    return {
      x: (clientX - canvasOffset.x) / scale,
      y: (clientY - canvasOffset.y) / scale,
    };
  };

  const getNodeAtWorldPoint = (point: { x: number; y: number }, excludeNodeId?: string) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (excludeNodeId && node.id === excludeNodeId) continue;
      const box = getNodeBoxSize(node.text);
      const halfW = box.width / 2;
      const halfH = box.height / 2;
      if (
        point.x >= node.x - halfW &&
        point.x <= node.x + halfW &&
        point.y >= node.y - halfH &&
        point.y <= node.y + halfH
      ) {
        return node;
      }
    }
    return null;
  };

  const reverseStyle = (style: ConnectionStyle): ConnectionStyle => {
    if (style === 'forward') return 'backward';
    if (style === 'backward') return 'forward';
    return style;
  };


  const getSelectedNodeIdsByCurrentSelection = (nodeIds: string[], connectionIds: string[]) => {
    const set = new Set<string>(nodeIds);
    connectionIds.forEach((connId) => {
      const conn = getConnection(connId);
      if (!conn) return;
      set.add(conn.fromId);
      if (conn.toId) set.add(conn.toId);
    });
    return Array.from(set);
  };

  const getPendingConnectionIdsBySelection = (connectionIds: string[]) => {
    return connectionIds.filter((connId) => {
      const conn = getConnection(connId);
      return !!conn && !conn.toId && !!conn.tempToPos;
    });
  };

  const applySelectionByBox = (box: { start: { x: number; y: number }; current: { x: number; y: number } }) => {
    const worldRect = getSelectionWorldRect(box);

    const nextNodeIds = nodes
      .filter((n) => pointInRect(n.x, n.y, worldRect))
      .map((n) => n.id);

    const nextConnectionIds: string[] = [];

    setSelectedNodeIds(nextNodeIds);
    setSelectedConnectionIds(nextConnectionIds);

    const total = nextNodeIds.length + nextConnectionIds.length;
    if (total === 1) {
      updateFocus({ type: 'node', id: nextNodeIds[0] });
    } else if (total > 1) {
      updateFocus({ type: 'multi-select' });
    } else {
      updateFocus(null);
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (tutorialCanvasMode) return;
    if (e.button === 2) return;
    if (e.button !== 0) return;
    e.stopPropagation();

    if (focused?.type === 'node' && focused.id === nodeId && isEditing) {
      setIsEditing(false);
      return;
    }

    setDraggingCurveControl(null);

    const isSelected = selectedNodeIds.includes(nodeId);
    const totalSelected = selectedNodeIds.length + selectedConnectionIds.length;

    if (isSelected && totalSelected > 1) {
      // Clicked a node that's part of a multi-selection: drag all selected
      // nodes together. If the user releases without dragging, narrow selection.
      narrowSelectOnMouseUpRef.current = nodeId;
      const movableNodeIds = getSelectedNodeIdsByCurrentSelection(selectedNodeIds, selectedConnectionIds);
      setDraggingNodeIds(movableNodeIds);
      setDraggingPendingConnectionIds(getPendingConnectionIdsBySelection(selectedConnectionIds));
      clearBeforePreviousOnNextFocusRef.current = true;
      // Keep multi-select focus — don't narrow to single node on drag start
      if (focused?.type !== 'multi-select') {
        updateFocus({ type: 'node', id: nodeId });
      }
      return;
    }

    setSelectedNodeIds([nodeId]);
    setSelectedConnectionIds([]);
    setDraggingNodeIds([nodeId]);
    setDraggingPendingConnectionIds([]);
    narrowSelectOnMouseUpRef.current = null;
    clearBeforePreviousOnNextFocusRef.current = true;
    updateFocus({ type: 'node', id: nodeId });
  };

  const handleConnectionMouseDown = (e: React.MouseEvent, connId: string) => {
    if (tutorialCanvasMode) return;
    if (e.button === 2) return;
    if (e.button !== 0) return;
    e.stopPropagation();

    if (focused?.type === 'connection' && focused.id === connId && isEditing) {
      setIsEditing(false);
      return;
    }

    skipNextConnectionCenterRef.current = true;

    // Always narrow selection to the clicked connection.
    setSelectedNodeIds([]);
    setSelectedConnectionIds([connId]);
    setDraggingNodeIds(getSelectedNodeIdsByCurrentSelection([], [connId]));
    setDraggingPendingConnectionIds(getPendingConnectionIdsBySelection([connId]));
    clearBeforePreviousOnNextFocusRef.current = true;
    updateFocus({ type: 'connection', id: connId });
  };

  const handleConnectionEndpointMouseDown = (e: React.MouseEvent, connId: string, endpoint: 'start' | 'end') => {
    if (tutorialCanvasMode) return;
    if (e.button !== 0) return;
    e.stopPropagation();

    const conn = getConnection(connId);
    if (!conn) return;

    const fromNode = getNode(conn.fromId);
    if (!fromNode) return;

    const endNode = conn.toId ? getNode(conn.toId) : null;
    const world = getWorldPointFromClient(e.clientX, e.clientY);

    skipNextConnectionCenterRef.current = true;

    clearBeforePreviousOnNextFocusRef.current = true;
    updateFocus({ type: 'connection', id: connId });

    setSelectedNodeIds([]);
    setSelectedConnectionIds([connId]);
    setDraggingNodeIds(null);
    setDraggingPendingConnectionIds(null);
    setDraggingCurveControl(null);
    setSelectionBox(null);
    setIsPanning(false);


    if (endpoint === 'end') {
      setConnections(prev => prev.map(c => c.id === connId
        ? { ...c, toId: null, tempToPos: world, curveBend: 0, curveBendRatio: undefined }
        : c));


      setDraggingEndpoint({ connId, endpoint, fixedNodeId: conn.fromId });
      return;
    }

    if (!conn.toId || !endNode) return;

    setConnections(prev => prev.map(c => c.id === connId
      ? {
          ...c,
          fromId: conn.toId!,
          toId: null,
          tempToPos: world,

          curveBend: 0,
          curveBendRatio: undefined,
          style: reverseStyle(c.style),

        }
      : c));
    setDraggingEndpoint({ connId, endpoint, fixedNodeId: conn.toId });
  };

  const handleConnectionCurveControlMouseDown = (e: React.MouseEvent, connId: string) => {
    if (tutorialCanvasMode) return;
    if (e.button !== 0) return;
    e.stopPropagation();

    skipNextConnectionCenterRef.current = true;
    clearBeforePreviousOnNextFocusRef.current = true;
    updateFocus({ type: 'connection', id: connId });

    setSelectedNodeIds([]);
    setSelectedConnectionIds([connId]);
    setDraggingNodeIds(null);
    setDraggingPendingConnectionIds(null);
    setDraggingEndpoint(null);
    setSelectionBox(null);
    setIsPanning(false);
    setDraggingCurveControl({ connId });
  };

  const handlePortMouseDown = (e: React.MouseEvent, nodeId: string, port: 'left' | 'right') => {
    if (tutorialCanvasMode) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const node = getNode(nodeId);
    if (!node) return;

    const nodeBox = getNodeBoxSize(node.text);
    const portWorldX = port === 'left'
      ? node.x - nodeBox.width / 2
      : node.x + nodeBox.width / 2;

    const newConn = createConnection(
      nodeId,
      null,
      { x: portWorldX, y: node.y },
    );

    setDraggingNewConnection({ fromNodeId: nodeId, connId: newConn.id, port });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {

    if (tutorialCanvasMode) return;

    if (e.button === 2) {
      if (focused?.type === 'connection') {
        skipNextConnectionCenterRef.current = true;
      }
      setIsPanning(true);
      return;
    }


    if (e.button !== 0) return;

    updateFocus(null);
    setSelectedNodeIds([]);
    setSelectedConnectionIds([]);
    setDraggingCurveControl(null);
    setSelectionBox({
      start: { x: e.clientX, y: e.clientY },
      current: { x: e.clientX, y: e.clientY },
    });

  };

  // Handle wheel events: mouse wheel zoom, touchpad two-finger pan and pinch zoom
  const handleWheel = useCallback((e: React.WheelEvent | WheelEvent) => {
    // Prevent default browser gestures (pinch-zoom, back/forward navigation)
    e.preventDefault();
    if (tutorialCanvasMode) return;

    const wheelEvent = e as WheelEvent;
    const isPinchZoom = wheelEvent.ctrlKey; // macOS touchpad pinch sets ctrlKey
    const hasDeltaY = Math.abs(wheelEvent.deltaY) > 0.01;
    const hasDeltaX = Math.abs(wheelEvent.deltaX) > 0.01;

    if (isPinchZoom && hasDeltaY) {
      // Touchpad pinch zoom (macOS sends ctrlKey + deltaY)
      // Use exponential scaling for smooth, proportional zoom
      const zoomFactor = Math.exp(-wheelEvent.deltaY * 0.01);

      setCanvasView(prev => {
        const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number((prev.scale * zoomFactor).toFixed(3))));
        if (nextScale === prev.scale) return prev;

        // Zoom towards pointer position
        const rect = canvasRef.current?.getBoundingClientRect();
        const pointerX = rect ? wheelEvent.clientX - rect.left : wheelEvent.clientX;
        const pointerY = rect ? wheelEvent.clientY - rect.top : wheelEvent.clientY;

        const worldX = (pointerX - prev.x) / prev.scale;
        const worldY = (pointerY - prev.y) / prev.scale;

        return {
          x: pointerX - worldX * nextScale,
          y: pointerY - worldY * nextScale,
          scale: nextScale,
        };
      });
    } else if (!isPinchZoom && (hasDeltaX || hasDeltaY)) {
      // Touchpad two-finger pan (deltaX and/or deltaY without ctrlKey)
      // Also handles mouse wheel with shift for horizontal scroll
      setCanvasView(prev => ({
        ...prev,
        x: prev.x - wheelEvent.deltaX,
        y: prev.y - wheelEvent.deltaY,
      }));
    }
  }, [tutorialCanvasMode]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tutorialCanvasMode) return;
    if (draggingCurveControl) {
      const world = getWorldPointFromClient(e.clientX, e.clientY);
      setConnections(prev => prev.map(c => {
        if (c.id !== draggingCurveControl.connId) return c;
        const fromNode = getNode(c.fromId);
        if (!fromNode) return c;
        const toNode = c.toId ? getNode(c.toId) : null;
        const from = { x: fromNode.x, y: fromNode.y };
        const to = toNode
          ? { x: toNode.x, y: toNode.y }
          : (c.tempToPos ?? { x: from.x + lastDirection.x, y: from.y + lastDirection.y });
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) return { ...c, curveBend: 0, curveBendRatio: 0 };

        const normalX = -dy / len;
        const normalY = dx / len;
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const projected = (world.x - midX) * normalX + (world.y - midY) * normalY;
        const directionMultiplier = c.toId && c.fromId > c.toId ? -1 : 1;
        const nextRenderedBend = projected / 0.75;
        const nextRawBend = nextRenderedBend * directionMultiplier;
        const nextRatio = nextRawBend / len;

        return { ...c, curveBend: nextRawBend, curveBendRatio: nextRatio };

      }));
      return;
    }

    if (draggingEndpoint) {
      const world = getWorldPointFromClient(e.clientX, e.clientY);
      setHoveredEndpoint({ connId: draggingEndpoint.connId, endpoint: 'end' });
      setConnections(prev => prev.map(c => (
        c.id === draggingEndpoint.connId
          ? { ...c, toId: null, tempToPos: world, curveBend: 0, curveBendRatio: undefined }
          : c
      )));
      return;
    }

    if (draggingNewConnection) {
      const world = getWorldPointFromClient(e.clientX, e.clientY);
      const targetNode = getNodeAtWorldPoint(world, draggingNewConnection.fromNodeId);
      setHoveredNewConnTarget(targetNode ? targetNode.id : null);
      setConnections(prev => prev.map(c =>
        c.id === draggingNewConnection.connId
          ? { ...c, tempToPos: world }
          : c
      ));
      return;
    }


    if (!isPanning && !selectionBox) {
      setHoveredEndpoint(getHoveredEndpointAtClientPoint(e.clientX, e.clientY));
    } else if (hoveredEndpoint) {
      setHoveredEndpoint(null);
    }

    if (draggingNodeIds && draggingNodeIds.length > 0) {
      // User is actually dragging — cancel the "narrow on mouseUp" plan
      narrowSelectOnMouseUpRef.current = null;
      const movementScale = canvasScale === 0 ? 1 : canvasScale;
      const dx = e.movementX / movementScale;
      const dy = e.movementY / movementScale;
      setNodes(prev => prev.map(n => draggingNodeIds.includes(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n));
      if (draggingPendingConnectionIds && draggingPendingConnectionIds.length > 0) {
        setConnections(prev => prev.map(c => (
          draggingPendingConnectionIds.includes(c.id) && c.tempToPos
            ? { ...c, tempToPos: { x: c.tempToPos.x + dx, y: c.tempToPos.y + dy } }
            : c
        )));
      }
    } else if (isPanning) {
      setCanvasView(prev => ({ ...prev, x: prev.x + e.movementX, y: prev.y + e.movementY }));
    } else if (selectionBox) {
      setSelectionBox(prev => prev ? { ...prev, current: { x: e.clientX, y: e.clientY } } : prev);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (tutorialCanvasMode) return;
    if (draggingCurveControl) {
      pushHistory(nodes, connections, focused);
      setDraggingCurveControl(null);
      setIsPanning(false);
      return;
    }

    if (draggingEndpoint) {

      const world = getWorldPointFromClient(e.clientX, e.clientY);
      const snapNode = getNodeAtWorldPoint(world, draggingEndpoint.endpoint === 'end' ? undefined : draggingEndpoint.fixedNodeId);
      const targetConn = getConnection(draggingEndpoint.connId);

      if (targetConn) {
        let nextConns = connections;

        if (draggingEndpoint.endpoint === 'end') {
          nextConns = connections.map(c => {
            if (c.id !== draggingEndpoint.connId) return c;
            if (snapNode) {
              const nextBend = getBestCurveBend(c.fromId, snapNode.id, c.id);
              return { ...c, toId: snapNode.id, tempToPos: undefined, curveBend: nextBend, curveBendRatio: undefined };

            }
            return { ...c, toId: null, tempToPos: world, curveBend: 0, curveBendRatio: undefined };

          });
        } else {
          nextConns = connections.map(c => {
            if (c.id !== draggingEndpoint.connId) return c;
            if (snapNode) {
              const nextBend = getBestCurveBend(snapNode.id, draggingEndpoint.fixedNodeId, c.id);
              return {
                ...c,
                fromId: snapNode.id,
                toId: draggingEndpoint.fixedNodeId,
                tempToPos: undefined,
                curveBend: nextBend,
                curveBendRatio: undefined,
                style: reverseStyle(c.style),

              };
            }
            return { ...c, toId: null, tempToPos: world, curveBend: 0, curveBendRatio: undefined };

          });
        }

        setConnections(nextConns);
        pushHistory(nodes, nextConns, focused);
      }

      setDraggingEndpoint(null);
      setHoveredEndpoint(null);
      setIsPanning(false);
      return;
    }

    if (draggingNewConnection) {
      const world = getWorldPointFromClient(e.clientX, e.clientY);
      const targetNode = getNodeAtWorldPoint(world, draggingNewConnection.fromNodeId);

      if (targetNode) {
        const nextConns = connections.map(c => {
          if (c.id !== draggingNewConnection.connId) return c;
          const nextBend = getBestCurveBend(c.fromId, targetNode.id, c.id);
          return { ...c, toId: targetNode.id, tempToPos: undefined, curveBend: nextBend, curveBendRatio: undefined };
        });
        setConnections(nextConns);
        pushHistory(nodes, nextConns, focused);
      }

      setDraggingNewConnection(null);
      setHoveredNewConnTarget(null);
      return;
    }


    if (draggingNodeIds && draggingNodeIds.length > 0) {
      pushHistory(nodes, connections, focused);

      // If the user clicked (no drag) on a node within a multi-select, narrow selection
      if (narrowSelectOnMouseUpRef.current) {
        setSelectedNodeIds([narrowSelectOnMouseUpRef.current]);
        setSelectedConnectionIds([]);
      }
      narrowSelectOnMouseUpRef.current = null;
    }

    if (selectionBox) {
      const dragDistance = Math.hypot(selectionBox.current.x - selectionBox.start.x, selectionBox.current.y - selectionBox.start.y);
      if (dragDistance >= 4) {
        applySelectionByBox(selectionBox);
      }
      setSelectionBox(null);
    }

    setDraggingNodeIds(null);
    setDraggingPendingConnectionIds(null);
    setIsPanning(false);
  };



  useEffect(() => {
    if (nodes.length < 2) return;

    const lockedNodeId = draggingNodeIds && draggingNodeIds.length === 1 ? draggingNodeIds[0] : undefined;
    setNodes(prev => resolveNodeOverlaps(prev, lockedNodeId));
  }, [nodes, draggingNodeIds]);

  // Camera Tracking

  useEffect(() => {
    if (skipAutoFocusOnceRef.current) {
      skipAutoFocusOnceRef.current = false;
      prevFocusedRef.current = focused;
      return;
    } else if (isEditing && focused && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }

    const focusedChanged = focused?.type !== prevFocusedRef.current?.type || focused?.id !== prevFocusedRef.current?.id;
    prevFocusedRef.current = focused;
    if (!focusedChanged) return;

    if (!focused || isPanning || draggingEndpoint || draggingCurveControl || (draggingNodeIds && draggingNodeIds.length > 0)) return;

    if (focused.type === 'connection' && skipNextConnectionCenterRef.current) {
      skipNextConnectionCenterRef.current = false;
      return;
    }

    let targetX = 0;
    let targetY = 0;
    let hasTarget = false;

    if (focused.type === 'node') {
      const node = getNode(focused.id);
      if (node) {
        targetX = node.x;
        targetY = node.y;
        hasTarget = true;
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
          hasTarget = true;
        }
      }
    }

    if (hasTarget) {
      setCanvasView(prev => {
        const margin = 80;
        const visLeft = -prev.x / prev.scale;
        const visTop = -prev.y / prev.scale;
        const visRight = (window.innerWidth - prev.x) / prev.scale;
        const visBottom = (window.innerHeight - prev.y) / prev.scale;

        let points: { x: number; y: number }[] = [];

        if (focused?.type === 'connection') {
          const conn = getConnection(focused.id);
          if (conn) {
            const from = getNode(conn.fromId);
            const to = conn.toId ? getNode(conn.toId) : null;
            if (from) points.push({ x: from.x, y: from.y });
            if (to) points.push({ x: to.x, y: to.y });
          }
        } else if (focused?.type === 'node') {
          const node = getNode(focused.id);
          if (node) points.push({ x: node.x, y: node.y });
        }

        if (points.length === 0) {
          points.push({ x: targetX, y: targetY });
        }

        const anyVisible = points.some(p =>
          p.x >= visLeft + margin && p.x <= visRight - margin &&
          p.y >= visTop + margin && p.y <= visBottom - margin
        );
        if (anyVisible) return prev;

        const minX = Math.min(...points.map(p => p.x));
        const maxX = Math.max(...points.map(p => p.x));
        const minY = Math.min(...points.map(p => p.y));
        const maxY = Math.max(...points.map(p => p.y));

        const contentW = maxX - minX + margin * 2;
        const contentH = maxY - minY + margin * 2;
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;

        let newScale = prev.scale;
        if (points.length > 1 && (contentW * prev.scale > vpW || contentH * prev.scale > vpH)) {
          newScale = Math.min(vpW / contentW, vpH / contentH);
          newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(newScale.toFixed(3))));
        }

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        return {
          x: vpW / 2 - centerX * newScale,
          y: vpH / 2 - centerY * newScale,
          scale: newScale,
        };
      });
    }
  }, [focused, nodes, connections, isPanning, draggingNodeIds, draggingEndpoint, draggingCurveControl, isEditing]);

  // Normalize view after panning/zooming - ensure at least some content is visible
  const prevInteractingRef = useRef(false);
  useEffect(() => {
    const interacting = !!(isPanning || draggingNodeIds || draggingEndpoint || draggingCurveControl);
    const wasInteracting = prevInteractingRef.current;
    prevInteractingRef.current = interacting;
    if (interacting || !wasInteracting) return;
    if (nodes.length === 0) return;

    setCanvasView(prev => {
      const visLeft = -prev.x / prev.scale;
      const visTop = -prev.y / prev.scale;
      const visRight = (window.innerWidth - prev.x) / prev.scale;
      const visBottom = (window.innerHeight - prev.y) / prev.scale;
      const margin = 100;

      const hasVisibleNode = nodes.some(n =>
        n.x >= visLeft - margin && n.x <= visRight + margin &&
        n.y >= visTop - margin && n.y <= visBottom + margin
      );

      if (hasVisibleNode) return prev;

      const vpCenterX = (visLeft + visRight) / 2;
      const vpCenterY = (visTop + visBottom) / 2;
      let nearest = nodes[0];
      let minDist = Infinity;
      for (const n of nodes) {
        const dist = Math.hypot(n.x - vpCenterX, n.y - vpCenterY);
        if (dist < minDist) {
          minDist = dist;
          nearest = n;
        }
      }

      return {
        ...prev,
        x: window.innerWidth / 2 - nearest.x * prev.scale,
        y: window.innerHeight / 2 - nearest.y * prev.scale,
      };
    });
  }, [isPanning, draggingNodeIds, draggingEndpoint, draggingCurveControl, nodes]);


  // Auto-focus input — focus textarea whenever an element is focused (not just editing)
  // This is critical for Chinese IME: the textarea must be focused BEFORE the user starts
  // typing, so the first keystroke can begin IME composition instead of being lost.
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
      if (shouldSelect) {
        inputRef.current.select();
        setShouldSelect(false);
      }
    }
  }, [isEditing, shouldSelect, focused]);

  // Helper to calculate intersection with node boundary
  const getEdgePoint = (from: { x: number; y: number }, to: { x: number; y: number }, nodeId?: string) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return to;

    const node = nodeId ? getNode(nodeId) : null;
    const nodeBox = node ? getNodeBoxSize(node.text) : { width: NODE_WIDTH, height: NODE_HEIGHT };
    const isNodeFocused = nodeId ? (focused?.type === 'node' && focused.id === nodeId) : false;
    const scaleFactor = isNodeFocused ? 1.05 : 1;

    // Add a small padding (1px) to ensure the arrowhead tip touches the node boundary
    const hw = (nodeBox.width * scaleFactor) / 2 + 1;
    const hh = (nodeBox.height * scaleFactor) / 2 + 1;

    const scaleX = dx === 0 ? Infinity : Math.abs(hw / dx);
    const scaleY = dy === 0 ? Infinity : Math.abs(hh / dy);
    const scale = Math.min(scaleX, scaleY);

    return {
      x: to.x - dx * scale,
      y: to.y - dy * scale
    };
  };

  const handleExportImage = useCallback(() => {
    const baseExportScale = 2;
    const exportPadding = 80;
    const maxCanvasDimension = 8192;
    const renderScale = 1;
    const canvas = document.createElement('canvas');

    const createContext = (width: number, height: number) => {
      const safeWidth = Math.max(1, Math.ceil(width));
      const safeHeight = Math.max(1, Math.ceil(height));
      const scaleLimit = Math.min(
        1,
        maxCanvasDimension / Math.max(safeWidth * baseExportScale, safeHeight * baseExportScale, 1),
      );
      const exportScale = Math.max(0.5, Number((baseExportScale * scaleLimit).toFixed(2)));

      canvas.width = Math.max(1, Math.round(safeWidth * exportScale));
      canvas.height = Math.max(1, Math.round(safeHeight * exportScale));

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.scale(exportScale, exportScale);
      ctx.imageSmoothingEnabled = true;
      return { ctx, width: safeWidth, height: safeHeight, exportScale };
    };

    const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
      activeCtx.beginPath();
      activeCtx.moveTo(x + r, y);
      activeCtx.lineTo(x + w - r, y);
      activeCtx.quadraticCurveTo(x + w, y, x + w, y + r);
      activeCtx.lineTo(x + w, y + h - r);
      activeCtx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      activeCtx.lineTo(x + r, y + h);
      activeCtx.quadraticCurveTo(x, y + h, x, y + h - r);
      activeCtx.lineTo(x, y + r);
      activeCtx.quadraticCurveTo(x, y, x + r, y);
      activeCtx.closePath();
    };

    const drawNodeShadow = (nodeStyle: NodeStyle, isFocused: boolean, isSelected: boolean) => {
      if (nodeStyle === 'text') {
        activeCtx.shadowColor = 'transparent';
        activeCtx.shadowBlur = 0;
        activeCtx.shadowOffsetY = 0;
        return;
      }
      if (isFocused) {
        activeCtx.shadowColor = themeColors.shadowFocused;
        activeCtx.shadowBlur = 18 * renderScale;
        activeCtx.shadowOffsetY = 4 * renderScale;
        return;
      }
      if (isSelected) {
        activeCtx.shadowColor = themeColors.shadowSelected;
        activeCtx.shadowBlur = 12 * renderScale;
        activeCtx.shadowOffsetY = 3 * renderScale;
        return;
      }
      activeCtx.shadowColor = themeColors.shadowBase;
      activeCtx.shadowBlur = 8 * renderScale;
      activeCtx.shadowOffsetY = 2 * renderScale;
    };

    const drawArrow = (from: { x: number; y: number }, to: { x: number; y: number }, color: string) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return;
      const ux = dx / len;
      const uy = dy / len;
      const size = 9 * renderScale;
      const perpX = -uy;
      const perpY = ux;
      const tip = to;
      const baseX = tip.x - ux * size;
      const baseY = tip.y - uy * size;
      activeCtx.beginPath();
      activeCtx.moveTo(tip.x, tip.y);
      activeCtx.lineTo(baseX + perpX * (size * 0.4), baseY + perpY * (size * 0.4));
      activeCtx.lineTo(baseX - perpX * (size * 0.4), baseY - perpY * (size * 0.4));
      activeCtx.closePath();
      activeCtx.fillStyle = color;
      activeCtx.fill();
    };

    if (nodes.length === 0) {
      const emptyExport = createContext(1600, 900);
      if (!emptyExport) return;

      const { ctx } = emptyExport;
      ctx.fillStyle = themeColors.canvasBackground;
      ctx.fillRect(0, 0, emptyExport.width, emptyExport.height);
      ctx.fillStyle = themeColors.canvasGrid;
      for (let x = 0; x <= emptyExport.width; x += GRID_SIZE) {
        for (let y = 0; y <= emptyExport.height; y += GRID_SIZE) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.fillStyle = themeColors.canvasHintTitle;
      ctx.font = '700 28px Inter, ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.stormSystemTitle, emptyExport.width / 2, emptyExport.height / 2 - 12);
      ctx.fillStyle = themeColors.canvasHintSubtitle;
      ctx.font = '500 20px Inter, ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(t.emptyHint, emptyExport.width / 2, emptyExport.height / 2 + 28);
      canvas.toBlob((blob) => {
        if (!blob) return;
        triggerDownload(blob, `sysmind-${new Date().toISOString().slice(0, 10)}.png`);
      }, 'image/png');
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const includeRect = (left: number, top: number, width: number, height: number) => {
      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, left + width);
      maxY = Math.max(maxY, top + height);
    };

    const includePoint = (x: number, y: number, radius = 0) => {
      includeRect(x - radius, y - radius, radius * 2, radius * 2);
    };

    nodes.forEach(node => {
      const nodeBox = getNodeBoxSize(node.text);
      const isFocused = focused?.type === 'node' && focused.id === node.id;
      const focusScale = isFocused ? 1.05 : 1;
      const nodeWidth = nodeBox.width * focusScale;
      const nodeHeight = nodeBox.height * focusScale;
      includeRect(node.x - nodeWidth / 2, node.y - nodeHeight / 2, nodeWidth, nodeHeight);
    });

    connections.forEach(conn => {
      const fromNode = getNode(conn.fromId);
      if (!fromNode) return;
      const toNode = conn.toId ? getNode(conn.toId) : null;
      const rawStartX = fromNode.x;
      const rawStartY = fromNode.y;
      const rawEndX = toNode ? toNode.x : (conn.tempToPos?.x ?? rawStartX + lastDirection.x);
      const rawEndY = toNode ? toNode.y : (conn.tempToPos?.y ?? rawStartY + lastDirection.y);
      const curveOffsetRaw = getConnectionCurveOffsetRaw(conn, { x: rawStartX, y: rawStartY }, { x: rawEndX, y: rawEndY });
      const directionMultiplier = conn.toId && conn.fromId > conn.toId ? -1 : 1;
      const curveOffset = curveOffsetRaw * directionMultiplier;
      const centerDx = rawEndX - rawStartX;
      const centerDy = rawEndY - rawStartY;
      const centerLen = Math.hypot(centerDx, centerDy);
      const normalX = centerLen === 0 ? 0 : -centerDy / centerLen;
      const normalY = centerLen === 0 ? 0 : centerDx / centerLen;
      const tangentLen = Math.max(26, centerLen * 0.22);
      const c1CenterX = rawStartX + (centerLen === 0 ? 0 : (centerDx / centerLen) * tangentLen) + normalX * curveOffset;
      const c1CenterY = rawStartY + (centerLen === 0 ? 0 : (centerDy / centerLen) * tangentLen) + normalY * curveOffset;
      const c2CenterX = rawEndX - (centerLen === 0 ? 0 : (centerDx / centerLen) * tangentLen) + normalX * curveOffset;
      const c2CenterY = rawEndY - (centerLen === 0 ? 0 : (centerDy / centerLen) * tangentLen) + normalY * curveOffset;
      const startPoint = getEdgePoint({ x: c1CenterX, y: c1CenterY }, { x: rawStartX, y: rawStartY }, fromNode.id);
      const endPoint = toNode
        ? getEdgePoint({ x: c2CenterX, y: c2CenterY }, { x: rawEndX, y: rawEndY }, toNode.id)
        : { x: rawEndX, y: rawEndY };
      const c1World = { x: startPoint.x + (c1CenterX - rawStartX), y: startPoint.y + (c1CenterY - rawStartY) };
      const c2World = { x: endPoint.x + (c2CenterX - rawEndX), y: endPoint.y + (c2CenterY - rawEndY) };
      const linePadding = 12;

      includePoint(startPoint.x, startPoint.y, linePadding);
      includePoint(endPoint.x, endPoint.y, linePadding);
      includePoint(c1World.x, c1World.y, linePadding);
      includePoint(c2World.x, c2World.y, linePadding);

      if (conn.text) {
        const labelBox = getConnectionLabelSize(conn.text);
        const labelX = curveOffset === 0
          ? (startPoint.x + endPoint.x) / 2
          : 0.125 * startPoint.x + 0.375 * c1World.x + 0.375 * c2World.x + 0.125 * endPoint.x;
        const labelY = curveOffset === 0
          ? (startPoint.y + endPoint.y) / 2
          : 0.125 * startPoint.y + 0.375 * c1World.y + 0.375 * c2World.y + 0.125 * endPoint.y;
        includeRect(
          labelX - labelBox.width / 2 - 6,
          labelY - labelBox.height / 2 - 6,
          labelBox.width + 12,
          labelBox.height + 12,
        );
      }
    });

    const contentWidth = Math.max(1, Math.ceil(maxX - minX));
    const contentHeight = Math.max(1, Math.ceil(maxY - minY));
    const exportWidth = contentWidth + exportPadding * 2;
    const exportHeight = contentHeight + exportPadding * 2;
    const exportResult = createContext(exportWidth, exportHeight);
    if (!exportResult) return;

    const { ctx: activeCtx, width, height } = exportResult;
    const worldToScreen = (point: { x: number; y: number }) => ({
      x: (point.x - minX) * renderScale + exportPadding,
      y: (point.y - minY) * renderScale + exportPadding,
    });

    activeCtx.fillStyle = themeColors.canvasBackground;
    activeCtx.fillRect(0, 0, width, height);

    activeCtx.fillStyle = themeColors.canvasGrid;
    const gridStartX = exportPadding - ((((minX % GRID_SIZE) + GRID_SIZE) % GRID_SIZE) * renderScale);
    const gridStartY = exportPadding - ((((minY % GRID_SIZE) + GRID_SIZE) % GRID_SIZE) * renderScale);
    for (let x = gridStartX; x <= width; x += GRID_SIZE) {
      for (let y = gridStartY; y <= height; y += GRID_SIZE) {
        activeCtx.fillRect(x, y, 1, 1);
      }
    }

    connections.forEach(conn => {
      const fromNode = getNode(conn.fromId);
      if (!fromNode) return;
      const toNode = conn.toId ? getNode(conn.toId) : null;
      const rawStartX = fromNode.x;
      const rawStartY = fromNode.y;
      const rawEndX = toNode ? toNode.x : (conn.tempToPos?.x ?? rawStartX + lastDirection.x);
      const rawEndY = toNode ? toNode.y : (conn.tempToPos?.y ?? rawStartY + lastDirection.y);

      const curveOffsetRaw = getConnectionCurveOffsetRaw(conn, { x: rawStartX, y: rawStartY }, { x: rawEndX, y: rawEndY });
      const directionMultiplier = conn.toId && conn.fromId > conn.toId ? -1 : 1;
      const curveOffset = curveOffsetRaw * directionMultiplier;
      const centerDx = rawEndX - rawStartX;
      const centerDy = rawEndY - rawStartY;
      const centerLen = Math.hypot(centerDx, centerDy);
      const normalX = centerLen === 0 ? 0 : -centerDy / centerLen;
      const normalY = centerLen === 0 ? 0 : centerDx / centerLen;
      const tangentLen = Math.max(26, centerLen * 0.22);
      const c1CenterX = rawStartX + (centerLen === 0 ? 0 : (centerDx / centerLen) * tangentLen) + normalX * curveOffset;
      const c1CenterY = rawStartY + (centerLen === 0 ? 0 : (centerDy / centerLen) * tangentLen) + normalY * curveOffset;
      const c2CenterX = rawEndX - (centerLen === 0 ? 0 : (centerDx / centerLen) * tangentLen) + normalX * curveOffset;
      const c2CenterY = rawEndY - (centerLen === 0 ? 0 : (centerDy / centerLen) * tangentLen) + normalY * curveOffset;

      const startPoint = getEdgePoint({ x: c1CenterX, y: c1CenterY }, { x: rawStartX, y: rawStartY }, fromNode.id);
      const endPoint = toNode
        ? getEdgePoint({ x: c2CenterX, y: c2CenterY }, { x: rawEndX, y: rawEndY }, toNode.id)
        : { x: rawEndX, y: rawEndY };

      const c1World = { x: startPoint.x + (c1CenterX - rawStartX), y: startPoint.y + (c1CenterY - rawStartY) };
      const c2World = { x: endPoint.x + (c2CenterX - rawEndX), y: endPoint.y + (c2CenterY - rawEndY) };
      const start = worldToScreen(startPoint);
      const end = worldToScreen(endPoint);
      const c1 = worldToScreen(c1World);
      const c2 = worldToScreen(c2World);
      const color = themeColors.connectionBase;

      activeCtx.beginPath();
      activeCtx.moveTo(start.x, start.y);
      if (curveOffset === 0) {
        activeCtx.lineTo(end.x, end.y);
      } else {
        activeCtx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
      }
      activeCtx.strokeStyle = color;
      activeCtx.lineWidth = 2 * renderScale;
      activeCtx.lineCap = 'round';
      activeCtx.stroke();

      if (['forward', 'both'].includes(conn.style)) {
        drawArrow(curveOffset === 0 ? start : c2, end, color);
      }
      if (['backward', 'both'].includes(conn.style)) {
        drawArrow(curveOffset === 0 ? end : c1, start, color);
      }

      if (conn.text) {
        const labelBox = getConnectionLabelSize(conn.text);
        const labelWidth = labelBox.width * renderScale;
        const labelHeight = labelBox.height * renderScale;
        const labelX = curveOffset === 0
          ? (startPoint.x + endPoint.x) / 2
          : 0.125 * startPoint.x + 0.375 * c1World.x + 0.375 * c2World.x + 0.125 * endPoint.x;
        const labelY = curveOffset === 0
          ? (startPoint.y + endPoint.y) / 2
          : 0.125 * startPoint.y + 0.375 * c1World.y + 0.375 * c2World.y + 0.125 * endPoint.y;
        const labelTopLeft = worldToScreen({ x: labelX - labelWidth / (2 * renderScale), y: labelY - labelHeight / (2 * renderScale) });

        activeCtx.fillStyle = themeColors.labelBackground;
        drawRoundedRect(labelTopLeft.x, labelTopLeft.y, labelWidth, labelHeight, 6 * renderScale);
        activeCtx.fill();
        activeCtx.strokeStyle = themeColors.labelBorder;
        activeCtx.lineWidth = 1 * renderScale;
        activeCtx.stroke();

        activeCtx.fillStyle = themeColors.labelText;
        activeCtx.font = `500 ${10 * renderScale}px Inter, ui-sans-serif, system-ui, sans-serif`;
        activeCtx.textAlign = 'center';
        activeCtx.textBaseline = 'middle';
        const textBlockHeight = labelBox.lines.length * CONNECTION_LABEL_LINE_HEIGHT * renderScale;
        const firstLineY = labelTopLeft.y + (labelHeight - textBlockHeight) / 2 + CONNECTION_LABEL_LINE_HEIGHT * renderScale * 0.78;
        labelBox.lines.forEach((line, idx) => {
          activeCtx.fillText(line, labelTopLeft.x + labelWidth / 2, firstLineY + idx * CONNECTION_LABEL_LINE_HEIGHT * renderScale);
        });
      }
    });

    nodes.forEach(node => {
      const isFocused = focused?.type === 'node' && focused.id === node.id;
      const isSelected = selectedNodeIds.includes(node.id);
      const nodeBox = getNodeBoxSize(node.text);
      const nodeStyle = node.style || 'default';
      const nodeWidth = nodeBox.width * renderScale;
      const nodeHeight = nodeBox.height * renderScale;
      const nodePosition = worldToScreen({ x: node.x, y: node.y });
      const x = nodePosition.x - nodeWidth / 2;
      const y = nodePosition.y - nodeHeight / 2;

      const { fill, stroke, textColor, lineWidth } = getNodeCanvasVisual(
        nodeStyle,
        isFocused,
        isSelected,
        isDarkTheme,
        renderScale,
      );

      drawNodeShadow(nodeStyle, isFocused, isSelected);
      activeCtx.fillStyle = fill;
      activeCtx.strokeStyle = stroke;
      activeCtx.lineWidth = lineWidth;
      drawRoundedRect(x, y, nodeWidth, nodeHeight, 16 * renderScale);
      activeCtx.fill();
      if (lineWidth > 0) activeCtx.stroke();
      activeCtx.shadowColor = 'transparent';
      activeCtx.shadowBlur = 0;
      activeCtx.shadowOffsetY = 0;

      activeCtx.fillStyle = textColor;
      activeCtx.font = `500 ${14 * renderScale}px Inter, ui-sans-serif, system-ui, sans-serif`;
      activeCtx.textBaseline = 'top';
      if (nodeBox.lines.length > 1) {
        activeCtx.textAlign = 'left';
        const textX = x + (NODE_TEXT_H_PADDING / 2) * renderScale;
        const firstLineY = y + NODE_TEXT_V_PADDING * renderScale;
        nodeBox.lines.forEach((line, idx) => {
          activeCtx.fillText(line, textX, firstLineY + idx * NODE_TEXT_LINE_HEIGHT * renderScale);
        });
      } else {
        activeCtx.textAlign = 'center';
        const textX = x + nodeWidth / 2;
        const textY = y + (nodeHeight - NODE_TEXT_LINE_HEIGHT * renderScale) / 2;
        activeCtx.fillText(nodeBox.lines[0], textX, textY);
      }
    });

    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(blob, `sysmind-${new Date().toISOString().slice(0, 10)}.png`);
    }, 'image/png');
  }, [connections, focused?.id, focused?.type, getConnectionLabelSize, getConnectionCurveOffsetRaw, getEdgePoint, getNode, getNodeBoxSize, isDarkTheme, lastDirection, nodes, selectedNodeIds, t, themeColors]);

  const getConnectionHandlePoints = (conn: Connection) => {
    const geometry = getConnectionGeometry(conn);
    if (!geometry) return null;
    return {
      start: geometry.start,
      end: geometry.end,
    };
  };

  const getHoveredEndpointAtClientPoint = (clientX: number, clientY: number) => {
    const perfStart = performance.now();
    const world = getWorldPointFromClient(clientX, clientY);
    const threshold = 18 / (canvasScale === 0 ? 1 : canvasScale);

    let best: { connId: string; endpoint: 'start' | 'end'; dist: number } | null = null;

    for (const conn of connections) {
      const points = getConnectionHandlePoints(conn);
      if (!points) continue;

      const startDist = Math.hypot(world.x - points.start.x, world.y - points.start.y);
      if (startDist <= threshold && (!best || startDist < best.dist)) {
        best = { connId: conn.id, endpoint: 'start', dist: startDist };
      }

      const endDist = Math.hypot(world.x - points.end.x, world.y - points.end.y);
      if (endDist <= threshold && (!best || endDist < best.dist)) {
        best = { connId: conn.id, endpoint: 'end', dist: endDist };
      }
    }

    const perfState = getPerfDebugState();
    if (perfState) {
      perfState.hoverCount += 1;
      perfState.hoverTotalMs += performance.now() - perfStart;
    }
    if (!best) return null;
    return { connId: best.connId, endpoint: best.endpoint };
  };

  // #region debug-point B:perf-flush
  useEffect(() => {
    const perfState = getPerfDebugState();
    if (!perfState) return;

    perfState.renderCount += 1;
    perfState.renderTotalMs += performance.now() - renderPerfStart;

    const itemCount = nodes.length + connections.length;
    const now = performance.now();
    if (itemCount < 80 || now - perfState.lastFlushTs < 1500) return;

    perfState.lastFlushTs = now;
    reportPerfDebug('B', 'App.tsx:perf-flush', 'graph perf snapshot', {
      nodes: nodes.length,
      connections: connections.length,
      itemCount,
      focusedType: focused?.type ?? 'none',
      isEditing,
      isPanning,
      draggingNodeCount: draggingNodeIds?.length ?? 0,
      draggingEndpoint: Boolean(draggingEndpoint),
      draggingCurveControl: Boolean(draggingCurveControl),
      selectionActive: Boolean(selectionBox),
      renderCount: perfState.renderCount,
      renderAvgMs: Number((perfState.renderTotalMs / Math.max(perfState.renderCount, 1)).toFixed(3)),
      measureTextCount: perfState.measureTextCount,
      measureTextAvgMs: Number((perfState.measureTextTotalMs / Math.max(perfState.measureTextCount, 1)).toFixed(4)),
      adaptiveCount: perfState.adaptiveCount,
      adaptiveAvgMs: Number((perfState.adaptiveTotalMs / Math.max(perfState.adaptiveCount, 1)).toFixed(4)),
      overlapCount: perfState.overlapCount,
      overlapAvgMs: Number((perfState.overlapTotalMs / Math.max(perfState.overlapCount, 1)).toFixed(4)),
      hoverCount: perfState.hoverCount,
      hoverAvgMs: Number((perfState.hoverTotalMs / Math.max(perfState.hoverCount, 1)).toFixed(4)),
      historyCount: perfState.historyCount,
      historyAvgMs: Number((perfState.historyTotalMs / Math.max(perfState.historyCount, 1)).toFixed(4)),
    });
    resetPerfDebugCounters(perfState);
  }, [
    connections.length,
    draggingCurveControl,
    draggingEndpoint,
    draggingNodeIds,
    focused?.type,
    isEditing,
    isPanning,
    nodes.length,
    renderPerfStart,
    selectionBox,
  ]);
  // #endregion


  useEffect(() => {
    if (searchQuery !== null && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchQuery]);

  // Bind native non-passive wheel event listener to prevent default browser gestures
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Store handler in ref so we can remove it later
    wheelHandlerRef.current = (e: WheelEvent) => {
      handleWheel(e);
    };

    canvas.addEventListener('wheel', wheelHandlerRef.current, { passive: false });

    return () => {
      if (wheelHandlerRef.current) {
        canvas.removeEventListener('wheel', wheelHandlerRef.current);
      }
    };
  }, [handleWheel]);



  return (

    <div
      ref={canvasRef}
      className={`app-shell theme-${theme} ${tutorialCanvasMode ? 'tutorial-canvas-mode' : ''} w-full h-screen overflow-hidden relative font-sans select-none`}
      tabIndex={tutorialCanvasMode ? -1 : undefined}
      autoFocus={tutorialCanvasMode}
      onMouseDownCapture={tutorialCanvasMode ? (event) => {
        if (tutorialActionId !== 'open-settings') {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
        }
      } : undefined}
      onClickCapture={tutorialCanvasMode ? (event) => {
        if (tutorialActionId !== 'open-settings') {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
        }
      } : undefined}
      onContextMenuCapture={tutorialCanvasMode ? (event) => {
        if (tutorialActionId !== 'open-settings') {
          event.preventDefault();
          event.stopPropagation();
        }
      } : undefined}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => setHoveredEndpoint(null)}
      onMouseDown={handleCanvasMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Grid Pattern */}
      <div 
        className="app-grid absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#000 1px, transparent 0)`,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          transform: `translate(${canvasOffset.x % GRID_SIZE}px, ${canvasOffset.y % GRID_SIZE}px)`
        }}
      />

      {/* Empty Canvas Hint */}
      <AnimatePresence>
        {nodes.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none"
          >
            <span className="app-empty-title text-base font-semibold text-slate-400 select-none tracking-wide" style={{ color: themeColors.canvasHintTitle }}>
              {t.stormSystemTitle}
            </span>
            <span className="app-empty-subtitle text-2xl font-medium text-slate-300 select-none tracking-wide" style={{ color: themeColors.canvasHintSubtitle }}>
              {t.emptyHint}
            </span>

          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        className="absolute inset-0"
        style={{ transformOrigin: '0 0' }}
        animate={{ x: canvasOffset.x, y: canvasOffset.y, scale: canvasScale }}
        transition={{ duration: 0 }}
      >
        {/* Connections */}
        <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none overflow-visible">
          <defs>
            <marker id="arrowhead-end" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M 5 2.5 L 11 6 L 5 9.5" fill="none" stroke={themeColors.connectionBase} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrowhead-start" markerWidth="12" markerHeight="12" refX="1" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M 7 2.5 L 1 6 L 7 9.5" fill="none" stroke={themeColors.connectionBase} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrowhead-end-focused" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M 5 2.5 L 11 6 L 5 9.5" fill="none" stroke={themeColors.connectionFocused} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrowhead-start-focused" markerWidth="12" markerHeight="12" refX="1" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M 7 2.5 L 1 6 L 7 9.5" fill="none" stroke={themeColors.connectionFocused} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
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

            const curveOffsetRaw = getConnectionCurveOffsetRaw(conn, { x: rawStartX, y: rawStartY }, { x: rawEndX, y: rawEndY });
            const directionMultiplier = conn.toId && conn.fromId > conn.toId ? -1 : 1;
            const curveOffset = curveOffsetRaw * directionMultiplier;


            const centerDx = rawEndX - rawStartX;
            const centerDy = rawEndY - rawStartY;
            const centerLen = Math.hypot(centerDx, centerDy);
            const normalX = centerLen === 0 ? 0 : -centerDy / centerLen;
            const normalY = centerLen === 0 ? 0 : centerDx / centerLen;

            const tangentLen = Math.max(26, centerLen * 0.22);
            const c1CenterX = rawStartX + (centerLen === 0 ? 0 : (centerDx / centerLen) * tangentLen) + normalX * curveOffset;
            const c1CenterY = rawStartY + (centerLen === 0 ? 0 : (centerDy / centerLen) * tangentLen) + normalY * curveOffset;
            const c2CenterX = rawEndX - (centerLen === 0 ? 0 : (centerDx / centerLen) * tangentLen) + normalX * curveOffset;
            const c2CenterY = rawEndY - (centerLen === 0 ? 0 : (centerDy / centerLen) * tangentLen) + normalY * curveOffset;

            const startPoint = getEdgePoint(
              { x: c1CenterX, y: c1CenterY },
              { x: rawStartX, y: rawStartY },
              fromNode.id,
            );
            const endPoint = toNode
              ? getEdgePoint(
                  { x: c2CenterX, y: c2CenterY },
                  { x: rawEndX, y: rawEndY },
                  toNode.id,
                )
              : { x: rawEndX, y: rawEndY };

            const startX = startPoint.x;
            const startY = startPoint.y;
            const endX = endPoint.x;
            const endY = endPoint.y;

            const c1x = startX + (c1CenterX - rawStartX);
            const c1y = startY + (c1CenterY - rawStartY);
            const c2x = endX + (c2CenterX - rawEndX);
            const c2y = endY + (c2CenterY - rawEndY);

            const pathD = curveOffset === 0
              ? `M ${startX} ${startY} L ${endX} ${endY}`
              : `M ${startX} ${startY} C ${c1x} ${c1y} ${c2x} ${c2y} ${endX} ${endY}`;


            const isFocused = focused?.type === 'connection' && focused.id === conn.id;
            const isSelected = selectedConnectionIdSet.has(conn.id);
            const showStartHandle =
              draggingEndpoint?.connId === conn.id
              || (hoveredEndpoint?.connId === conn.id && hoveredEndpoint.endpoint === 'start');
            const showEndHandle =
              draggingEndpoint?.connId === conn.id
              || (hoveredEndpoint?.connId === conn.id && hoveredEndpoint.endpoint === 'end');
            const isDraggingCurveControl = draggingCurveControl?.connId === conn.id;
            const showCurveControlHandle = centerLen > 0 && (isSelected || isDraggingCurveControl) && !draggingEndpoint && !isEditing;
            const curveControlX = (rawStartX + rawEndX) / 2 + normalX * curveOffset * 0.75;
            const curveControlY = (rawStartY + rawEndY) / 2 + normalY * curveOffset * 0.75;
            const color = isFocused ? themeColors.connectionFocused : (isSelected ? themeColors.connectionSelected : themeColors.connectionBase);
            const strokeWidth = isFocused ? 3 : (isSelected ? 2.5 : 2);



            const labelBox = (conn.text || isFocused) ? getConnectionLabelSize(conn.text) : null;
            const labelWidth = labelBox?.width ?? CONNECTION_LABEL_MIN_WIDTH;
            const labelHeight = labelBox?.height ?? CONNECTION_LABEL_MIN_HEIGHT;
            const labelLines = labelBox?.lines ?? [''];
            const labelX = curveOffset === 0
              ? (startX + endX) / 2
              : 0.125 * startX + 0.375 * c1x + 0.375 * c2x + 0.125 * endX;
            const labelY = curveOffset === 0
              ? (startY + endY) / 2
              : 0.125 * startY + 0.375 * c1y + 0.375 * c2y + 0.125 * endY;
            const labelXRounded = Math.round(labelX);
            const labelRectX = Math.round(labelX - labelWidth / 2);
            const labelRectY = Math.round(labelY - labelHeight / 2);
            const labelTextBlockHeight = labelLines.length * CONNECTION_LABEL_LINE_HEIGHT;
            const labelFirstLineY = labelRectY
              + (labelHeight - labelTextBlockHeight) / 2
              + CONNECTION_LABEL_LINE_HEIGHT * 0.78;

            return (

              <g
                key={conn.id}
                className="pointer-events-auto cursor-pointer"
                onMouseDown={(e) => handleConnectionMouseDown(e, conn.id)}

                onClick={(e) => { e.stopPropagation(); }}
              >
                <path
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  markerEnd={['forward', 'both'].includes(conn.style) ? `url(#${isFocused ? 'arrowhead-end-focused' : 'arrowhead-end'})` : undefined}
                  markerStart={['backward', 'both'].includes(conn.style) ? `url(#${isFocused ? 'arrowhead-start-focused' : 'arrowhead-start'})` : undefined}
                  className="transition-colors duration-200"
                />
                {showStartHandle && (

                  <>
                    <circle
                      cx={startX}
                      cy={startY}
                      r={16}
                      fill="transparent"
                      onMouseDown={(e) => handleConnectionEndpointMouseDown(e, conn.id, 'start')}
                      className="cursor-grab"
                    />
                    <circle
                      cx={startX}
                      cy={startY}
                      r={8}
                      fill={isFocused ? themeColors.connectionFocused : themeColors.connectionBase}
                      stroke={themeColors.handleStroke}
                      strokeWidth={1.5}
                      onMouseDown={(e) => handleConnectionEndpointMouseDown(e, conn.id, 'start')}
                      className="cursor-grab"
                    />
                  </>
                )}
                {showEndHandle && (
                  <>
                    <circle
                      cx={endX}
                      cy={endY}
                      r={16}
                      fill="transparent"
                      onMouseDown={(e) => handleConnectionEndpointMouseDown(e, conn.id, 'end')}
                      className="cursor-grab"
                    />
                    <circle
                      cx={endX}
                      cy={endY}
                      r={8}
                      fill={isFocused ? themeColors.connectionFocused : themeColors.connectionBase}
                      stroke={themeColors.handleStroke}
                      strokeWidth={1.5}
                      onMouseDown={(e) => handleConnectionEndpointMouseDown(e, conn.id, 'end')}
                      className="cursor-grab"
                    />
                  </>
                )}
                {/* Connection Label */}
                {conn.text && labelBox && !(isFocused && isEditing) && (
                  <g
                    pointerEvents="all"
                    onMouseDown={(e) => handleConnectionMouseDown(e, conn.id)}
                  >
                    <rect
                      x={labelRectX}
                      y={labelRectY}
                      width={labelWidth}
                      height={labelHeight}
                      rx={6}
                      fill={themeColors.labelBackground}
                      stroke={themeColors.labelBorder}
                    />
                    <text
                      x={labelXRounded}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="500"
                      fill={themeColors.labelText}
                      style={{ userSelect: 'none' }}
                    >
                      {labelLines.map((line, idx) => (
                        <tspan
                          key={`${conn.id}-line-${idx}`}
                          x={labelXRounded}
                          y={Math.round(labelFirstLineY + idx * CONNECTION_LABEL_LINE_HEIGHT)}

                        >
                          {line}
                        </tspan>
                      ))}
                    </text>

                  </g>
                )}
                {isFocused && (
                  <foreignObject
                    x={labelRectX}
                    y={labelRectY}
                    width={labelWidth}
                    height={labelHeight}
                    onMouseDown={(e) => handleConnectionMouseDown(e, conn.id)}
                  >
                    <div className="flex items-center justify-center h-full relative">
                      <textarea
                        ref={inputRef}
                        rows={Math.max(1, labelLines.length)}
                        onMouseDown={(e) => {
                          if (isEditing) e.stopPropagation();
                        }}
                        className={`app-connection-editor absolute inset-0 w-full h-full border-2 rounded px-1 py-1 text-[10px] font-medium text-center outline-none shadow-lg transition-opacity z-10 resize-none overflow-hidden leading-[14px]
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
                    </div>
                  </foreignObject>

                )}
                {showCurveControlHandle && (
                  <>
                    <line
                      x1={(rawStartX + rawEndX) / 2}
                      y1={(rawStartY + rawEndY) / 2}
                      x2={curveControlX}
                      y2={curveControlY}
                      stroke={themeColors.handleStroke}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      pointerEvents="none"
                    />
                    <circle
                      cx={curveControlX}
                      cy={curveControlY}
                      r={16}
                      fill="transparent"
                      onMouseDown={(e) => handleConnectionCurveControlMouseDown(e, conn.id)}
                      className="cursor-grab"
                    />
                    <circle
                      cx={curveControlX}
                      cy={curveControlY}
                      r={7}
                      fill={isFocused ? themeColors.connectionFocused : themeColors.connectionSelected}
                      stroke={themeColors.handleStroke}
                      strokeWidth={1.5}
                      onMouseDown={(e) => handleConnectionCurveControlMouseDown(e, conn.id)}
                      className="cursor-grab"
                    />
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map(node => {
          const isFocused = focused?.type === 'node' && focused.id === node.id;
          const isSelected = selectedNodeIdSet.has(node.id);
          const nodeBox = getNodeBoxSize(node.text);
          const nodeStyle = node.style || 'default';

          const nodeLines = nodeBox.lines;
          const textAlignClass = 'text-center';
          return (
            <motion.div
              key={node.id}
              initial={false}
              animate={{
                x: node.x - nodeBox.width / 2,
                y: node.y - nodeBox.height / 2,
                scale: isFocused ? 1.05 : 1,
              }}
              transition={{
                x: { duration: 0 },
                y: { duration: 0 },
                scale: { type: 'spring', stiffness: 300, damping: 30 }
              }}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              style={{ width: nodeBox.width, height: nodeBox.height }}
              className={`group absolute flex items-center justify-center rounded-xl border-2 transition-colors duration-200 cursor-grab active:cursor-grabbing z-10
                ${getNodeStyleClasses(nodeStyle, isFocused, isSelected, isDarkTheme)}`}

            >
              {isFocused && (
                <textarea
                  ref={inputRef}
                  rows={Math.max(1, nodeLines.length)}
                  onMouseDown={(e) => {
                    if (isEditing) e.stopPropagation();
                  }}
                  className={`app-node-editor absolute inset-0 w-full h-full rounded-xl outline-none px-2 py-2 text-sm font-medium transition-opacity z-10 resize-none overflow-hidden leading-[18px] ${textAlignClass}
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
                <span className={`text-sm font-medium px-2 relative z-0 w-full ${textAlignClass} ${getNodeTextClasses(nodeStyle, isDarkTheme)}`}>
                  {nodeBox.lines.length > 0 && node.text ? (
                    nodeBox.lines.map((line, i) => (
                      <span key={i} className="block">{line || '\u00A0'}</span>
                    ))
                  ) : (
                    <span className="app-node-placeholder italic">{t.newNode}</span>
                  )}
                </span>
              )}
              {(isFocused || isSelected) && !(isFocused && isEditing) && (
                <>
                  {/* Left port */}
                  <div
                    className="absolute left-0 top-1/2 w-3.5 h-3.5 translate-x-1 -translate-y-1/2 rounded-full cursor-crosshair z-20 transition-opacity opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
                    style={{ backgroundColor: themeColors.connectionFocused }}
                    onMouseDown={(e) => handlePortMouseDown(e, node.id, 'left')}
                  />
                  {/* Right port */}
                  <div
                    className="absolute right-0 top-1/2 w-3.5 h-3.5 -translate-x-1 -translate-y-1/2 rounded-full cursor-crosshair z-20 transition-opacity opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
                    style={{ backgroundColor: themeColors.connectionFocused }}
                    onMouseDown={(e) => handlePortMouseDown(e, node.id, 'right')}
                  />
                </>
              )}
            </motion.div>
          );
        })}

        <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none overflow-visible z-30">
          {connections.map(conn => {
            const fromNode = getNode(conn.fromId);
            const toNode = conn.toId ? getNode(conn.toId) : null;
            if (!fromNode) return null;

            const rawStartX = fromNode.x;
            const rawStartY = fromNode.y;
            const rawEndX = toNode ? toNode.x : (conn.tempToPos?.x ?? rawStartX + lastDirection.x);
            const rawEndY = toNode ? toNode.y : (conn.tempToPos?.y ?? rawStartY + lastDirection.y);

            const curveOffsetRaw = getConnectionCurveOffsetRaw(conn, { x: rawStartX, y: rawStartY }, { x: rawEndX, y: rawEndY });
            const directionMultiplier = conn.toId && conn.fromId > conn.toId ? -1 : 1;
            const curveOffset = curveOffsetRaw * directionMultiplier;

            const centerDx = rawEndX - rawStartX;
            const centerDy = rawEndY - rawStartY;
            const centerLen = Math.hypot(centerDx, centerDy);
            const normalX = centerLen === 0 ? 0 : -centerDy / centerLen;
            const normalY = centerLen === 0 ? 0 : centerDx / centerLen;
            const tangentLen = Math.max(26, centerLen * 0.22);
            const c1CenterX = rawStartX + (centerLen === 0 ? 0 : (centerDx / centerLen) * tangentLen) + normalX * curveOffset;
            const c1CenterY = rawStartY + (centerLen === 0 ? 0 : (centerDy / centerLen) * tangentLen) + normalY * curveOffset;
            const c2CenterX = rawEndX - (centerLen === 0 ? 0 : (centerDx / centerLen) * tangentLen) + normalX * curveOffset;
            const c2CenterY = rawEndY - (centerLen === 0 ? 0 : (centerDy / centerLen) * tangentLen) + normalY * curveOffset;

            const startPoint = getEdgePoint(
              { x: c1CenterX, y: c1CenterY },
              { x: rawStartX, y: rawStartY },
              fromNode.id,
            );
            const endPoint = toNode
              ? getEdgePoint(
                  { x: c2CenterX, y: c2CenterY },
                  { x: rawEndX, y: rawEndY },
                  toNode.id,
                )
              : { x: rawEndX, y: rawEndY };

            const isFocused = focused?.type === 'connection' && focused.id === conn.id;
            const isSelected = selectedConnectionIdSet.has(conn.id);
            const isDraggingCurveControl = draggingCurveControl?.connId === conn.id;
            const showStartHandle =
              draggingEndpoint?.connId === conn.id
              || (hoveredEndpoint?.connId === conn.id && hoveredEndpoint.endpoint === 'start');
            const showEndHandle =
              draggingEndpoint?.connId === conn.id
              || (hoveredEndpoint?.connId === conn.id && hoveredEndpoint.endpoint === 'end');
            const showCurveControlHandle = centerLen > 0 && (isSelected || isDraggingCurveControl) && !draggingEndpoint && !isEditing;
            const curveControlX = (rawStartX + rawEndX) / 2 + normalX * curveOffset * 0.75;
            const curveControlY = (rawStartY + rawEndY) / 2 + normalY * curveOffset * 0.75;

            if (!showStartHandle && !showEndHandle && !showCurveControlHandle) return null;

            return (
              <g key={`overlay-handles-${conn.id}`} className="pointer-events-auto">
                {showStartHandle && (
                  <>
                    <circle
                      cx={startPoint.x}
                      cy={startPoint.y}
                      r={16}
                      fill="transparent"
                      onMouseDown={(e) => handleConnectionEndpointMouseDown(e, conn.id, 'start')}
                      className="cursor-grab"
                    />
                    <circle
                      cx={startPoint.x}
                      cy={startPoint.y}
                      r={8}
                      fill={isFocused ? themeColors.connectionFocused : themeColors.connectionBase}
                      stroke={themeColors.handleStroke}
                      strokeWidth={1.5}
                      onMouseDown={(e) => handleConnectionEndpointMouseDown(e, conn.id, 'start')}
                      className="cursor-grab"
                    />
                  </>
                )}
                {showEndHandle && (
                  <>
                    <circle
                      cx={endPoint.x}
                      cy={endPoint.y}
                      r={16}
                      fill="transparent"
                      onMouseDown={(e) => handleConnectionEndpointMouseDown(e, conn.id, 'end')}
                      className="cursor-grab"
                    />
                    <circle
                      cx={endPoint.x}
                      cy={endPoint.y}
                      r={8}
                      fill={isFocused ? themeColors.connectionFocused : themeColors.connectionBase}
                      stroke={themeColors.handleStroke}
                      strokeWidth={1.5}
                      onMouseDown={(e) => handleConnectionEndpointMouseDown(e, conn.id, 'end')}
                      className="cursor-grab"
                    />
                  </>
                )}
                {showCurveControlHandle && (
                  <>
                    <line
                      x1={(rawStartX + rawEndX) / 2}
                      y1={(rawStartY + rawEndY) / 2}
                      x2={curveControlX}
                      y2={curveControlY}
                      stroke={themeColors.handleStroke}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      pointerEvents="none"
                    />
                    <circle
                      cx={curveControlX}
                      cy={curveControlY}
                      r={16}
                      fill="transparent"
                      onMouseDown={(e) => handleConnectionCurveControlMouseDown(e, conn.id)}
                      className="cursor-grab"
                    />
                    <circle
                      cx={curveControlX}
                      cy={curveControlY}
                      r={7}
                      fill={isFocused ? themeColors.connectionFocused : themeColors.connectionSelected}
                      stroke={themeColors.handleStroke}
                      strokeWidth={1.5}
                      onMouseDown={(e) => handleConnectionCurveControlMouseDown(e, conn.id)}
                      className="cursor-grab"
                    />
                  </>
                )}
              </g>
            );
          })}
        </svg>
      
      </motion.div>


      {selectionBox && (
        <div
          className="absolute border border-blue-400 bg-blue-200/20 pointer-events-none z-30"
          style={{
            left: Math.min(selectionBox.start.x, selectionBox.current.x),
            top: Math.min(selectionBox.start.y, selectionBox.current.y),
            width: Math.abs(selectionBox.current.x - selectionBox.start.x),
            height: Math.abs(selectionBox.current.y - selectionBox.start.y),
          }}
        />
      )}

      {/* Search Overlay */}
      <AnimatePresence>
        {searchQuery !== null && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onMouseDown={(e) => e.stopPropagation()}
            className="app-popover absolute bottom-12 left-1/2 -translate-x-1/2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50"
          >
            <div className="app-popover-header p-3 border-bottom border-slate-100 flex items-center gap-2">
              <Search size={16} className="app-icon-muted text-slate-400" />
              <input
                ref={searchInputRef}
                className="app-input flex-1 outline-none text-sm text-slate-700"
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
                    className={`app-search-item px-4 py-2 text-sm cursor-pointer flex items-center justify-between ${idx === selectedIndex ? 'app-search-item-active bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}
                    onClick={() => {
                      if (focused?.type === 'connection') {
                        const pendingConn = getConnection(focused.id);
                        const nextBend = pendingConn ? getBestCurveBend(pendingConn.fromId, node.id, pendingConn.id) : 0;
                        setConnections(prev => prev.map(c => c.id === focused.id ? { ...c, toId: node.id, tempToPos: undefined, curveBend: nextBend, curveBendRatio: undefined } : c));

                        setSearchQuery(null);
                      }
                    }}
                  >
                    <span>{node.text || t.untitledNode}</span>
                    {idx === selectedIndex && <ArrowRight size={14} />}
                  </div>
                ))
              ) : (
                <div className="app-icon-muted px-4 py-8 text-center text-slate-400 text-xs">
                  {t.noNodesFound}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loadedFileMeta && (
        <div onMouseDown={(e) => e.stopPropagation()} className="app-badge absolute top-6 right-6 max-w-[420px] bg-white/85 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm px-3 py-1.5 text-xs text-slate-700 font-medium truncate z-40">
          {loadedFileMeta.name}
        </div>
      )}

      {/* Controls Help */}
      {!tutorialCanvasMode && <div className="absolute top-6 left-6 flex flex-col gap-4 pointer-events-none">

        <div className="flex items-center gap-6 pointer-events-auto">


          <h1 className="app-title flex items-center gap-2" aria-label="SysMind">
            <img className="app-brand-mark" src="./sysmind-mark.svg" alt="" aria-hidden="true" />
            <span className="app-brand-wordmark" aria-hidden="true"><span className="app-brand-sys">sys</span><span className="app-brand-mind">mind</span></span>
          </h1>

          <div className="app-panel flex items-center gap-1 bg-white/80 backdrop-blur-sm border border-slate-200 p-1 rounded-xl shadow-sm">
            <button 
              onClick={(e) => { e.stopPropagation(); undo(); }}
              disabled={history.index <= 0}
              title={t.undo}
              className="app-button p-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-600"
            >
              <ArrowLeft size={16} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); redo(); }}
              disabled={history.index >= history.stack.length - 1}
              title={t.redo}
              className="app-button p-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-600"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        <div className="app-panel flex items-center gap-1 bg-white/80 backdrop-blur-sm border border-slate-200 p-1 rounded-xl shadow-sm">
            <div className="app-divider flex items-center gap-1 pr-1 mr-1 border-r border-slate-200">
              <span className="app-label px-2 text-[11px] font-semibold text-slate-500">{t.language}</span>
              <button
                onClick={(e) => { e.stopPropagation(); setLanguage('zh'); }}
                title={t.languageZh}
                className={`app-segment-button px-2.5 py-1.5 rounded-lg transition-colors text-xs font-medium ${
                  language === 'zh'
                    ? 'app-segment-active bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                中文
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLanguage('en'); }}
                title={t.languageEn}
                className={`app-segment-button px-2.5 py-1.5 rounded-lg transition-colors text-xs font-medium ${
                  language === 'en'
                    ? 'app-segment-active bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                EN
              </button>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleImportFromPicker(); }}
              title={t.import}
              className="app-button flex items-center gap-1 px-2 py-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 text-xs font-medium"
            >
              <Upload size={14} />
              {t.import}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleExport(); }}
              title={t.export}
              className="app-button flex items-center gap-1 px-2 py-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 text-xs font-medium"
            >
              <Download size={14} />
              {t.export}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleExportImage(); }}
              title={t.exportImage}
              className="app-button flex items-center gap-1 px-2 py-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 text-xs font-medium"
            >
              <Download size={14} />
              {t.exportImage}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleNewCanvas(); }}
              title={t.newCanvas}
              className="app-button flex items-center gap-1 px-2 py-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 text-xs font-medium"
            >
              <FilePlus2 size={14} />
              {t.newCanvas}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleSaveToLoadedFile(); }}
              title={t.save}
              className="app-button flex items-center gap-1 px-2 py-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 text-xs font-medium"
            >
              <Save size={14} />
              {t.save}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setIsQuickStartOpen(true); }}
              title={t.quickStart}
              className="quick-start-trigger flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-semibold"
            >
              <GraduationCap size={15} />
              {t.quickStart}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setIsShortcutsModalOpen(true); }}
              title={t.settings}
              className="app-button flex items-center gap-1 px-2 py-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 text-xs font-medium"
            >
              <Settings size={14} />
              {t.settings}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImport}
            />
          </div>

        </div>

        <div className="app-panel w-[300px] bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm p-2 pointer-events-auto">


          <button
            onClick={(e) => { e.stopPropagation(); setIsShortcutsExpanded(prev => !prev); }}
            className="app-button w-full flex items-center justify-between text-[11px] font-semibold text-slate-600 px-1 py-1 rounded hover:bg-slate-100 transition-colors"
          >
            <span>{t.shortcuts}</span>
            <span className="flex items-center gap-1">
              {isShortcutsExpanded ? t.hideShortcuts : t.showShortcuts}
              {isShortcutsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>
          {isShortcutsExpanded && (
            <div className="mt-2 flex flex-col gap-2">
              <ShortcutGroup title={commonShortcutHints.title}>
                {commonShortcutHints.items.map(({ label, desc }) => (
                  <div key={`${label}-${desc}`}>
                    <Kbd label={label} desc={desc} />
                  </div>
                ))}
              </ShortcutGroup>
              <ShortcutGroup title={currentShortcutHints.title}>
                {currentShortcutHints.items.map(({ label, desc }) => (
                  <div key={`${label}-${desc}`}>
                    <Kbd label={label} desc={desc} />
                  </div>
                ))}
              </ShortcutGroup>
            </div>
          )}
        </div>
      </div>}

      {/* Style Indicator */}
      {!tutorialCanvasMode && focused?.type === 'connection' && (
        <div className="app-panel absolute bottom-6 right-6 bg-white px-4 py-2 rounded-full shadow-lg border border-slate-200 flex items-center gap-3 text-sm text-slate-600">
          <span className="font-medium">{t.style}</span>
          {getConnection(focused.id)?.style === 'forward' && <ArrowRight size={18} className="text-blue-500" />}
          {getConnection(focused.id)?.style === 'backward' && <ArrowLeft size={18} className="text-blue-500" />}
          {getConnection(focused.id)?.style === 'both' && <ArrowLeftRight size={18} className="text-blue-500" />}
          {getConnection(focused.id)?.style === 'none' && <Minus size={18} className="text-blue-500" />}
          <span className="text-xs text-slate-400">{t.tabToCycle}</span>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-xl shadow-lg text-sm font-medium backdrop-blur-sm border transition-all duration-300
            ${toast.type === 'success'
              ? 'bg-emerald-50/90 text-emerald-700 border-emerald-200'
              : 'bg-red-50/90 text-red-700 border-red-200'}`}
        >
          {toast.message}
        </div>
      )}

      {/* Shortcuts Settings Modal */}
      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
        shortcuts={shortcuts}
        onSave={setShortcuts}
        theme={theme}
        onThemeSave={setTheme}
        isBrowserApp={isBrowserApp}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        t={t}
        ctrlKey={ctrlKey}
      />
      {!tutorialCanvasMode && <QuickStartGuide
        isOpen={isQuickStartOpen}
        onClose={closeQuickStart}
        language={language}
        shortcuts={shortcuts}
        ctrlKey={ctrlKey}
        theme={theme}
      />}
    </div>
  );
}

function ShortcutGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="app-shortcut-group bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm p-2">
      <div className="app-label text-[10px] font-semibold text-slate-500 mb-1.5">{title}</div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Kbd({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="app-kbd-row w-full flex items-center justify-between gap-2 bg-white/80 backdrop-blur-sm border border-slate-200 px-2 py-1 rounded-lg shadow-sm">
      <kbd className="app-kbd px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-bold text-slate-600 uppercase tracking-wider shrink-0">{label}</kbd>
      <span className="app-kbd-desc text-[10px] text-slate-500 font-medium text-right">{desc}</span>
    </div>
  );
}
