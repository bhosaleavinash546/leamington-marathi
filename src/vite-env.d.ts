/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' only in the public shop-window build — see src/lib/site-mode.ts. */
  readonly VITE_STATIC_SITE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
