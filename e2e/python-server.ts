import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';

export interface PythonServer {
  port: number;
  stop(): Promise<void>;
}

/** Use the repository's Python and an OS-assigned port; surface import/bind errors immediately. */
export async function startPythonServer(
  args: string[],
  webPort: string,
  timeoutMs = 30_000,
): Promise<PythonServer> {
  const python = path.resolve(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
  const options = { env: { ...process.env, BACKLOT_WEB_PORT: webPort } };
  function start(architecture?: string): Promise<PythonServer> {
    const command = architecture ? '/usr/bin/arch' : python;
    const commandArgs = [...(architecture ? ['-' + architecture, python] : []), ...args, '--port', '0'];
    const child = spawn(command, commandArgs, options);
    let diagnostics = '';
    child.stderr.on('data', (chunk) => {
      diagnostics = (diagnostics + chunk).slice(-4000);
    });
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Python server startup timed out. ' + diagnostics));
      }, timeoutMs);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        reject(new Error('Python server exited with code ' + code + '. ' + diagnostics));
      });
      const lines = createInterface({ input: child.stdout });
      lines.on('line', (line) => {
        const port = line.match(/ws:\/\/localhost:(\d+)/)?.[1];
        if (!port) return;
        clearTimeout(timer);
        resolve({
          port: Number(port),
          stop: async () => {
            child.kill();
            await closed;
          },
        });
      });
    });
  }
  try {
    return await start();
  } catch (error) {
    // A translated Node process can launch universal Python under Rosetta even
    // when its installed NumPy or Torch wheels were built for native Apple Silicon.
    const architecture = String(error).match(/incompatible architecture \(have '(arm64|x86_64)'/)?.[1];
    if (process.platform === 'darwin' && architecture) return await start(architecture);
    throw error;
  }
}
