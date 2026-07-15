export interface V3 { x: number; y: number; z: number; }

export function dist3(a: V3, b: V3): number;
export function circumcircle3(p1: V3, p2: V3, p3: V3): { center: V3; radius: number } | null;
export function angle3(p1: V3, p2: V3, p3: V3): number | null;
export function closestPointOnSegment(p: V3, a: V3, b: V3): V3;

export const FACE_COLORS: Record<string, [number, number, number]>;
export const FACE_TYPE_LABEL: Record<string, string>;
