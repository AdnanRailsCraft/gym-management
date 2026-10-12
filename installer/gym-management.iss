; Gym Management System — Inno Setup script (Phase 0).
; Stage tree produced by scripts/windows/03-stage.ps1:
;   <StageDir>\ruby\      portable Ruby runtime
;   <StageDir>\app\       Rails app + vendor\bundle (deployment gems)
;   <StageDir>\desktop\   gym-desktop.exe (Tauri shell)
; Runtime data lives in %ProgramData%\GymManagementSystem — NOT under {app}.
; Uninstall deliberately leaves that directory untouched (REQUIREMENTS §33).
; Compile via scripts/windows/04-installer.ps1 (defines StageDir/OutputDir).

#define MyAppName "Gym Management System"
#define MyAppVersion "0.1.0"
#ifndef StageDir
  #define StageDir "..\dist\stage"
#endif
#ifndef OutputDir
  #define OutputDir "..\dist"
#endif

[Setup]
AppId={{8B6A2E0C-4F2D-4A6B-9C11-0D3E7A9B5F21}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Gym Management System
DefaultDirName={autopf}\Gym Management System
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=GymManagementSystem-Setup-{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
UninstallDisplayName={#MyAppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Dirs]
; per-machine data dir — never removed on uninstall
Name: "{commonappdata}\GymManagementSystem"
Name: "{commonappdata}\GymManagementSystem\logs"
Name: "{commonappdata}\GymManagementSystem\db"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\desktop\gym-desktop.exe"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\desktop\gym-desktop.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\desktop\gym-desktop.exe"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
