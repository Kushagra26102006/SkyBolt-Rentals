import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Ephemeral In-Memory/Local Redis Server for Automated Testing
 * Launches an isolated redis-server process on a dynamic ephemeral port.
 */
export class EphemeralRedisServer {
  private process: ChildProcess | null = null;
  private dirPath = '';
  public port = 0;
  public host = '127.0.0.1';

  public async start(): Promise<string> {
    this.port = 27300 + Math.floor(Math.random() * 600);
    this.dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'skybolt-test-redis-'));

    return new Promise((resolve, reject) => {
      this.process = spawn('redis-server', [
        '--port',
        String(this.port),
        '--bind',
        '127.0.0.1',
        '--save',
        '',
        '--appendonly',
        'no',
        '--dir',
        this.dirPath
      ]);

      const timeout = setTimeout(() => {
        this.stop().catch(() => {});
        reject(new Error('Timed out waiting for ephemeral Redis process to start'));
      }, 10000);

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes('Ready to accept connections')) {
          clearTimeout(timeout);
          this.process?.stdout?.off('data', onData);
          resolve(`redis://127.0.0.1:${this.port}`);
        }
      };

      this.process.stdout?.on('data', onData);
      this.process.stderr?.on('data', (chunk: Buffer) => {
        const errText = chunk.toString();
        if (errText.includes('Fatal') || errText.includes('Could not create server TCP listening socket')) {
          clearTimeout(timeout);
          reject(new Error(`redis-server error: ${errText}`));
        }
      });

      this.process.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.process && this.process.exitCode === null) {
        this.process.once('close', () => {
          this._cleanupFiles();
          resolve();
        });
        this.process.kill('SIGINT');
      } else {
        this._cleanupFiles();
        resolve();
      }
    });
  }

  private _cleanupFiles(): void {
    if (this.dirPath && fs.existsSync(this.dirPath)) {
      try {
        fs.rmSync(this.dirPath, { recursive: true, force: true });
      } catch {
        // Ignore temporary lock
      }
    }
  }
}
