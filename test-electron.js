const { spawnSync } = require('child_process');
const res = spawnSync('node_modules/electron/dist/electron.exe', [
  '-e',
  'const db = require("better-sqlite3")(":memory:"); console.log("ELECTRONDONE", JSON.stringify(db.prepare("SELECT 42 as answer").get())); process.exit(0);'
], { encoding: 'utf8', env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' } });
console.log('STDOUT:', res.stdout);
console.log('STDERR:', res.stderr);
console.log('EXIT:', res.status);
