import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
assert.equal(manifest.name, 'ContextSail');
assert.equal(JSON.parse(read('package.json')).name, 'contextsail');
for (const file of ['README.md', 'README.zh-CN.md', 'manifest.json', 'app/pages/popup/popup.html', 'app/pages/whiteboard/index.html']) {
  assert.doesNotMatch(read(file), /拾作|\bShizuo\b|shizuo-codex-workspace/);
}
assert.match(read('app/core/i18n.js'), /const KEY = "__shizuo_language_v1__"/, 'existing language preference must survive rebranding');
assert.match(read('app/core/pagedock-db.js'), /const DB_NAME = "pagedock"/, 'existing boards must remain in the same database');
assert.match(read('native-host/shizuo-mcp-server.mjs'), /name: "shizuo_list_boards"/, 'existing MCP clients must keep working');
for (const size of [16, 32, 48, 128, 512]) {
  const icon = readFileSync(new URL(`../icons/icon${size}.png`, import.meta.url));
  assert.equal(icon.readUInt32BE(16), size);
  assert.equal(icon.readUInt32BE(20), size);
}
assert(existsSync(new URL('../docs/contextsail-banner.png', import.meta.url)));
console.log('ContextSail branding and legacy compatibility checks passed');
