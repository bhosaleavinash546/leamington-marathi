import api from './api';

/**
 * Fetch a file from an authenticated API endpoint and trigger a browser
 * download. Used by the "⬇ Export CSV" buttons across the app.
 *
 * The object URL and temporary anchor are always cleaned up, even if the
 * click throws, so repeated exports don't leak memory or DOM nodes.
 */
export async function downloadCsv(endpoint: string, filename: string): Promise<void> {
  const res = await api.get(endpoint, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}
