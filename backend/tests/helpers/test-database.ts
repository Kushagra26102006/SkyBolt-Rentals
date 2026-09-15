import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Ephemeral In-Memory/Local MongoDB Server for Automated Testing
 * Launches an isolated mongod process with temporary dbpath and cleans up on exit.
 */
export class EphemeralMongoServer {
  private process: ChildProcess | null = null;
  private dbPath = '';
  private port = 0;

  public async start(): Promise<string> {
    this.port = 27100 + Math.floor(Math.random() * 800);
    this.dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'skybolt-test-mongo-'));

    return new Promise((resolve, reject) => {
      this.process = spawn('mongod', [
        '--port',
        String(this.port),
        '--dbpath',
        this.dbPath,
        '--bind_ip',
        '127.0.0.1'
      ]);

      const timeout = setTimeout(() => {
        this.stop().catch(() => {});
        reject(new Error('Timed out waiting for ephemeral MongoDB process to start'));
      }, 10000);

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes('Waiting for connections')) {
          clearTimeout(timeout);
          this.process?.stdout?.off('data', onData);
          resolve(`mongodb://127.0.0.1:${this.port}/skybolt_rentals_test_${Date.now()}`);
        }
      };

      this.process.stdout?.on('data', onData);
      this.process.stderr?.on('data', (chunk: Buffer) => {
        const errText = chunk.toString();
        if (errText.includes('ERROR') || errText.includes('Fatal')) {
          clearTimeout(timeout);
          reject(new Error(`mongod error: ${errText}`));
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
    if (this.dbPath && fs.existsSync(this.dbPath)) {
      try {
        fs.rmSync(this.dbPath, { recursive: true, force: true });
      } catch {
        // Ignore temporary file lock
      }
    }
  }
}
