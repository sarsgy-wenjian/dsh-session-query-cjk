// Extract entries from an Electron app.asar archive to a directory (read-only on the archive).
// usage: node asar-extract.mjs <asar-file> <out-dir> <substring> [<substring> ...]
import fs from 'node:fs';
import path from 'node:path';

const [file, outDir, ...filters] = process.argv.slice(2);
if (!file || !outDir || filters.length === 0) {
  console.error('usage: node asar-extract.mjs <asar> <outDir> <filter...>');
  process.exit(2);
}

const fd = fs.openSync(file, 'r');
try {
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const headerSize = head.readUInt32LE(12);
  const json = Buffer.alloc(headerSize);
  fs.readSync(fd, json, 0, headerSize, 16);
  const root = JSON.parse(json.toString('utf8'));
  const base = 8 + head.readUInt32LE(4); // data offset = 8 (pickle head) + payload

  const entries = [];
  const walk = (node, prefix) => {
    for (const [name, value] of Object.entries(node.files ?? {})) {
      const p = prefix ? `${prefix}/${name}` : name;
      if (value.files) walk(value, p);
      else entries.push({ p, size: Number(value.offset ?? 0), realSize: Number(value.size ?? 0) });
    }
  };
  walk(root, '');

  let n = 0;
  for (const e of entries) {
    if (!filters.some((f) => e.p.toLowerCase().includes(f.toLowerCase()))) continue;
    const dest = path.join(outDir, ...e.p.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const buf = Buffer.alloc(e.realSize);
    fs.readSync(fd, buf, 0, e.realSize, base + e.size);
    fs.writeFileSync(dest, buf);
    n += 1;
  }
  console.log(`extracted ${n} files to ${outDir}`);
} finally {
  fs.closeSync(fd);
}
