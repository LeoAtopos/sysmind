import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Moon, Sun } from 'lucide-react';

import { KeyboardShortcuts, DEFAULT_SHORTCUTS } from '../types';
import { getShortcutConflicts, formatShortcutLabel } from '../lib/shortcuts';
import { TranslationSet } from '../lib/translations';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: KeyboardShortcuts;
  onSave: (shortcuts: KeyboardShortcuts) => void;
  theme: 'light' | 'dark';
  onThemeSave: (theme: 'light' | 'dark') => void;
  t: TranslationSet;
  ctrlKey: string;
}

export function ShortcutsModal({
  isOpen,
  onClose,
  shortcuts,
  onSave,
  theme,
  onThemeSave,
  t,
  ctrlKey,
}: ShortcutsModalProps) {
  const [localShortcuts, setLocalShortcuts] = useState<KeyboardShortcuts>(shortcuts);
  const [localTheme, setLocalTheme] = useState<'light' | 'dark'>(theme);
  const [recordingAction, setRecordingAction] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLocalShortcuts(shortcuts);
    setLocalTheme(theme);
    setConflicts(new Set());
    setRecordingAction(null);
  }, [isOpen, shortcuts, theme]);

  useEffect(() => {
    if (!isOpen || !recordingAction) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      const newShortcut = {
        key: e.key,
        ctrl: e.ctrlKey || false,
        shift: e.shiftKey || false,
        alt: e.altKey || false,
        meta: e.metaKey || false,
      };

      const nextShortcuts = {
        ...localShortcuts,
        [recordingAction]: newShortcut,
      };

      setLocalShortcuts(nextShortcuts);
      setRecordingAction(null);
      setConflicts(getShortcutConflicts(nextShortcuts, ctrlKey));
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [ctrlKey, isOpen, localShortcuts, recordingAction]);

  const actionNames = useMemo<Array<{ key: keyof KeyboardShortcuts; label: string }>>(
    () => [
      { key: 'createNode', label: t.actionCreateNode },
      { key: 'createConnection', label: t.actionCreateConnection },
      { key: 'createNodeBelow', label: t.actionCreateNodeBelow },
      { key: 'returnConnection', label: t.actionReturnConnection },
      { key: 'editText', label: t.actionEditText },
      { key: 'delete', label: t.actionDelete },
      { key: 'undo', label: t.actionUndo },
      { key: 'redo', label: t.actionRedo },
      { key: 'save', label: t.actionSave },
      { key: 'copy', label: t.actionCopy },
      { key: 'paste', label: t.actionPaste },
      { key: 'zoomIn', label: t.actionZoomIn },
      { key: 'zoomOut', label: t.actionZoomOut },
      { key: 'zoomReset', label: t.actionZoomReset },
      { key: 'moveUp', label: t.actionMoveUp },
      { key: 'moveDown', label: t.actionMoveDown },
      { key: 'moveLeft', label: t.actionMoveLeft },
      { key: 'moveRight', label: t.actionMoveRight },
      { key: 'cycleStyle', label: t.actionCycleStyle },
      { key: 'search', label: t.actionSearch },
      { key: 'openShortcuts', label: t.actionOpenShortcuts },
    ],
    [t],
  );

  if (!isOpen) return null;

  const handleReset = () => {
    setLocalShortcuts(DEFAULT_SHORTCUTS);
    setConflicts(getShortcutConflicts(DEFAULT_SHORTCUTS, ctrlKey));
  };

  const handleSave = () => {
    if (conflicts.size > 0) {
      alert(t.shortcutConflict);
      return;
    }

    onThemeSave(localTheme);
    onSave(localShortcuts);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="app-modal-backdrop absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={modalRef}
        className="app-modal relative bg-white rounded-2xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col"
      >
        <div className="app-modal-header flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="app-modal-title text-lg font-semibold text-slate-800">{t.settings}</h2>
          <button
            onClick={onClose}
            className="app-button p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
          >
            <Minus size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <div className="app-settings-section rounded-xl border border-slate-200 p-4">
              <div className="app-settings-heading text-sm font-semibold">{t.appearanceSettings}</div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setLocalTheme('light')}
                  className={`app-segment-button px-3 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
                    localTheme === 'light'
                      ? 'app-segment-active bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Sun size={16} />
                  {t.lightMode}
                </button>
                <button
                  onClick={() => setLocalTheme('dark')}
                  className={`app-segment-button px-3 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
                    localTheme === 'dark'
                      ? 'app-segment-active bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Moon size={16} />
                  {t.darkMode}
                </button>
              </div>
            </div>

            <div className="app-settings-section rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="app-settings-heading text-sm font-semibold">{t.shortcutsSection}</div>
                <p className="app-icon-muted text-xs">{t.clickToRecord}</p>
              </div>
              <div className="space-y-2">
                {actionNames.map(({ key, label }) => {
                  const config = localShortcuts[key];
                  const isRecording = recordingAction === key;
                  const hasConflict = conflicts.has(key);

                  return (
                    <div
                      key={key}
                      className={`app-shortcut-row flex items-center justify-between p-3 rounded-xl border transition-all ${
                        hasConflict
                          ? 'bg-red-50 border-red-200'
                          : isRecording
                            ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="app-row-label text-sm font-medium text-slate-700">{label}</span>
                      <button
                        onClick={() => setRecordingAction(isRecording ? null : key)}
                        className={`app-shortcut-chip px-3 py-1.5 rounded-lg text-xs font-semibold transition-all min-w-[120px] ${
                          isRecording
                            ? 'bg-blue-500 text-white animate-pulse'
                            : hasConflict
                              ? 'bg-red-100 text-red-600 border border-red-200'
                              : 'bg-white border border-slate-300 text-slate-600 hover:border-slate-400'
                        }`}
                      >
                        {isRecording ? t.recording : formatShortcutLabel(config, ctrlKey)}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="app-modal-footer flex items-center justify-between px-6 py-4 border-t border-slate-200">
          <button
            onClick={handleReset}
            className="app-button px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {t.resetToDefaults}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="app-button px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={handleSave}
              disabled={conflicts.size > 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {t.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
