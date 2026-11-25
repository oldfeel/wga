import fs from "fs";

const path =
  process.argv[2] ||
  String.raw`D:\World of Warcraft\_forever_\WTF\Account\196841649#1\SavedVariables\WGA.lua`;
const text = fs.readFileSync(path, "utf8");
const re = /(?:\["last_json"\]|last_json)\s*=\s*"((?:\\.|[^"\\])*)"/;
const m = text.match(re);
if (!m) {
  console.error("no last_json");
  process.exit(1);
}
let s = m[1];
s = s.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\\\/g, "\\");
const obj = JSON.parse(s);
const eq = obj.equipment || [];
console.log(
  JSON.stringify(
    {
      addon: obj.addon_version,
      captured: obj.captured_at,
      equip: eq.length,
      withIcon: eq.filter((e) => e.icon).length,
      withFileId: eq.filter((e) => e.icon_file_id).length,
      withItem: eq.filter((e) => e.item_id).length,
      sample: eq.filter((e) => e.item_id).slice(0, 3),
    },
    null,
    2
  )
);
