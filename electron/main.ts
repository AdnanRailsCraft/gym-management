import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  utilityProcess,
} from "electron";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { findFreeLoopbackPort } from "./port";
import { generateLaunchToken } from "./token";

const isDev = process.env.GMS_DEV === "1";
const APP_TITLE = "Empire Fitness — Gym Management System";

let mainWindow: BrowserWindow | null = null;
let backend: Electron.UtilityProcess | null = null;
let shuttingDown = false;

function dataDir(): string {
  const fromEnv = process.env.GMS_DATA_DIR;
  if (fromEnv && fromEnv.trim()) return fromEnv;
  if (isDev) return path.join(app.getAppPath(), ".data");
  const local = process.env.LOCALAPPDATA;
  if (process.platform === "win32") {
    if (!local) throw new Error("LOCALAPPDATA is not set");
    return path.join(local, "GymManagementSystem");
  }
  return path.join(app.getPath("home"), ".local", "share", "GymManagementSystem");
}

function log(...args: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${args.map(String).join(" ")}\n`;
  try {
    const logDir = path.join(dataDir(), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, "main.log"), line);
  } catch {
    // Logging must never crash the host.
  }
  console.log(line.trimEnd());
}

function cspHeader(isDevMode: boolean): string {
  const connect = isDevMode ? "'self' ws:" : "'self'";
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function installCspHeader(): void {
  const csp = cspHeader(isDev);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

function waitForHealth(origin: string, token: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        `${origin}/api/health`,
        { headers: { Authorization: `Bearer ${token}` } },
        (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve();
            return;
          }
          retry(new Error(`health status ${res.statusCode}`));
        },
      );
      req.on("error", (err) => retry(err));
      req.setTimeout(2000, () => {
        req.destroy();
        retry(new Error("health request timed out"));
      });
    };
    const retry = (err: Error) => {
      if (Date.now() > deadline) {
        reject(err);
        return;
      }
      setTimeout(attempt, 300);
    };
    attempt();
  });
}

async function createWindow(url: string): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: APP_TITLE,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: isDev,
      spellcheck: false,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, navUrl) => {
    try {
      if (new URL(navUrl).origin === new URL(url).origin) return;
    } catch {
      // fall through — block unparseable targets
    }
    event.preventDefault();
  });
  await mainWindow.loadURL(url);
}

async function startApp(): Promise<void> {
  const dir = dataDir();
  for (const sub of ["db", "uploads", "backups", "logs", "config"]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }

  const port = await findFreeLoopbackPort();
  const token = generateLaunchToken();
  const origin = `http://127.0.0.1:${port}`;

  ipcMain.handle("app:info", () => ({
    name: "GymManagementSystem",
    version: app.getVersion(),
  }));

  // Per-launch token attached only to this app's own session, same-origin
  // cookie so the browser sends it automatically (HttpOnly, SameSite=Strict).
  await session.defaultSession.cookies.set({
    url: origin,
    name: "gms_lt",
    value: token,
    httpOnly: true,
    sameSite: "strict",
  });

  installCspHeader();

  if (isDev) {
    const devUrl = process.env.GMS_DEV_SERVER_URL ?? "http://127.0.0.1:3000";
    log("dev mode: loading", devUrl);
    await createWindow(devUrl);
    return;
  }

  const serverDir = path.join(process.resourcesPath, "app");
  const serverEntry = path.join(serverDir, "server.js");
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Backend entry not found: ${serverEntry}`);
  }

  backend = utilityProcess.fork(serverEntry, [], {
    cwd: serverDir,
    serviceName: "gym-management-backend",
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      GMS_DATA_DIR: dir,
      GMS_LAUNCH_TOKEN: token,
      GMS_APP_VERSION: app.getVersion(),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  backend.stdout?.on("data", (c: Buffer) => log("[server]", c.toString().trimEnd()));
  backend.stderr?.on("data", (c: Buffer) => log("[server:err]", c.toString().trimEnd()));
  backend.on("exit", (code) => {
    log(`backend exited code=${code ?? "?"}`);
    if (!shuttingDown) {
      dialog.showErrorBox(
        "Backend stopped unexpectedly",
        "The local server exited. Close the app and reopen it. See logs for details.",
      );
      app.quit();
    }
  });

  log("waiting for backend health at", origin);
  await waitForHealth(origin, token, 30_000);
  log("backend healthy");
  await createWindow(origin);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady()
    .then(startApp)
    .catch((err: unknown) => {
      log("startup failed:", String(err));
      dialog.showErrorBox("Gym Management System failed to start", String(err));
      app.quit();
    });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("before-quit", (event) => {
    shuttingDown = true;
    if (backend) {
      // Give the utility process a moment to flush SQLite WAL on quit.
      event.preventDefault();
      const proc = backend;
      backend = null;
      proc.once("exit", () => app.quit());
      proc.kill();
      setTimeout(() => app.quit(), 2000);
    }
  });
}
