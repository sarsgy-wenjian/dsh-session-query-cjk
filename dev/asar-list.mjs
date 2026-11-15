// List entries inside an Electron app.asar archive (read-only).
// usage: node asar-list.mjs <asar-file> <substring-filter>
// Prints matching file paths, one per line.
import fs from 'node:fs';

const [file, filter = ''] = process.argv.slice(2);
if (!file) {
  console.error('need asar path');
  process.exit(2);
}

const fd = fs.openSync(file, 'r');
try {
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  // pickle: uint32 headerPickleSize, uint32 headerSize(+4?), ...
  const payloadSize = head.readUInt32LE(4);
  const headerSize = head.readUInt32LE(12);
  const jsonLen = headerSize;
  const json = Buffer.alloc(jsonLen);
  fs.readSync(fd, json, 0, jsonLen, 16);
  const root = JSON.parse(json.toString('utf8'));
  const out = [];
  const walk = (node, prefix) => {
    for (const [name, value] of Object.entries(node.files ?? {})) {
      const p = prefix ? `${prefix}/${name}` : name;
      if (value.files) walk(value, p);
      else {
        const size = Number(value.size ?? 0);
        out.push({ p, size });
      }
    }
  };
  walk(root, '');
  const needle = filter.toLowerCase();
  const hits = needle ? out.filter((e) => e.p.toLowerCase().includes(needle)) : out;
  for (const e of hits) console.log(`${e.size}\t${e.p}`);
  console.error(`total entries=${out.length} matched=${hits.length} headerBytes=${payloadSize}`);
} finally {
  fs.closeSync(fd);
}
