import { spawn } from 'child_process';
import fs from 'fs';
import crypto from 'crypto';
import { debugLogger } from './debugLogger.js';

export class ZipManager {
    static async verify7zAvailability(): Promise<boolean> {
        return new Promise((resolve) => {
            const check = spawn('7z', ['i']);
            check.on('error', () => resolve(false));
            check.on('close', (code) => resolve(code === 0));
        });
    }

    /**
     * Creates a ZIP archive using 7-Zip.
     * @param cwd The root directory for the files (files inside ZIP will be relative to this).
     * @param relativeFiles List of file paths relative to cwd.
     * @param outputPath Full path for the output ZIP file.
     * @param password Optional password.
     */
    static async createArchive(cwd: string, relativeFiles: string[], outputPath: string, password?: string): Promise<void> {
        // Create a temporary list file for 7z
        const listFile = outputPath + '.lst';

        // 7z expects UTF-8 list files if -scsUTF-8 is used.
        // We join with newlines.
        const fileContent = relativeFiles.join('\n');
        await fs.promises.writeFile(listFile, fileContent, 'utf8');

        return new Promise((resolve, reject) => {
            // -tzip: Create ZIP format
            // -mx=1: Fastest compression (Store=0 is also option, but 1 provides some compression cheaply)
            // -scsUTF-8: Read list file as UTF-8
            // -bb0: Less log spam
            const args = ['a', '-tzip', '-mx=1', '-scsUTF-8', '-bb0'];

            if (password && password.trim().length > 0) {
                args.push(`-p${password}`);
            }

            args.push(outputPath);
            // Quote the path for safety, though spawn handles array args well.
            // valid path for listfile
            args.push(`@${listFile}`);

            debugLogger.info("ZipManager", `Creating archive: ${outputPath} with ${relativeFiles.length} files.`);

            const p = spawn('7z', args, { cwd: cwd });

            let stderr = '';
            p.stderr.on('data', (data) => { stderr += data.toString(); });

            p.on('close', async (code) => {
                // Cleanup list file
                try { await fs.promises.unlink(listFile); } catch { }

                if (code === 0) {
                    resolve();
                } else {
                    debugLogger.error("ZipManager", `7z failed with code ${code}`, stderr);
                    reject(new Error(`7z process exited with code ${code}: ${stderr}`));
                }
            });

            p.on('error', async (err) => {
                try { await fs.promises.unlink(listFile); } catch { }
                debugLogger.error("ZipManager", `7z spawn error`, err);
                reject(err);
            });
        });
    }

    /**
     * Calculates a deterministic hash for a chunk of files.
     * @param files Array of file objects with relativePath, size, mtimeMs.
     */
    static calculateChunkHash(files: { relativePath: string, size: number, mtimeMs: number }[]): string {
        const hash = crypto.createHash('sha256');
        // Files should be sorted by relativePath before calling this to ensure determinism.
        for (const file of files) {
            hash.update(`${file.relativePath}|${file.size}|${file.mtimeMs}\n`);
        }
        return hash.digest('hex');
    }
}
