/**
 * React wrapper around the framework-free CAD viewer (services/cad-viewer.ts).
 *
 * Mounts the viewer into a host div, loads the given file (STEP/IGES tessellated
 * server-side via /api/cad/tessellate, STL parsed in-browser), and disposes the
 * WebGL context + worker on unmount (gotcha #7 — survives React StrictMode's
 * double-mount and repeated file loads).
 */
import { useEffect, useRef } from 'react';
import { createCADViewer, type CADViewerHandle, type MeasurementRecord } from '../services/cad-viewer';
import '../styles/cad-viewer.css';

interface CadViewer3DProps {
  /** The uploaded CAD file to display. */
  file: File | null;
  /** JWT for the authenticated /api/cad/tessellate call (STEP/IGES only). */
  token?: string | null;
  /** Fired when the measurement list changes. */
  onMeasurementsChange?: (m: MeasurementRecord[]) => void;
  className?: string;
}

export default function CadViewer3D({ file, token, onMeasurementsChange, className }: CadViewer3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<CADViewerHandle | null>(null);
  const readyRef = useRef<Promise<CADViewerHandle> | null>(null);
  // Keep the latest token/callback without forcing viewer re-creation.
  const tokenRef = useRef(token);
  const cbRef = useRef(onMeasurementsChange);
  tokenRef.current = token;
  cbRef.current = onMeasurementsChange;

  // Create the viewer once, dispose on unmount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const ready = createCADViewer(host, {
      headers: (): Record<string, string> => (tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}),
      onMeasurementsChange: (m) => cbRef.current?.(m),
    }).then((h) => {
      if (disposed) { h.dispose(); throw new Error('unmounted'); }
      handleRef.current = h;
      return h;
    });
    readyRef.current = ready;
    ready.catch(() => { /* unmounted before ready, or init failed */ });
    return () => {
      disposed = true;
      handleRef.current?.dispose();
      handleRef.current = null;
      readyRef.current = null;
    };
  }, []);

  // Load whenever the file changes (after the viewer is ready).
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    readyRef.current?.then((h) => { if (!cancelled) void h.loadFile(file).catch(() => {}); }).catch(() => {});
    return () => { cancelled = true; };
  }, [file]);

  return <div ref={hostRef} className={`cv3d-host ${className ?? ''}`} />;
}
