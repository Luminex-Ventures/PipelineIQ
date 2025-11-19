#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const binDir = path.join(root, 'node_modules', '.bin');
const binPath = path.join(binDir, 'vite');
const targetPath = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function writeShim(filePath, target) {
  const shim = `#!/usr/bin/env node
import '${target.replace(/\\/g, '/')}';
`;
  fs.writeFileSync(filePath, shim, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

try {
  if (!fs.existsSync(targetPath)) {
    process.exit(0);
  }

  fs.mkdirSync(binDir, { recursive: true });

  let needsFix = true;
  if (fs.existsSync(binPath)) {
    const stat = fs.lstatSync(binPath);
    if (stat.isSymbolicLink()) {
      const resolved = path.resolve(path.dirname(binPath), fs.readlinkSync(binPath));
      if (resolved === targetPath) {
        needsFix = false;
      } else {
        fs.unlinkSync(binPath);
      }
    } else {
      const contents = fs.readFileSync(binPath, 'utf8');
      if (contents.includes('vite/bin/vite.js')) {
        needsFix = false;
      } else {
        fs.unlinkSync(binPath);
      }
    }
  }

  if (!needsFix) {
    process.exit(0);
  }

  try {
    if (fs.existsSync(binPath)) {
      fs.unlinkSync(binPath);
    }
    fs.symlinkSync(targetPath, binPath);
  } catch {
    writeShim(binPath, targetPath);
  }
} catch (error) {
  console.warn('[fixViteBin] Unable to verify Vite CLI shim:', error.message);
}
