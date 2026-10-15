// Preload script — runs before renderer.
// With nodeIntegration: true we can use require() and directly set window.api.
const fs = require("fs");
const path = require("path");
const marked = require("marked");

const FILES_DIR = "/home/x/workspace/gym/files";

let fileEntries = [];
try {
  const items = fs.readdirSync(FILES_DIR);
  fileEntries = items
    .filter(f => f.endsWith(".md"))
    .map(f => ({
      name: f.replace(/\.md$/, ""),
      path: f
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
} catch (e) {
  console.error("Failed to read docs dir:", e);
}

window.api = {
  // List markdown file names (without .md)
  loadFiles: () => fileEntries.map(f => f.name),
  // Render a file's markdown to HTML
  renderMarkdown: (filePath) => {
    try {
      const content = fs.readFileSync(path.join(FILES_DIR, filePath), "utf-8");
      return marked.parse(content);
    } catch (e) {
      console.error(`Failed to render ${filePath}`, e);
      return `<p>Error loading file: ${e.message}</p>`;
    }
  }
};