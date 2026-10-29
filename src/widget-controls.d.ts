export const ZOOM_MIN: number;
export const ZOOM_MAX: number;
export const OPACITY_MIN: number;
export const OPACITY_MAX: number;
export const DRAG_THRESHOLD_PX: number;
export function clampZoom(value: number): number;
export function clampOpacity(value: number): number;
export function isDrag(startX: number, startY: number, x: number, y: number): boolean;
export function wheelNext(zoom: number, opacity: number, deltaY: number, ctrlKey: boolean): {zoom: number;opacity: number};
