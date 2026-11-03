import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const url = 'http://127.0.0.1:5173/';
async function status() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(800) });
    const own = response.headers.get('X-Form-Archive') === 'ak47';
    await response.body?.cancel();
    return own ? 'ready' : 'occupied';
  } catch { return 'offline'; }
}

try {
  await access(new URL('../dist/index.html', import.meta.url));
  const existing = await status();
  if (existing === 'occupied') throw new Error('Port 5173 is in use by another app.');
  if (existing !== 'ready') {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./preview-server.mjs', import.meta.url))], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      detached: true, windowsHide: true, stdio: 'ignore',
    });
    let spawnError;
    child.on('error', error => { spawnError = error; });
    child.unref();
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (spawnError) throw spawnError;
      if (await status() === 'ready') { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!ready) throw new Error('Preview did not start. Check port 5173 and Node.js.');
  }
  console.log(`Preview ready: ${url}`);
} catch (error) {
  console.error(error.message);
  console.error('If dist is missing, run: npm run build');
  process.exitCode = 1;
}
