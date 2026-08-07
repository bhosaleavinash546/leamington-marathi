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
  /**
   * B-rep face ids to paint once the file has loaded. The DFM Studio passes the
   * undercut and zero-draft face ids the analysis found, so a finding can point
   * at the geometry instead of asking the engineer to hunt for it.
   */
  highlightFaceIds?: number[] | null;
  /** JWT for the authenticated /api/cad/tessellate call (STEP/IGES only). */
  token?: string | null;
  /** Fired when the measurement list changes. */
  onMeasurementsChange?: (m: MeasurementRecord[]) => void;
  className?: string;
}

export default function CadViewer3D({ file, token, highlightFaceIds, onMeasurementsChange, className }: CadViewer3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<CADViewerHandle | null>(null);
  const readyRef = useRef<Promise<CADViewerHandle> | null>(null);
  const loadedRef = useRef<Promise<CADViewerHandle | null> | null>(null);
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
      loadedRef.current = null;
    };
  }, []);

  // Load whenever the file changes (after the viewer is ready). The promise is
  // kept so highlighting can CHAIN off it — loadFile() rebuilds the mesh and
  // drops any overlay, so a highlight applied in parallel would be wiped out by
  // a load that finishes second.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    loadedRef.current = (readyRef.current ?? Promise.reject(new Error('no viewer')))
      .then((h) => (cancelled ? h : h.loadFile(file).then(() => h)))
      .catch(() => null);
    return () => { cancelled = true; };
  }, [file]);

  // Re-apply whenever the ids OR the file change: loadFile() rebuilds the mesh
  // and drops any existing overlay, so highlighting has to follow the load
  // rather than race it.
  useEffect(() => {
    let cancelled = false;
    void loadedRef.current?.then((h) => {
      if (cancelled || !h) return;
      if (highlightFaceIds && highlightFaceIds.length) h.highlightFaces(highlightFaceIds);
      else h.clearHighlight();
    });
    return () => { cancelled = true; };
  }, [highlightFaceIds, file]);

  return <div ref={hostRef} className={`cv3d-host ${className ?? ''}`} />;
}
