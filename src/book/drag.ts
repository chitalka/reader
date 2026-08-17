export function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.files.length > 0) return true;
  if (Array.from(dataTransfer.types).includes('Files')) return true;
  return Array.from(dataTransfer.items).some((item) => item.kind === 'file');
}

export function preventBookContentDrag(root: HTMLElement): () => void {
  const handleDragStart = (event: DragEvent): void => {
    event.preventDefault();
  };
  root.addEventListener('dragstart', handleDragStart);
  return () => root.removeEventListener('dragstart', handleDragStart);
}
