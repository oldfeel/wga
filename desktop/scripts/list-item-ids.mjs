import fs from "fs";
const path =
  process.argv[2] ||
  String.raw`D:\World of Warcraft\_forever_\WTF\Account\196841649#1\SavedVariables\WGA.lua`;
const text = fs.readFileSync(path, "utf8");
const m = text.match(/(?:\["last_json"\]|last_json)\s*=\s*"((?:\\.|[^"\\])*)"/);
if (!m) throw new Error("no last_json");
const s = m[1]
  .replace(/\\"/g, '"')
  .replace(/\\n/g, "\n")
  .replace(/\\r/g, "\r")
  .replace(/\\\\/g, "\\");
const obj = JSON.parse(s);
const ids = [
  ...new Set((obj.equipment || []).map((e) => e.item_id).filter(Boolean)),
];
console.log(JSON.stringify({ addon: obj.addon_version, ids }, null, 2));
