/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TENANT_ROUTING_MODE?: string;
  readonly VITE_ENABLE_BROWSER_PUSH?: string;
  readonly VITE_WEB_PUSH_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
