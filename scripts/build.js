/* Сборка чистой статики в site/: без send.php, config/, logs/, tests/, *.md. */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "site");

const INCLUDE_DIRS = ["css", "js", "fonts", "images"];
const INCLUDE_FILES = ["index.html", "policy.html", "zayavka.html"];

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function walk(dir, base) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(p, base));
    else if (entry.isFile()) {
      result.push({
        file: path.relative(base, p).split(path.sep).join("/"),
        size: fs.statSync(p).size
      });
    }
  }
  return result;
}

// Чистая сборка
rmrf(out);
fs.mkdirSync(out, { recursive: true });

for (const dir of INCLUDE_DIRS) {
  const src = path.join(root, dir);
  if (!fs.existsSync(src)) {
    console.error("Пропущено (нет папки): " + dir);
    continue;
  }
  copyDir(src, path.join(out, dir));
}

for (const file of INCLUDE_FILES) {
  const src = path.join(root, file);
  if (!fs.existsSync(src)) {
    console.error("Пропущено (нет файла): " + file);
    continue;
  }
  fs.copyFileSync(src, path.join(out, file));
}

// Проверка: в site/ не должно быть запрещённых файлов
const forbidden = ["send.php", "config", "logs", "tests", "scripts"];
for (const name of forbidden) {
  if (fs.existsSync(path.join(out, name))) {
    console.error("ОШИБКА: в site/ попал запрещённый элемент: " + name);
    process.exit(1);
  }
}

const files = walk(out, out);
const total = files.reduce((sum, f) => sum + f.size, 0);

console.log("Сборка site/ завершена.");
console.log("Файлов: " + files.length + ", всего: " + (total / 1024).toFixed(1) + " КБ");
for (const f of files.sort((a, b) => b.size - a.size).slice(0, 10)) {
  console.log("  " + (f.size / 1024).toFixed(1).padStart(7) + " КБ  " + f.file);
}
