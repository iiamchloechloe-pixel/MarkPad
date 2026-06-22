// Merge the x64 and arm64 MarkPad.app bundles into one Universal app.
// Usage: node build/make-universal.js
const { makeUniversalApp } = require('@electron/universal');
const path = require('path');

(async () => {
  const out = path.resolve('dist/MarkPad-universal.app');
  await makeUniversalApp({
    x64AppPath: '/tmp/MarkPad-x64.app',
    arm64AppPath: '/tmp/MarkPad-arm64.app',
    outAppPath: out,
    force: true,
  });
  console.log('universal app written to', out);
})().catch(e => { console.error('UNIVERSAL ERROR:', e.message); process.exit(1); });
