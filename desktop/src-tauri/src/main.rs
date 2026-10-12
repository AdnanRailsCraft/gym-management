// Gym Management System desktop shell.
//
// Responsibilities (REQUIREMENTS §33 / DESIGN B14):
// - single instance
// - pick a free loopback port, boot the packaged Rails app on it
// - open one window pointed at http://127.0.0.1:<port>/
// - closing the window kills the Rails server (no orphans)
// - data dir is %PROGRAMDATA%\GymManagementSystem (per-machine, installer
//   elevates once; runtime never elevates)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

struct RailsState(Mutex<Option<Child>>);

fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn data_dir() -> PathBuf {
    let base = std::env::var_os("PROGRAMDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));
    base.join("GymManagementSystem")
}

fn free_loopback_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("allocate free loopback port")
        .local_addr()
        .expect("local_addr")
        .port()
}

fn log_line(msg: &str) {
    let logs = data_dir().join("logs");
    let _ = std::fs::create_dir_all(&logs);
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs.join("launcher.log"))
    {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(f, "[{secs}] {msg}");
    }
}

fn ruby_path() -> PathBuf {
    exe_dir().join("ruby").join("bin").join("ruby.exe")
}

fn app_dir() -> PathBuf {
    exe_dir().join("app")
}

fn run_db_prepare() -> std::io::Result<()> {
    let logs = data_dir().join("logs");
    let _ = std::fs::create_dir_all(&logs);
    let out = OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs.join("launcher.log"))?;
    let err = out.try_clone()?;
    let status = Command::new(ruby_path())
        .arg("bin/rails")
        .arg("db:prepare")
        .current_dir(app_dir())
        .env("RAILS_ENV", "production")
        .env("GMS_DATA_DIR", data_dir())
        .stdout(Stdio::from(out))
        .stderr(Stdio::from(err))
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other(format!(
            "db:prepare exited with {status}"
        )))
    }
}

fn spawn_server(port: u16) -> std::io::Result<Child> {
    Command::new(ruby_path())
        .arg("bin/rails")
        .arg("server")
        .current_dir(app_dir())
        .env("RAILS_ENV", "production")
        .env("GMS_DATA_DIR", data_dir())
        .env("PORT", port.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
}

fn wait_healthy(port: u16, attempts: u32) -> bool {
    let url = format!("http://127.0.0.1:{port}/up");
    for _ in 0..attempts {
        if let Ok(resp) = ureq::get(&url).timeout(Duration::from_secs(2)).call() {
            if resp.status() == 200 {
                return true;
            }
        }
        std::thread::sleep(Duration::from_secs(1));
    }
    false
}

fn open_main_window(app: &AppHandle, port: u16) {
    let url = WebviewUrl::External(
        url::Url::parse(&format!("http://127.0.0.1:{port}/")).expect("loopback url parses"),
    );
    let _ = WebviewWindowBuilder::new(app, "main", url)
        .title("Gym Management System")
        .inner_size(1280.0, 800.0)
        .build();
}

fn open_error_window(app: &AppHandle, msg: &str) {
    let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Gym Management System")
        .inner_size(900.0, 500.0)
        .build();
    if let Some(w) = app.get_webview_window("main") {
        let safe = msg.replace('\\', "\\\\").replace('\'', "\\'");
        let _ = w.eval(&format!(
            "document.getElementById('status').textContent = 'Failed to start'; \
             document.getElementById('detail').textContent = '{safe}';"
        ));
    }
}

fn post_main(app: &AppHandle, f: impl FnOnce(&AppHandle) + Send + 'static) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || f(&a));
}

fn boot_sequence(app: AppHandle) {
    log_line(&format!(
        "boot start exe_dir={:?} data_dir={:?}",
        exe_dir(),
        data_dir()
    ));
    if !ruby_path().exists() {
        let msg = format!("runtime not found at {:?}", ruby_path());
        log_line(&msg);
        post_main(&app, move |a| open_error_window(a, &msg));
        return;
    }
    if let Err(e) = run_db_prepare() {
        let msg = format!("db:prepare failed: {e}");
        log_line(&msg);
        post_main(&app, move |a| open_error_window(a, &msg));
        return;
    }
    let port = free_loopback_port();
    log_line(&format!("spawning rails server on 127.0.0.1:{port}"));
    match spawn_server(port) {
        Ok(child) => {
            *app.state::<RailsState>().0.lock().unwrap() = Some(child);
        }
        Err(e) => {
            let msg = format!("failed to spawn server: {e}");
            log_line(&msg);
            post_main(&app, move |a| open_error_window(a, &msg));
            return;
        }
    }
    if wait_healthy(port, 120) {
        log_line("healthy; opening main window");
        post_main(&app, move |a| open_main_window(a, port));
    } else {
        let msg = format!("server did not become healthy on port {port}");
        log_line(&msg);
        post_main(&app, move |a| open_error_window(a, &msg));
    }
}

fn kill_rails(app: &AppHandle) {
    let state = app.state::<RailsState>();
    let mut guard = state.0.lock().unwrap();
    if let Some(mut child) = guard.take() {
        // Kill the whole tree: puma may have grandchildren on Windows.
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = child.kill();
        log_line("rails server stopped");
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .manage(RailsState(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || boot_sequence(handle));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                log_line("window close requested; stopping rails");
                kill_rails(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
