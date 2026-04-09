const { spawn } = require('child_process');
const path = require('path');

// Some shells keep ELECTRON_RUN_AS_NODE=1 around after running helper processes.
// Strip it here so the desktop app always starts in Electron mode.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronBinary = require('electron');
const appRoot = path.resolve(__dirname, '..');

const child = spawn(electronBinary, ['.'], {
  cwd: appRoot,
  env,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('Failed to start Electron:', error);
  process.exit(1);
});
