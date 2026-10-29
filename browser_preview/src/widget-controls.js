// Pure gesture utilities, shared between Tauri, the offline preview and Node tests.
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 1;
export const OPACITY_MIN = 0.25;
export const OPACITY_MAX = 1;
export const DRAG_THRESHOLD_PX = 7;
export function clampZoom(value) {
  return Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number.isFinite(value) ? value : 1)) * 100) / 100;
}
export function clampOpacity(value) {
  return Math.round(Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, Number.isFinite(value) ? value : 1)) * 100) / 100;
}
export function isDrag(startX, startY, x, y) {
  return (x - startX) ** 2 + (y - startY) ** 2 >= DRAG_THRESHOLD_PX ** 2;
}
export function wheelNext(zoom, opacity, deltaY, ctrlKey) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return {zoom, opacity};
  const direction = Math.sign(deltaY);
  return ctrlKey
    ? {zoom, opacity: clampOpacity(opacity - direction * 0.05)}
    : {zoom: clampZoom(zoom - direction * 0.05), opacity};
}
