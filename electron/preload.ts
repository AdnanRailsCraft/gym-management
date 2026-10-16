import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("gms", {
  appInfo: (): Promise<{ name: string; version: string }> =>
    ipcRenderer.invoke("app:info"),
});
