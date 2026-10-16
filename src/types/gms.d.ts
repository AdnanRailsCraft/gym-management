interface Window {
  gms?: {
    appInfo(): Promise<{ name: string; version: string }>;
  };
}
