import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("prepare-standalone: .next/standalone/server.js missing — run `next build` first");
  process.exit(1);
}

function cp(from, to) {
  fs.cpSync(from, to, { recursive: true, force: true });
}

// Next standalone omits static assets and public files.
const staticSrc = path.join(root, ".next", "static");
if (fs.existsSync(staticSrc)) {
  cp(staticSrc, path.join(standalone, ".next", "static"));
}
const publicSrc = path.join(root, "public");
if (fs.existsSync(publicSrc)) {
  cp(publicSrc, path.join(standalone, "public"));
}

// Migrations ship with the server (packaged cwd = resources/app).
cp(path.join(root, "db", "migrations"), path.join(standalone, "db", "migrations"));

// better-sqlite3 13 has no transitive runtime deps (node-addon-api is
// build-time only), so the package copy alone is sufficient.
{
  const pkg = "better-sqlite3";
  const src = path.join(root, "node_modules", pkg);
  if (!fs.existsSync(src)) {
    console.error("prepare-standalone: better-sqlite3 missing from node_modules");
    process.exit(1);
  }
  const dest = path.join(standalone, "node_modules", pkg);
  fs.rmSync(dest, { recursive: true, force: true });
  cp(src, dest);
}

// Next traces optional platform natives (sharp, @next/swc-*) from the build
// host. They are not used at runtime here (images.unoptimized: true; server
// is prebuilt), and shipping Linux .node files inside a Windows package is
// dead weight that confuses audits. Drop them from the standalone tree.
const drop = ["sharp", "@img", "@emnapi", "@img/sharp-libvips-linux-x64"];
for (const rel of drop) {
  const p = path.join(standalone, "node_modules", rel);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}
const swcDir = path.join(standalone, "node_modules", "@next");
if (fs.existsSync(swcDir)) {
  for (const entry of fs.readdirSync(swcDir)) {
    if (entry.startsWith("swc-")) {
      fs.rmSync(path.join(swcDir, entry), { recursive: true, force: true });
    }
  }
}

console.log("prepare-standalone: ok");
