import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clipboard,
  FileCog,
  Focus,
  Keyboard,
  Link2,
  MousePointer2,
  Network,
  Rocket,
  Sparkles,
  X,
  ZoomIn,
} from 'lucide-react';

import { formatShortcutLabel } from '../lib/shortcuts';
import {
  TUTORIAL_CHANNEL,
  TUTORIAL_QUERY_KEY,
  TutorialCanvasState,
  TutorialChildMessage,
  TutorialParentMessage,
  TutorialScenarioState,
} from '../lib/tutorialBridge';
import { AppLanguage } from '../lib/translations';
import { FocusedElement, KeyboardShortcuts, ShortcutConfig } from '../types';

type LessonId = 'basics' | 'nodes' | 'connections' | 'navigation' | 'canvas' | 'history' | 'system';
type ActionId =
  | 'create-node' | 'edit-node'
  | 'create-connection' | 'complete-connection' | 'create-node-below' | 'return-connection' | 'cycle-node-style' | 'move-node'
  | 'edit-connection' | 'cycle-connection-style' | 'search-link' | 'move-endpoint' | 'adjust-curve' | 'straighten-line'
  | 'focus-left' | 'focus-right' | 'focus-up' | 'focus-down' | 'delete-node' | 'delete-connection'
  | 'zoom-in' | 'zoom-out' | 'zoom-reset'
  | 'undo' | 'redo' | 'copy' | 'paste'
  | 'save' | 'open-settings';

interface QuickStartGuideProps {
  isOpen: boolean;
  onClose: () => void;
  language: AppLanguage;
  shortcuts: KeyboardShortcuts;
  ctrlKey: string;
  theme: 'light' | 'dark';
}

interface ActionCopy { title: string; body: string; success: string }

const LESSONS: Array<{ id: LessonId; actions: ActionId[] }> = [
  { id: 'basics', actions: ['create-node', 'edit-node'] },
  { id: 'nodes', actions: ['create-connection', 'complete-connection', 'return-connection', 'create-node-below', 'cycle-node-style', 'move-node'] },
  { id: 'connections', actions: ['edit-connection', 'cycle-connection-style', 'search-link', 'move-endpoint', 'adjust-curve', 'straighten-line'] },
  { id: 'navigation', actions: ['focus-left', 'focus-right', 'focus-up', 'focus-down', 'delete-node', 'delete-connection'] },
  { id: 'canvas', actions: ['zoom-in', 'zoom-out', 'zoom-reset'] },
  { id: 'history', actions: ['undo', 'redo', 'copy', 'paste'] },
  { id: 'system', actions: ['save', 'open-settings'] },
];

const LESSON_ICONS = [MousePointer2, Network, Link2, Focus, ZoomIn, Clipboard, FileCog];
const ALL_ACTIONS = LESSONS.flatMap(lesson => lesson.actions);
const lessonStartIndex = (lessonIndex: number) => LESSONS.slice(0, lessonIndex).reduce((total, item) => total + item.actions.length, 0);

const UI = {
  zh: {
    title: 'SysMind 快捷键训练', close: '关闭新手引导', eyebrow: 'SYSMIND 实战训练营',
    welcomeTitle: '用互动练习掌握全部快捷键',
    welcomeBody: '每组都会提供适合当前技能的独立练习图，帮助你逐步掌握节点、连线、搜索、焦点与文字编辑。',
    start: '开始实战训练', skip: '暂时跳过', group: '训练组', action: '操作', completed: '已完成', yourTurn: '轮到你了', actionComplete: '操作成功', sandbox: '互动练习',
    pressHint: '请在画布内按下快捷键；也可以点击右侧按键进行模拟', inputHint: '继续输入，并按 Enter 或 Esc 完成',
    nextAction: '下一个快捷键', nextGroup: '进入下一组', finish: '完成训练', previous: '上一步', enterToContinue: '按 Enter 也可继续',
    loading: '正在加载互动练习…', allComplete: '29 / 29 操作完成', completeTitle: '全键盘训练完成',
    completeBody: '你已经完成全部快捷键编组。', enterCanvas: '进入画布', restart: '重新训练',
    lessonNames: { basics: '创建与文本编辑', nodes: '节点焦点操作', connections: '连线焦点操作', navigation: '焦点移动与删除', canvas: '画布缩放', history: '历史与剪贴板', system: '保存与设置' },
  },
  en: {
    title: 'SysMind Shortcut Training', close: 'Close quick start guide', eyebrow: 'SYSMIND HANDS-ON CAMP',
    welcomeTitle: 'Master every shortcut through hands-on practice',
    welcomeBody: 'Each group provides a focused practice graph for learning nodes, connections, search, focus, and text editing step by step.',
    start: 'Start hands-on training', skip: 'Maybe later', group: 'Group', action: 'Action', completed: 'Completed', yourTurn: 'Your turn', actionComplete: 'Action complete', sandbox: 'Interactive practice',
    pressHint: 'Press the shortcut inside the canvas, or click the key to simulate it', inputHint: 'Continue typing, then press Enter or Escape',
    nextAction: 'Next shortcut', nextGroup: 'Next group', finish: 'Finish training', previous: 'Previous', enterToContinue: 'Press Enter to continue',
    loading: 'Loading interactive practice…', allComplete: '29 / 29 ACTIONS COMPLETE', completeTitle: 'Complete keyboard training finished',
    completeBody: 'You completed every shortcut group.', enterCanvas: 'Enter the canvas', restart: 'Train again',
    lessonNames: { basics: 'Create and edit text', nodes: 'Node-focused actions', connections: 'Connection-focused actions', navigation: 'Focus and deletion', canvas: 'Canvas zoom', history: 'History and clipboard', system: 'Save and settings' },
  },
} as const;

const ACTION_COPY: Record<ActionId, Record<AppLanguage, ActionCopy>> = {
  'create-node': { zh: { title: '创建节点并命名', body: '空焦点时按 Enter 创建节点，输入名称后再按 Enter。', success: '节点已创建并完成命名。' }, en: { title: 'Create and name a node', body: 'With no focus, press Enter, name the node, then press Enter.', success: 'The node was created and named.' } },
  'edit-node': { zh: { title: '编辑节点文字', body: '节点获得焦点时按 Space，修改文字后按 Enter 或 Esc。', success: '节点文字已更新并退出编辑状态。' }, en: { title: 'Edit node text', body: 'Press Space on the focused node, edit, then press Enter or Escape.', success: 'The node text was updated and editing ended.' } },
  'create-connection': { zh: { title: '从节点创建连线', body: '按 Enter 从当前节点发起一条未完成连线。', success: '未完成连线已创建，并且连线焦点已明确高亮。' }, en: { title: 'Create a connection', body: 'Press Enter on the focused node to start a pending link.', success: 'The pending link was created and clearly focused.' } },
  'complete-connection': { zh: { title: '完成连线并创建目标', body: '连线获得焦点时按 Enter，输入目标节点名称并完成。', success: '目标节点和连线已创建。' }, en: { title: 'Complete the connection', body: 'Press Enter on the focused pending link, then name the target.', success: 'The target node and completed connection were created.' } },
  'create-node-below': { zh: { title: '在下方创建独立节点', body: '按 Shift+Enter 在当前节点下方创建新节点。此操作不会生成连线。', success: '下方节点已创建，并且没有附带任何连线。' }, en: { title: 'Create an independent node below', body: 'Press Shift+Enter to create a node below. This does not create a link.', success: 'The lower node was created without an attached connection.' } },
  'return-connection': { zh: { title: '从来源节点创建回连', body: '当前节点由左侧来源节点衍生；按 Ctrl/Cmd+Enter 后，连线应从来源节点指向当前节点下方。', success: '回连方向正确：从上一个来源节点指向当前节点附近。' }, en: { title: 'Create a source return link', body: 'Press Ctrl/Cmd+Enter; the link starts at the previous source and points near the current node.', success: 'The return link points from the previous source toward the current node.' } },
  'cycle-node-style': { zh: { title: '连续切换节点样式', body: '按 Tab 切换样式；可以继续按 Tab 多次观察循环，网页焦点不会跳走。', success: '样式已切换。你仍可继续按 Tab，准备好后按 Enter 进入下一项。' }, en: { title: 'Cycle node style repeatedly', body: 'Press Tab repeatedly; browser DOM focus stays put.', success: 'The style changed. Keep pressing Tab, then Enter when ready.' } },
  'move-node': { zh: { title: '连续精确移动节点', body: '按住或重复按 Ctrl/Cmd+方向键，以网格步长持续移动节点。', success: '节点已移动。你可以继续使用任意 Ctrl/Cmd+方向键，完成后按 Enter。' }, en: { title: 'Move a node repeatedly', body: 'Hold or repeat Ctrl/Cmd+Arrow to move by grid steps.', success: 'The node moved. Keep moving it, then press Enter.' } },
  'edit-connection': { zh: { title: '编辑已高亮的连线', body: '蓝色加粗的连线已经获得焦点。按 Space，输入标签后按 Enter 或 Esc。', success: '连线标签已保存。' }, en: { title: 'Edit the highlighted link', body: 'The blue, thick link has focus. Press Space, type, then Enter or Escape.', success: 'The connection label was saved.' } },
  'cycle-connection-style': { zh: { title: '连续切换箭头方向', body: '按 Tab 循环正向、反向、双向和无箭头；可连续操作。', success: '箭头样式已切换。可继续按 Tab，完成后按 Enter。' }, en: { title: 'Cycle arrow direction', body: 'Press Tab repeatedly to cycle forward, backward, both, and none.', success: 'The arrow style changed. Keep cycling, then Enter.' } },
  'search-link': { zh: { title: '搜索并连接目标节点', body: '当前未完成连线已聚焦。按 / 打开搜索，用上下方向键选择“验证结果”，再按 Enter 完成连接。', success: '搜索选择已确认，连线已连接到目标节点。' }, en: { title: 'Search and connect a target', body: 'Press /, choose “Validate result” with arrows, then press Enter.', success: 'The search choice was confirmed and the link connected.' } },
  'move-endpoint': { zh: { title: '连续移动连线末端', body: '按 Ctrl/Cmd+方向键移动目标节点或未完成端点，可重复操作。', success: '连线末端已移动。可继续调整，完成后按 Enter。' }, en: { title: 'Move an endpoint repeatedly', body: 'Repeat Ctrl/Cmd+Arrow to move the target or pending endpoint.', success: 'The endpoint moved. Continue, then press Enter.' } },
  'adjust-curve': { zh: { title: '连续调整连线弯曲度', body: '按 Shift+方向键调整弯曲方向与程度，可重复操作。', success: '连线弯曲度已改变。可继续调整，完成后按 Enter。' }, en: { title: 'Adjust link curvature repeatedly', body: 'Repeat Shift+Arrow to tune the bend.', success: 'The bend changed. Continue, then press Enter.' } },
  'straighten-line': { zh: { title: '拉直连线', body: '按 Shift+Enter 将弯曲连线恢复为直线。', success: '连线弯曲度已清零。' }, en: { title: 'Straighten the link', body: 'Press Shift+Enter to reset the bend.', success: 'The connection is straight again.' } },
  'focus-left': { zh: { title: '向左移动焦点', body: '按左方向键移动到左侧节点。', success: '焦点已移到左侧节点。' }, en: { title: 'Move focus left', body: 'Press Left to focus the node on the left.', success: 'Focus moved left.' } },
  'focus-right': { zh: { title: '向右移动焦点', body: '按右方向键移动到右侧节点。', success: '焦点已移到右侧节点。' }, en: { title: 'Move focus right', body: 'Press Right to focus the node on the right.', success: 'Focus moved right.' } },
  'focus-up': { zh: { title: '向上移动焦点', body: '按上方向键移动到上方节点。', success: '焦点已移到上方节点。' }, en: { title: 'Move focus up', body: 'Press Up to focus the node above.', success: 'Focus moved up.' } },
  'focus-down': { zh: { title: '向下移动焦点', body: '按下方向键移动到下方节点。', success: '焦点已移到下方节点。' }, en: { title: 'Move focus down', body: 'Press Down to focus the node below.', success: 'Focus moved down.' } },
  'delete-node': { zh: { title: '删除节点', body: '按 Delete 或 Backspace 删除当前焦点节点。', success: '节点已删除。' }, en: { title: 'Delete a node', body: 'Press Delete or Backspace on the focused node.', success: 'The node was deleted.' } },
  'delete-connection': { zh: { title: '删除连线', body: '当前蓝色连线已聚焦，按 Delete 或 Backspace 只删除关系。', success: '连线已删除，节点仍然保留。' }, en: { title: 'Delete a connection', body: 'Press Delete or Backspace on the highlighted link.', success: 'The link was removed while nodes remained.' } },
  'zoom-in': { zh: { title: '放大画布', body: '按 Ctrl/Cmd+= 放大，可连续操作。', success: '画布已经放大。完成后按 Enter。' }, en: { title: 'Zoom in', body: 'Press Ctrl/Cmd+= repeatedly.', success: 'The canvas zoomed in. Press Enter when ready.' } },
  'zoom-out': { zh: { title: '缩小画布', body: '按 Ctrl/Cmd+- 缩小，可连续操作。', success: '画布已经缩小。完成后按 Enter。' }, en: { title: 'Zoom out', body: 'Press Ctrl/Cmd+- repeatedly.', success: 'The canvas zoomed out. Press Enter when ready.' } },
  'zoom-reset': { zh: { title: '重置缩放', body: '按 Ctrl/Cmd+0 恢复 100%。', success: '画布已经恢复 100%。' }, en: { title: 'Reset zoom', body: 'Press Ctrl/Cmd+0 to restore 100%.', success: 'The canvas returned to 100%.' } },
  undo: { zh: { title: '撤销', body: '按 Ctrl/Cmd+Z 撤销场景中的上一步变化。', success: '变化已撤销。' }, en: { title: 'Undo', body: 'Press Ctrl/Cmd+Z to undo the prepared change.', success: 'The change was undone.' } },
  redo: { zh: { title: '还原', body: '按 Ctrl/Cmd+Y 重新执行刚撤销的变化。', success: '变化已还原。' }, en: { title: 'Redo', body: 'Press Ctrl/Cmd+Y to reapply the change.', success: 'The change was redone.' } },
  copy: { zh: { title: '复制节点', body: '按 Ctrl/Cmd+C 复制当前焦点节点。', success: '节点已复制。' }, en: { title: 'Copy a node', body: 'Press Ctrl/Cmd+C on the focused node.', success: 'The node was copied.' } },
  paste: { zh: { title: '粘贴节点', body: '按 Ctrl/Cmd+V 粘贴刚复制的节点。', success: '节点副本已偏移粘贴并成为新焦点。' }, en: { title: 'Paste a node', body: 'Press Ctrl/Cmd+V to paste the copied node.', success: 'An offset copy was pasted and focused.' } },
  save: { zh: { title: '保存', body: '按 Ctrl/Cmd+S 练习保存快捷键；练习模式不会写入原文件。', success: '已收到保存操作，浏览器默认保存没有被触发。' }, en: { title: 'Save', body: 'Press Ctrl/Cmd+S; training will not overwrite your file.', success: 'The save command was handled without browser Save As.' } },
  'open-settings': { zh: { title: '打开快捷键设置', body: '按 Shift+? 打开快捷键设置面板。', success: '快捷键设置面板已经打开。' }, en: { title: 'Open shortcut settings', body: 'Press Shift+? to open shortcut settings.', success: 'The shortcut settings panel opened.' } },
};

const node = (id: string, x: number, y: number, text: string, style?: 'default' | 'text' | 'note' | 'warning') => ({ id, x, y, text, ...(style ? { style } : {}) });
const conn = (id: string, fromId: string, toId: string | null, text = '', curveBend = 0) => ({ id, fromId, toId, text, style: 'forward' as const, curveBend, ...(toId ? {} : { tempToPos: { x: 760, y: 300 } }) });
const scenario = (nodes: ReturnType<typeof node>[], connections: ReturnType<typeof conn>[], focused: FocusedElement, nodeSources: Record<string, string> = {}, scale = 1): TutorialScenarioState => ({
  nodes, connections, focused, isEditing: false, searchQuery: null, selectedIndex: 0,
  canvasView: { x: 0, y: 0, scale }, selectedNodeIds: [], selectedConnectionIds: [], nodeSources,
  history: { stack: [{ nodes, connections, focused }], index: 0 },
});

function buildLessonScenario(lesson: LessonId, language: AppLanguage): TutorialScenarioState {
  const t = language === 'zh';
  if (lesson === 'basics') return scenario([], [], null);
  if (lesson === 'nodes') {
    const nodes = [node('source', 380, 310, t ? '问题来源' : 'Problem source')];
    return scenario(nodes, [], { type: 'node', id: 'source' });
  }
  if (lesson === 'connections') {
    const nodes = [node('source', 310, 330, t ? '问题' : 'Problem'), node('target', 690, 330, t ? '方案' : 'Option'), node('candidate', 690, 460, t ? '验证结果' : 'Validate result', 'note')];
    return scenario(nodes, [conn('main', 'source', 'target')], { type: 'connection', id: 'main' });
  }
  if (lesson === 'navigation') {
    const nodes = [node('center', 520, 350, t ? '当前节点' : 'Current'), node('left', 280, 350, t ? '左侧' : 'Left'), node('right', 760, 350, t ? '右侧' : 'Right'), node('up', 520, 230, t ? '上方' : 'Up'), node('down', 520, 470, t ? '下方' : 'Down')];
    return scenario(nodes, [conn('delete-link', 'left', 'right', t ? '待删除关系' : 'Delete me')], { type: 'node', id: 'center' });
  }
  if (lesson === 'canvas') {
    const nodes = [node('a', 360, 300, t ? '缩放中心' : 'Zoom center'), node('b', 700, 420, t ? '观察范围' : 'Visible range')];
    return scenario(nodes, [conn('zoom-link', 'a', 'b')], null);
  }
  if (lesson === 'history') {
    const baseNodes = [node('copy', 430, 330, t ? '可复制节点' : 'Copy this')];
    const changedNodes = [{ ...baseNodes[0], x: 510 }];
    return { ...scenario(changedNodes, [], { type: 'node', id: 'copy' }), history: { stack: [{ nodes: baseNodes, connections: [], focused: { type: 'node', id: 'copy' } }, { nodes: changedNodes, connections: [], focused: { type: 'node', id: 'copy' } }], index: 1 } };
  }
  return scenario([node('save', 520, 350, t ? '训练成果' : 'Training result')], [], { type: 'node', id: 'save' });
}

function shortcutFor(action: ActionId, shortcuts: KeyboardShortcuts): ShortcutConfig {
  const map: Partial<Record<ActionId, keyof KeyboardShortcuts>> = {
    'create-node': 'createNode', 'edit-node': 'editText', 'create-connection': 'createConnection', 'complete-connection': 'createNode',
    'create-node-below': 'createNodeBelow', 'return-connection': 'returnConnection', 'cycle-node-style': 'cycleStyle', 'edit-connection': 'editText',
    'cycle-connection-style': 'cycleStyle', 'search-link': 'search', 'focus-left': 'moveLeft', 'focus-right': 'moveRight', 'focus-up': 'moveUp', 'focus-down': 'moveDown',
    'delete-node': 'delete', 'delete-connection': 'delete', 'zoom-in': 'zoomIn', 'zoom-out': 'zoomOut', 'zoom-reset': 'zoomReset', undo: 'undo', redo: 'redo', copy: 'copy', paste: 'paste', save: 'save', 'open-settings': 'openShortcuts',
  };
  if (map[action]) return shortcuts[map[action]!];
  if (action === 'move-node' || action === 'move-endpoint') return { key: 'ArrowRight', ctrl: true };
  if (action === 'adjust-curve') return { key: 'ArrowDown', shift: true };
  return { key: 'Enter', shift: true };
}

const focusForAction = (action: ActionId): FocusedElement | undefined => {
  if (['create-connection'].includes(action)) return { type: 'node', id: 'source' };
  if (['edit-connection', 'cycle-connection-style', 'search-link', 'move-endpoint', 'adjust-curve', 'straighten-line'].includes(action)) return { type: 'connection', id: 'main' };
  if (action === 'focus-left') return { type: 'node', id: 'center' };
  if (action === 'focus-right') return { type: 'node', id: 'center' };
  if (action === 'focus-up') return { type: 'node', id: 'center' };
  if (action === 'focus-down') return { type: 'node', id: 'center' };
  if (action === 'delete-node') return { type: 'node', id: 'down' };
  if (action === 'delete-connection') return { type: 'connection', id: 'delete-link' };
  if (['copy', 'paste'].includes(action)) return { type: 'node', id: 'copy' };
  return undefined;
};

function isActionComplete(action: ActionId, before: TutorialCanvasState | null, state: TutorialCanvasState): boolean {
  if (!before) return false;
  const focusedNodeId = state.focused?.type === 'node' ? state.focused.id : null;
  const beforeFocusedId = before.focused?.type === 'node' || before.focused?.type === 'connection' ? before.focused.id : null;
  const focusedNode = focusedNodeId ? state.nodes.find(item => item.id === focusedNodeId) : undefined;
  const beforeNode = before.focused?.type === 'node' ? before.nodes.find(item => item.id === beforeFocusedId) : undefined;
  const main = state.connections.find(item => item.id === 'main');
  switch (action) {
    case 'create-node': return state.nodes.length > before.nodes.length && !state.isEditing && state.nodes.some(item => item.text.trim());
    case 'edit-node': return !state.isEditing && state.nodes.some(item => item.id === beforeFocusedId && item.text !== before.nodes.find(old => old.id === item.id)?.text);
    case 'create-connection': return state.connections.length > before.connections.length && state.focused?.type === 'connection';
    case 'complete-connection': return state.nodes.length > before.nodes.length && state.connections.some(item => item.id === beforeFocusedId && item.toId) && !state.isEditing;
    case 'create-node-below': return state.nodes.length > before.nodes.length && state.connections.length === before.connections.length && !state.isEditing;
    case 'return-connection': return state.connections.length > before.connections.length && state.connections.some(item => !before.connections.some(previous => previous.id === item.id) && !item.toId && item.fromId !== beforeFocusedId);
    case 'cycle-node-style': return !!focusedNode && focusedNode.style !== beforeNode?.style;
    case 'move-node': return !!focusedNode && !!beforeNode && (focusedNode.x !== beforeNode.x || focusedNode.y !== beforeNode.y);
    case 'edit-connection': return !state.isEditing && state.connections.some(item => item.id === 'main' && item.text !== before.connections.find(old => old.id === item.id)?.text);
    case 'cycle-connection-style': return main?.style !== before.connections.find(item => item.id === 'main')?.style;
    case 'search-link': return state.searchQuery === null && main?.toId === 'candidate' && !before.connections.find(item => item.id === 'main')?.toId;
    case 'move-endpoint': {
      const target = main?.toId ? state.nodes.find(item => item.id === main.toId) : undefined;
      const previousMain = before.connections.find(item => item.id === 'main');
      const previousTarget = previousMain?.toId ? before.nodes.find(item => item.id === previousMain.toId) : undefined;
      return !!target && !!previousTarget && (target.x !== previousTarget.x || target.y !== previousTarget.y);
    }
    case 'adjust-curve': return (main?.curveBend ?? 0) !== (before.connections.find(item => item.id === 'main')?.curveBend ?? 0);
    case 'straighten-line': return (main?.curveBend ?? 0) === 0 && (before.connections.find(item => item.id === 'main')?.curveBend ?? 0) !== 0;
    case 'focus-left': return state.focused?.type === 'node' && state.focused.id === 'left';
    case 'focus-right': return state.focused?.type === 'node' && state.focused.id === 'right';
    case 'focus-up': return state.focused?.type === 'node' && state.focused.id === 'up';
    case 'focus-down': return state.focused?.type === 'node' && state.focused.id === 'down';
    case 'delete-node': return !state.nodes.some(item => item.id === 'down');
    case 'delete-connection': return !state.connections.some(item => item.id === 'delete-link');
    case 'zoom-in': return state.canvasView.scale > before.canvasView.scale;
    case 'zoom-out': return state.canvasView.scale < before.canvasView.scale;
    case 'zoom-reset': return state.canvasView.scale === 1 && before.canvasView.scale !== 1;
    case 'undo': return state.history.index < before.history.index;
    case 'redo': return state.history.index > before.history.index;
    case 'copy': return state.copySignal > before.copySignal;
    case 'paste': return state.nodes.length > before.nodes.length;
    case 'save': return state.saveSignal > before.saveSignal;
    case 'open-settings': return state.shortcutsOpen;
  }
}

export function QuickStartGuide({ isOpen, onClose, language, shortcuts, ctrlKey, theme }: QuickStartGuideProps) {
  const ui = UI[language];
  const [screen, setScreen] = useState<'welcome' | 'training' | 'complete'>('welcome');
  const [lessonIndex, setLessonIndex] = useState(0);
  const [actionIndex, setActionIndex] = useState(0);
  const [actionComplete, setActionComplete] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [snapshot, setSnapshot] = useState<TutorialCanvasState | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<number>>(() => new Set());
  const frameRef = useRef<HTMLIFrameElement>(null);
  const beforeRef = useRef<TutorialCanvasState | null>(null);
  const lastFocusedNodeIdRef = useRef<string | null>(null);
  const checkpointsRef = useRef<Map<number, TutorialCanvasState>>(new Map());
  const actionCompleteRef = useRef(false);
  const completedActionsRef = useRef<Set<number>>(new Set());

  const lesson = LESSONS[lessonIndex];
  const action = lesson.actions[actionIndex];
  const copy = ACTION_COPY[action][language];
  const absoluteIndex = lessonStartIndex(lessonIndex) + actionIndex;
  const shortcut = shortcutFor(action, shortcuts);
  const shortcutLabel = formatShortcutLabel(shortcut, ctrlKey);
  const total = ALL_ACTIONS.length;
  const completed = completedActions.size;
  const allComplete = completed === total;
  const isLastInLesson = actionIndex === lesson.actions.length - 1;
  const iframeSrc = useMemo(() => `${window.location.pathname}?${TUTORIAL_QUERY_KEY}=1`, []);

  const post = useCallback((message: TutorialParentMessage) => frameRef.current?.contentWindow?.postMessage(message, '*'), []);

  const prepareAction = useCallback((targetAction: ActionId, targetLessonIndex: number, restore?: TutorialCanvasState) => {
    setActionComplete(false);
    actionCompleteRef.current = false;
    setSnapshot(null);
    beforeRef.current = null;
    if (restore) {
      beforeRef.current = restore;
      setSnapshot(restore);
      post({ channel: TUTORIAL_CHANNEL, kind: 'restore-state', actionId: targetAction, state: restore });
      return;
    }
    post({
      channel: TUTORIAL_CHANNEL,
      kind: 'prepare-action',
      actionId: targetAction,
      focused: focusForAction(targetAction)
        ?? (['create-node-below', 'return-connection', 'cycle-node-style', 'move-node'].includes(targetAction) && lastFocusedNodeIdRef.current
          ? { type: 'node', id: lastFocusedNodeIdRef.current }
          : undefined),
      closeSearch: true,
    });
    if (targetAction === 'search-link') {
      const current = snapshot;
      if (current) {
        const pending = { ...current, connections: current.connections.map(item => item.id === 'main' ? { ...item, toId: null, tempToPos: { x: 760, y: 300 } } : item), focused: { type: 'connection', id: 'main' } as FocusedElement };
        beforeRef.current = pending;
        post({ channel: TUTORIAL_CHANNEL, kind: 'restore-state', actionId: targetAction, state: pending });
      }
    }
  }, [absoluteIndex, post, snapshot]);

  const loadLesson = useCallback((targetLessonIndex: number, targetActionIndex = 0) => {
    const targetLesson = LESSONS[targetLessonIndex];
    const targetAction = targetLesson.actions[targetActionIndex];
    const state = buildLessonScenario(targetLesson.id, language);
    const absoluteTarget = lessonStartIndex(targetLessonIndex) + targetActionIndex;
    checkpointsRef.current.set(absoluteTarget, { ...state, shortcutsOpen: false, copySignal: 0, saveSignal: 0, actionId: targetAction } as TutorialCanvasState);
    beforeRef.current = null;
    setSnapshot(null);
    setActionComplete(false);
    actionCompleteRef.current = false;
    post({ channel: TUTORIAL_CHANNEL, kind: 'load-state', actionId: targetAction, state });
  }, [language, post]);

  const startLesson = useCallback((targetLessonIndex: number) => {
    setScreen('training');
    setLessonIndex(targetLessonIndex);
    setActionIndex(0);
    lastFocusedNodeIdRef.current = null;
    if (frameReady) loadLesson(targetLessonIndex, 0);
  }, [frameReady, loadLesson]);

  const advance = useCallback(() => {
    if (!actionCompleteRef.current) return;
    if (completedActionsRef.current.size === total) { setScreen('complete'); return; }
    let nextLessonIndex = lessonIndex;
    if (isLastInLesson) {
      for (let offset = 1; offset <= LESSONS.length; offset += 1) {
        const candidate = (lessonIndex + offset) % LESSONS.length;
        const candidateStart = lessonStartIndex(candidate);
        const candidateComplete = LESSONS[candidate].actions.every((_, position) => completedActionsRef.current.has(candidateStart + position));
        if (!candidateComplete) {
          nextLessonIndex = candidate;
          break;
        }
      }
    }
    const nextActionIndex = isLastInLesson ? 0 : actionIndex + 1;
    setLessonIndex(nextLessonIndex);
    setActionIndex(nextActionIndex);
    if (isLastInLesson) loadLesson(nextLessonIndex, nextActionIndex);
    else {
      const nextAction = LESSONS[nextLessonIndex].actions[nextActionIndex];
      const nextAbsolute = absoluteIndex + 1;
      if (snapshot) checkpointsRef.current.set(nextAbsolute, snapshot);
      prepareAction(nextAction, nextLessonIndex);
    }
  }, [absoluteIndex, actionIndex, isLastInLesson, lessonIndex, loadLesson, prepareAction, snapshot, total]);

  const goBack = useCallback(() => {
    if (absoluteIndex === 0) return;
    const previousAbsolute = absoluteIndex - 1;
    let cursor = 0;
    let previousLessonIndex = 0;
    let previousActionIndex = 0;
    for (let index = 0; index < LESSONS.length; index += 1) {
      if (previousAbsolute < cursor + LESSONS[index].actions.length) {
        previousLessonIndex = index;
        previousActionIndex = previousAbsolute - cursor;
        break;
      }
      cursor += LESSONS[index].actions.length;
    }
    const restore = checkpointsRef.current.get(previousAbsolute);
    setLessonIndex(previousLessonIndex);
    setActionIndex(previousActionIndex);
    if (restore) prepareAction(LESSONS[previousLessonIndex].actions[previousActionIndex], previousLessonIndex, restore);
    else loadLesson(previousLessonIndex, previousActionIndex);
  }, [absoluteIndex, loadLesson, prepareAction]);

  useEffect(() => {
    actionCompleteRef.current = actionComplete;
  }, [actionComplete]);

  useEffect(() => {
    if (!isOpen || screen !== 'training' || !frameReady) return;
    const animationFrame = window.requestAnimationFrame(() => {
      frameRef.current?.focus({ preventScroll: true });
      frameRef.current?.contentWindow?.focus();
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [actionIndex, frameReady, isOpen, lessonIndex, screen]);

  useEffect(() => {
    if (!isOpen || screen !== 'training' || !actionComplete) return;
    const handleContinue = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      advance();
    };
    window.addEventListener('keydown', handleContinue, true);
    return () => window.removeEventListener('keydown', handleContinue, true);
  }, [actionComplete, advance, isOpen, screen]);

  useEffect(() => {
    if (!isOpen) return;
    setScreen('welcome');
    setLessonIndex(0);
    setActionIndex(0);
    setActionComplete(false);
    setFrameReady(false);
    setSnapshot(null);
    setCompletedActions(new Set());
    checkpointsRef.current = new Map();
    completedActionsRef.current = new Set();
    lastFocusedNodeIdRef.current = null;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleMessage = (event: MessageEvent<TutorialChildMessage>) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.channel !== TUTORIAL_CHANNEL) return;
      if (event.data.kind === 'ready') {
        setFrameReady(true);
        if (screen === 'training') loadLesson(lessonIndex, actionIndex);
        return;
      }
      if (event.data.kind === 'advance-request') {
        advance();
        return;
      }
      if (event.data.kind !== 'snapshot' || screen !== 'training') return;
      const next = event.data.state;
      setSnapshot(next);
      if (next.focused?.type === 'node') lastFocusedNodeIdRef.current = next.focused.id;
      if (!beforeRef.current && next.actionId === action) {
        beforeRef.current = next;
        checkpointsRef.current.set(absoluteIndex, next);
        return;
      }
      if (!actionCompleteRef.current && next.actionId === action && isActionComplete(action, beforeRef.current, next)) {
        const nextCompletedActions = new Set(completedActionsRef.current);
        nextCompletedActions.add(absoluteIndex);
        completedActionsRef.current = nextCompletedActions;
        setCompletedActions(nextCompletedActions);
        setActionComplete(true);
        actionCompleteRef.current = true;
        post({ channel: TUTORIAL_CHANNEL, kind: 'set-action-complete', complete: true });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [absoluteIndex, action, actionIndex, advance, isOpen, lessonIndex, loadLesson, post, screen]);

  if (!isOpen) return null;

  return (
    <div className={`theme-${theme} fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6`} role="dialog" aria-modal="true" aria-labelledby="quick-start-title">
      <motion.div className="app-modal-backdrop absolute inset-0 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.section initial={{ opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="guide-shell relative z-10 flex h-[min(840px,calc(100vh-24px))] w-[min(1180px,calc(100vw-24px))] overflow-hidden rounded-[28px] border shadow-2xl">
        <aside className="guide-sidebar hidden w-[292px] shrink-0 flex-col border-r p-5 lg:flex">
          <div className="flex items-center gap-3 px-1"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500 text-white"><MousePointer2 size={20} /></div><div><div className="guide-muted text-[10px] font-bold tracking-[0.2em]">SYSMIND</div><div id="quick-start-title" className="guide-heading text-base font-semibold">{ui.title}</div></div></div>
          <div className="mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {LESSONS.map((item, index) => { const Icon = LESSON_ICONS[index]; const start = lessonStartIndex(index); const done = item.actions.every((_, position) => completedActions.has(start + position)); const active = screen === 'training' && lessonIndex === index; return <button type="button" key={item.id} onClick={() => startLesson(index)} aria-label={`${ui.group} ${index + 1}: ${ui.lessonNames[item.id]}`} className={`guide-level block w-full rounded-2xl px-3 py-2.5 text-left transition-colors ${active ? 'guide-level-active' : ''}`}><div className="flex items-center gap-3"><div className={`flex h-8 w-8 items-center justify-center rounded-xl ${done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-500 text-white' : 'guide-level-icon'}`}>{done ? <Check size={16} /> : <Icon size={16} />}</div><div className="min-w-0 flex-1"><div className="guide-muted text-[10px] font-semibold uppercase tracking-wider">{done ? ui.completed : `${ui.group} ${index + 1}`}</div><div className="guide-heading truncate text-sm font-medium">{ui.lessonNames[item.id]}</div></div><div className="guide-muted text-[10px]">{item.actions.length}</div></div>{active && <div className="mt-2 grid grid-cols-6 gap-1 pl-11">{item.actions.map((value, position) => <div key={value} className={`h-1.5 rounded-full ${position === actionIndex && !actionComplete ? 'bg-blue-500' : completedActions.has(start + position) ? 'bg-emerald-400' : 'guide-progress'}`} />)}</div>}</button>; })}
          </div>
          <div className="guide-tip mt-4 rounded-2xl border p-3 text-xs leading-5"><Keyboard size={16} className="mb-1.5 text-blue-500" />{language === 'zh' ? '每组使用独立练习图，并根据你的操作即时检查结果。' : 'Each group uses a focused practice graph and checks your actions instantly.'}</div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="guide-header flex items-center justify-between border-b px-5 py-4 sm:px-7"><div className="flex items-center gap-3 lg:hidden"><Rocket size={18} className="text-blue-500" /><div className="guide-heading text-sm font-semibold">{ui.title}</div></div>{screen === 'training' && <div className="hidden items-center gap-3 lg:flex"><span className="guide-muted text-xs font-semibold">{completed} / {total}</span><div className="guide-progress h-1.5 w-36 overflow-hidden rounded-full"><motion.div className="h-full rounded-full bg-blue-500" animate={{ width: `${completed / total * 100}%` }} /></div></div>}<button onClick={onClose} aria-label={ui.close} className="guide-icon-button ml-auto flex h-9 w-9 items-center justify-center rounded-xl"><X size={18} /></button></header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              {screen === 'welcome' && <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-full flex-col items-center justify-center px-8 text-center"><div className="guide-hero-icon relative flex h-24 w-24 items-center justify-center rounded-[30px]"><Rocket size={42} className="text-blue-500" /><Sparkles size={22} className="absolute -right-2 -top-2 text-amber-400" /></div><div className="mt-8 text-xs font-bold tracking-[0.18em] text-blue-500">{ui.eyebrow}</div><h2 className="guide-heading mt-3 max-w-2xl text-4xl font-bold">{ui.welcomeTitle}</h2><p className="guide-copy mt-4 max-w-2xl text-base leading-7">{ui.welcomeBody}</p><div className="mt-8 flex gap-3"><button onClick={() => setScreen('training')} className="flex items-center gap-2 rounded-2xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white">{ui.start}<ArrowRight size={17} /></button><button onClick={onClose} className="guide-secondary-button rounded-2xl px-5 py-3 text-sm font-semibold">{ui.skip}</button></div></motion.div>}
              {screen === 'complete' && <motion.div key="complete" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-full flex-col items-center justify-center px-8 text-center"><div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 text-white"><Check size={46} /></div><div className="mt-8 text-xs font-bold tracking-[0.18em] text-emerald-500">{ui.allComplete}</div><h2 className="guide-heading mt-3 text-4xl font-bold">{ui.completeTitle}</h2><p className="guide-copy mt-4 text-base">{ui.completeBody}</p><div className="mt-8 flex gap-3"><button onClick={onClose} className="rounded-2xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white">{ui.enterCanvas}</button><button onClick={() => { completedActionsRef.current = new Set(); setCompletedActions(new Set()); startLesson(0); }} className="guide-secondary-button rounded-2xl px-5 py-3 text-sm font-semibold">{ui.restart}</button></div></motion.div>}
              {screen === 'training' && <motion.div key="training" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="flex min-h-full flex-col p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-blue-500"><span>{ui.group} {lessonIndex + 1}</span><span className="guide-muted">/ {LESSONS.length}</span><span>·</span><span>{ui.action} {actionIndex + 1} / {lesson.actions.length}</span></div><h2 className="guide-heading mt-2 text-3xl font-bold">{copy.title}</h2><p className="guide-copy mt-2 max-w-3xl text-sm leading-6">{copy.body}</p></div><div className="guide-group-badge rounded-xl border px-3 py-2 text-xs font-semibold">{ui.lessonNames[lesson.id]}</div></div>
                <div className="guide-canvas relative mt-5 min-h-[300px] flex-1 overflow-hidden rounded-[24px] border"><div className="guide-canvas-label absolute left-4 top-4 z-30 flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-400" />{ui.sandbox}</div><iframe ref={frameRef} src={iframeSrc} title={ui.sandbox} className="absolute inset-0 block h-full w-full border-0" scrolling="no" /></div>
                <div className="guide-action mt-4 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3">{actionComplete && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check size={17} /></div>}<div><div className={`text-xs font-bold uppercase tracking-[0.14em] ${actionComplete ? 'text-emerald-500' : 'text-blue-500'}`}>{actionComplete ? ui.actionComplete : ui.yourTurn}</div><div className="guide-copy mt-1 text-sm">{actionComplete ? copy.success : snapshot?.isEditing ? ui.inputHint : ui.pressHint}</div>{actionComplete && <div className="guide-muted mt-1 text-[11px]">{ui.enterToContinue}</div>}</div></div><div className="flex shrink-0 items-center gap-2">{absoluteIndex > 0 && <button onClick={goBack} className="guide-secondary-button flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold"><ArrowLeft size={15} />{ui.previous}</button>}{!actionComplete && !snapshot?.isEditing && <button onClick={() => post({ channel: TUTORIAL_CHANNEL, kind: 'simulate-shortcut', shortcut })} className="guide-key min-w-[110px] rounded-xl border px-4 py-2.5 text-sm font-bold" aria-label={`${ui.yourTurn}: ${shortcutLabel}`}>{shortcutLabel}</button>}{actionComplete && <button onClick={advance} className="flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white"><span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-bold">Enter</span><span>{allComplete ? ui.finish : isLastInLesson ? ui.nextGroup : ui.nextAction}</span><ArrowRight size={16} /></button>}</div></div>
              </motion.div>}
            </AnimatePresence>
          </div>
        </main>
      </motion.section>
    </div>
  );
}
