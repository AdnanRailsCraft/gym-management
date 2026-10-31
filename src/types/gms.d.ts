interface Window {
  gms?: {
    appInfo(): Promise<{ name: string; version: string }>;
    onOpenDevMenu?(callback: () => void): void;
  };
}
