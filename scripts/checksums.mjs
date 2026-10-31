import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dist = path.join(process.cwd(), "dist");
if (!fs.existsSync(dist)) {
  console.log("checksums: no dist/ — nothing to hash");
  process.exit(0);
}
const files = fs
  .readdirSync(dist)
  .filter((f) => f.endsWith(".exe") || f.endsWith(".zip"));
if (!files.length) {
  console.log("checksums: no installer artifacts to hash");
  process.exit(0);
}
const lines = files.map((f) => {
  const digest = crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(dist, f)))
    .digest("hex");
  return `${digest}  ${f}`;
});
fs.writeFileSync(path.join(dist, "checksums.txt"), `${lines.join("\n")}\n`);
console.log("checksums: wrote dist/checksums.txt");
