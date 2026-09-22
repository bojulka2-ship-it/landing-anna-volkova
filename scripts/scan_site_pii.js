/* Запрет публикации ПДн и служебных файлов в site/ (GitHub Pages). */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const site = path.join(root, "site");

if (!fs.existsSync(site)) {
  console.error("FAIL: site/ не найдена — сначала node scripts/build.js");
  process.exit(1);
}

const FORBIDDEN_PATHS = [
  "send.php",
  "config",
  "logs",
  "tests",
  "scripts",
  "ACCEPTANCE_CHECKLIST.md",
  "AUDIT_REPORT.md",
  "README.md",
];

const TEXT_EXT = new Set([".html", ".js", ".css", ".json", ".txt", ".md", ".php"]);

/** Паттерны, которых не должно быть в публикуемом тексте. */
const FORBIDDEN_PATTERNS = [
  { re: /submissions\.log/i, why: "путь к логу ПДн" },
  { re: /managers\.local\.php/i, why: "локальный секретный конфиг" },
  { re: /MAIL_MODE/i, why: "серверный конфиг письма" },
  { re: /TO_EMAIL|FROM_EMAIL/i, why: "почта менеджера из PHP-конфига" },
  { re: /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/i, why: "приватный ключ" },
  {
    re: /[A-Za-z0-9._%+-]+@(?!example\.ru)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    why: "не-плейсхолдер e-mail",
  },
];

function walk(dir, base) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p, base));
    else if (entry.isFile()) {
      out.push(path.relative(base, p).split(path.sep).join("/"));
    }
  }
  return out;
}

const errors = [];

for (const rel of FORBIDDEN_PATHS) {
  if (fs.existsSync(path.join(site, rel))) {
    errors.push("запрещённый путь в site/: " + rel);
  }
}

const files = walk(site, site);
for (const rel of files) {
  const ext = path.extname(rel).toLowerCase();
  if (!TEXT_EXT.has(ext)) continue;
  const text = fs.readFileSync(path.join(site, rel), "utf8");
  for (const { re, why } of FORBIDDEN_PATTERNS) {
    if (re.test(text)) {
      errors.push(rel + ": " + why + " (" + re + ")");
    }
  }
}

if (errors.length) {
  console.error("PII/forbidden scan FAIL:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

console.log(
  "PII/forbidden scan OK: " + files.length + " файлов, ПДн и служебные файлы не найдены."
);
