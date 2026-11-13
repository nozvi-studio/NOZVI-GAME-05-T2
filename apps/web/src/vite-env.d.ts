/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Game server base URL (http/https); defaults to the local server. */
  readonly VITE_SERVER_URL?: string;
}
