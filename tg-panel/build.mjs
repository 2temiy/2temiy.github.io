// Inline tg-panel/dashboard.html into tg-panel/worker.js
// Run after editing dashboard.html: `node tg-panel/build.mjs`
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here   = dirname(fileURLToPath(import.meta.url));
const worker = join(here, "worker.js");
const html   = readFileSync(join(here, "dashboard.html"), "utf-8");

if (html.includes("`")) {
  console.error("dashboard.html contains a backtick — would break the JS template literal");
  process.exit(1);
}

const src   = readFileSync(worker, "utf-8");
const start = src.indexOf("const DASHBOARD_HTML = `<!DOCTYPE html>");
if (start === -1) { console.error("DASHBOARD_HTML constant not found"); process.exit(1); }

const endTag = src.indexOf("</html>", start);
const close  = src.indexOf("`;", endTag);
if (endTag === -1 || close === -1) { console.error("DASHBOARD_HTML close not found"); process.exit(1); }

const next = src.slice(0, start) + "const DASHBOARD_HTML = `" + html + "`;" + src.slice(close + 2);
writeFileSync(worker, next, "utf-8");
console.log("OK – worker.js rebuilt (" + (next.length / 1024).toFixed(1) + " KB)");
