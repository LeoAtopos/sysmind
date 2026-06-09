export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1000);
}

export function getBestEffortFilePath(
  file: { path?: string; webkitRelativePath?: string },
  fallback?: string,
): string | null {
  const realPath = typeof file?.path === 'string' && file.path.trim().length > 0 ? file.path : null;
  const relativePath =
    typeof file?.webkitRelativePath === 'string' && file.webkitRelativePath.trim().length > 0
      ? file.webkitRelativePath
      : null;

  if (realPath) return realPath;
  if (relativePath) return relativePath;
  if (fallback && !fallback.includes('fakepath')) return fallback;
  return null;
}

export function createGraphId() {
  return Math.random().toString(36).slice(2, 11);
}
