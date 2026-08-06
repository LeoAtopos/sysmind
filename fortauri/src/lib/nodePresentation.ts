import { NodeStyle } from '../types';

export function getNodeStyleClasses(
  style: NodeStyle,
  focused: boolean,
  selected: boolean,
  isDarkTheme: boolean,
): string {
  if (isDarkTheme) {
    if (focused) {
      switch (style) {
        case 'text':
          return 'bg-transparent border-transparent shadow-none';
        case 'note':
          return 'bg-amber-950/90 border-amber-400 shadow-lg z-20';
        case 'warning':
          return 'bg-rose-950/80 border-rose-400 shadow-lg z-20 ring-2 ring-rose-500/20';
        case 'default':
        default:
          return 'bg-blue-950/80 border-blue-400 shadow-lg z-20';
      }
    }

    if (selected) {
      switch (style) {
        case 'text':
          return 'bg-transparent border-blue-400/60 shadow-none z-[15]';
        case 'note':
          return 'bg-amber-950/70 border-amber-500/80 shadow-md z-[15]';
        case 'warning':
          return 'bg-rose-950/60 border-rose-400/80 shadow-md z-[15]';
        case 'default':
        default:
          return 'bg-blue-950/55 border-blue-400/80 shadow-md z-[15]';
      }
    }

    switch (style) {
      case 'text':
        return 'bg-transparent border-transparent shadow-none hover:bg-slate-800/35';
      case 'note':
        return 'bg-amber-950/50 border-amber-700 shadow-sm hover:border-amber-500';
      case 'warning':
        return 'bg-rose-950/35 border-rose-800 shadow-sm hover:border-rose-500';
      case 'default':
      default:
        return 'bg-slate-900/85 border-slate-700 shadow-sm hover:border-slate-500';
    }
  }

  if (focused) {
    switch (style) {
      case 'text':
        return 'bg-transparent border-transparent shadow-none';
      case 'note':
        return 'bg-yellow-100 border-yellow-400 shadow-lg z-20';
      case 'warning':
        return 'bg-white border-red-500 shadow-lg z-20 ring-2 ring-red-200';
      case 'default':
      default:
        return 'bg-blue-50 border-blue-500 shadow-lg z-20';
    }
  }

  if (selected) {
    switch (style) {
      case 'text':
        return 'bg-transparent border-blue-300/50 shadow-none z-[15]';
      case 'note':
        return 'bg-yellow-50/80 border-yellow-300 shadow-md z-[15]';
      case 'warning':
        return 'bg-red-50/60 border-red-300 shadow-md z-[15]';
      case 'default':
      default:
        return 'bg-blue-50/60 border-blue-300 shadow-md z-[15]';
    }
  }

  switch (style) {
    case 'text':
      return 'bg-transparent border-transparent shadow-none hover:bg-slate-50/50';
    case 'note':
      return 'bg-yellow-50 border-yellow-200 shadow-sm hover:border-yellow-300';
    case 'warning':
      return 'bg-white border-red-400 shadow-sm hover:border-red-500';
    case 'default':
    default:
      return 'bg-white border-slate-200 shadow-sm hover:border-slate-300';
  }
}

export function getNodeTextClasses(style: NodeStyle, isDarkTheme: boolean): string {
  if (isDarkTheme) {
    switch (style) {
      case 'text':
        return 'text-slate-200';
      case 'note':
        return 'text-amber-100';
      case 'warning':
        return 'text-rose-200 font-semibold';
      case 'default':
      default:
        return 'text-slate-100';
    }
  }

  switch (style) {
    case 'text':
      return 'text-slate-700';
    case 'note':
      return 'text-yellow-900';
    case 'warning':
      return 'text-red-600 font-semibold';
    case 'default':
    default:
      return 'text-slate-700';
  }
}

export function getNodeCanvasVisual(
  style: NodeStyle,
  isFocused: boolean,
  isSelected: boolean,
  isDarkTheme: boolean,
  renderScale: number,
) {
  let fill = isDarkTheme ? '#111827' : '#ffffff';
  let stroke = isDarkTheme ? 'rgba(148,163,184,0.18)' : '#E2E8F0';
  let textColor = isDarkTheme ? '#E2E8F0' : '#334155';
  let lineWidth = 2 * renderScale;

  if (isFocused) {
    switch (style) {
      case 'text':
        fill = 'rgba(255,255,255,0)';
        stroke = 'transparent';
        textColor = isDarkTheme ? '#E2E8F0' : '#334155';
        lineWidth = 0;
        break;
      case 'note':
        fill = isDarkTheme ? '#422006' : '#fefce8';
        stroke = isDarkTheme ? '#facc15' : '#fde68a';
        textColor = isDarkTheme ? '#fef3c7' : '#92400e';
        break;
      case 'warning':
        fill = isDarkTheme ? '#3f0f12' : '#ffffff';
        stroke = isDarkTheme ? '#f87171' : '#fca5a5';
        textColor = isDarkTheme ? '#fecaca' : '#b91c1c';
        break;
      case 'default':
      default:
        fill = isDarkTheme ? '#0f2746' : '#eff6ff';
        stroke = isDarkTheme ? '#60a5fa' : '#3B82F6';
        textColor = isDarkTheme ? '#dbeafe' : '#334155';
        break;
    }

    return { fill, stroke, textColor, lineWidth };
  }

  if (isSelected) {
    switch (style) {
      case 'text':
        fill = 'rgba(255,255,255,0)';
        stroke = isDarkTheme ? 'rgba(96,165,250,0.65)' : 'rgba(59,130,246,0.5)';
        textColor = isDarkTheme ? '#E2E8F0' : '#334155';
        lineWidth = 1.5 * renderScale;
        break;
      case 'note':
        fill = isDarkTheme ? 'rgba(120,53,15,0.82)' : 'rgba(254,252,232,0.8)';
        stroke = isDarkTheme ? '#facc15' : '#fde68a';
        textColor = isDarkTheme ? '#fef3c7' : '#92400e';
        break;
      case 'warning':
        fill = isDarkTheme ? 'rgba(127,29,29,0.72)' : 'rgba(254,242,242,0.6)';
        stroke = isDarkTheme ? '#f87171' : '#fca5a5';
        textColor = isDarkTheme ? '#fecaca' : '#b91c1c';
        break;
      case 'default':
      default:
        fill = isDarkTheme ? 'rgba(30,64,175,0.42)' : 'rgba(239,246,255,0.6)';
        stroke = isDarkTheme ? '#60a5fa' : '#93C5FD';
        textColor = isDarkTheme ? '#dbeafe' : '#334155';
        break;
    }

    return { fill, stroke, textColor, lineWidth };
  }

  switch (style) {
    case 'text':
      fill = 'rgba(255,255,255,0)';
      stroke = 'transparent';
      textColor = isDarkTheme ? '#E2E8F0' : '#334155';
      lineWidth = 0;
      break;
    case 'note':
      fill = isDarkTheme ? '#2b1d07' : '#fefce8';
      stroke = isDarkTheme ? '#a16207' : '#fde68a';
      textColor = isDarkTheme ? '#fef3c7' : '#92400e';
      break;
    case 'warning':
      fill = isDarkTheme ? '#1f1114' : '#ffffff';
      stroke = isDarkTheme ? '#b91c1c' : '#fca5a5';
      textColor = isDarkTheme ? '#fca5a5' : '#b91c1c';
      break;
    case 'default':
    default:
      fill = isDarkTheme ? '#111827' : '#ffffff';
      stroke = isDarkTheme ? 'rgba(148,163,184,0.18)' : '#E2E8F0';
      textColor = isDarkTheme ? '#E2E8F0' : '#334155';
      break;
  }

  return { fill, stroke, textColor, lineWidth };
}
