import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { debugLogger } from './debugLogger.js';

interface FontPreviewOptions {
    text: string;
    use_font_sheet?: boolean;
    bg_color?: string; // Snake case from config
    text_color?: string; // Snake case from config
    bgColor?: string; // Legacy/Manual override
    textColor?: string; // Legacy/Manual override
    size: 'small' | 'medium' | 'large';
    tempDir: string;
}

// Fallback search paths for system fonts (Android/Termux/Linux)
const SYSTEM_FONTS = [
    '/system/fonts/DroidSansMono.ttf',
    '/system/fonts/Roboto-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    '/usr/share/fonts/TTF/DejaVuSansMono.ttf'
];

function getSystemFont(): string | null {
    for (const p of SYSTEM_FONTS) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

const SIZE_MAP = {
    small: { width: 600, height: 400, fontSize: 36, footerSize: 20 },
    medium: { width: 1200, height: 800, fontSize: 72, footerSize: 32 },
    large: { width: 1920, height: 1080, fontSize: 120, footerSize: 48 }
};

// Specimen string for Font Sheet mode
// Includes Uppercase, Lowercase, Numbers, and common symbols.
// Line breaks are crucial for layout.
const FONT_SHEET_TEXT =
    `ABCDEFGHIJKLMNOPQRSTUVWXYZ
abcdefghijklmnopqrstuvwxyz
1234567890
!@#$%^&*()_+-=[]{};':",./<>?`;

// Helper to run shell commands
function runCommand(cmd: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        debugLogger.debug("FontGenerator", `Exec: ${cmd} ${args.join(' ')}`);
        const proc = spawn(cmd, args, { env: { ...process.env, ...env } });
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => stdout += data.toString());
        proc.stderr.on('data', (data) => stderr += data.toString());

        proc.on('close', (code) => {
            if (code === 0) resolve(stdout.trim());
            else reject(new Error(`Command failed [${code}]: ${stderr}`));
        });

        proc.on('error', (err) => reject(err));
    });
}

/**
 * Normalizes font formats to TTF using FFmpeg if necessary.
 * ImageMagick works best with direct TTF/OTF paths.
 * WOFF/WOFF2/EOT are converted to a temp TTF file.
 */
async function normalizeToTtf(inputPath: string, tempDir: string): Promise<{ path: string; isTemp: boolean }> {
    const ext = path.extname(inputPath).toLowerCase();

    // Natively supported by ImageMagick (via FreeType)
    if (ext === '.ttf' || ext === '.otf') {
        return { path: inputPath, isTemp: false };
    }

    // Conversion needed for WOFF, WOFF2, EOT
    const tempTtfName = `conv_${path.basename(inputPath, ext)}_${Date.now()}.ttf`;
    const tempTtfPath = path.join(tempDir, tempTtfName);

    try {
        debugLogger.info("FontGenerator", `Converting ${ext} to TTF for preview: ${path.basename(inputPath)}`);
        // Use ffmpeg to convert. It handles font format conversion well.
        await runCommand('ffmpeg', [
            '-y',
            '-i', inputPath,
            tempTtfPath
        ]);

        if (fs.existsSync(tempTtfPath) && fs.statSync(tempTtfPath).size > 0) {
            return { path: tempTtfPath, isTemp: true };
        } else {
            throw new Error("Conversion produced empty file");
        }
    } catch (e: any) {
        debugLogger.error("FontGenerator", `Font conversion failed: ${e.message}`);
        throw e;
    }
}

export async function generateFontPreview(fontPath: string, options: FontPreviewOptions): Promise<string | null> {
    const runId = Date.now();
    let workingFontPath = fontPath;
    let isTempFont = false;

    try {
        // 1. Normalize Font (Convert WOFF/EOT -> TTF)
        const normalized = await normalizeToTtf(fontPath, options.tempDir);
        workingFontPath = normalized.path;
        isTempFont = normalized.isTemp;

        // 2. Prepare Output Config
        const outputImage = path.join(options.tempDir, `preview_${runId}.png`);
        const { width, height, footerSize } = SIZE_MAP[options.size] || SIZE_MAP.medium;

        // Validate Colors
        // Prioritize snake_case (from config) then camelCase (legacy/manual)
        const bgColorRaw = options.bg_color || options.bgColor || '#ffffff';
        const textColorRaw = options.text_color || options.textColor || '#000000';

        const bgColor = bgColorRaw.trim();
        const textColor = textColorRaw.trim();

        // Determine Text
        const text = options.use_font_sheet ? FONT_SHEET_TEXT : (options.text || "ABC");
        const fontName = path.basename(fontPath);

        // 3. Build ImageMagick Command
        const compositeArgs: string[] = ['-size', `${width}x${height}`, `xc:${bgColor}`];

        if (options.use_font_sheet) {
            // Font Sheet Mode (3-Line Layout)
            // 1. Font Name (Large)
            // 2. A-Z 0-9 (Medium)
            // 3. a-z 0-9 (Medium)

            const specimen1 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ 1234567890";
            const specimen2 = "abcdefghijklmnopqrstuvwxyz 1234567890";

            // Calculation for padding to avoid "suffocation" and overlap
            const slotHeight = Math.floor(height / 3);
            const capWidth = width - 160; // 80px side padding
            const capHeight = slotHeight - 50; // Vertical breathing room

            compositeArgs.push(
                // Line 1: Name (Top) - Added margin
                '(', '-size', `${capWidth}x${capHeight}`, '-background', 'none', '-font', workingFontPath, '-fill', textColor, '-gravity', 'Center', `caption:${fontName}`, ')',
                '-gravity', 'North', '-geometry', '+0+30', '-composite',

                // Line 2: Specimen Upper (Middle)
                '(', '-size', `${capWidth}x${capHeight}`, '-background', 'none', '-font', workingFontPath, '-fill', textColor, '-gravity', 'Center', `caption:${specimen1}`, ')',
                '-gravity', 'Center', '-composite',

                // Line 3: Specimen Lower (Bottom) - Lifted 100px (or roughly 12-15% height) to clear Footer
                '(', '-size', `${capWidth}x${capHeight}`, '-background', 'none', '-font', workingFontPath, '-fill', textColor, '-gravity', 'Center', `caption:${specimen2}`, ')',
                '-gravity', 'South', '-geometry', `+0+${Math.floor(height * 0.12)}`, '-composite'
            );

        } else {
            // Standard/Custom Text Mode
            const contentWidth = width - 100;
            const contentHeight = height - 100;

            compositeArgs.push(
                '(',
                '-size', `${contentWidth}x${contentHeight}`,
                '-background', 'none',
                '-font', workingFontPath,
                '-fill', textColor,
                '-gravity', 'Center',
                `caption:${text}`,
                ')',
                '-gravity', 'Center',
                '-composite'
            );
        }

        // Add Footer (Universal)
        // Check for system font, if none, use the font itself (fallback) or 'Courier' if we risk it.
        // Using 'Courier' failed. Using the font itself is safest to avoid crash.
        const footerFont = getSystemFont() || workingFontPath;

        compositeArgs.push(
            '-font', footerFont,
            '-pointsize', footerSize.toString(),
            '-gravity', 'South',
            '-fill', textColor, // Use same text color for contrast
            '-annotate', '+0+10', fontName, // Slightly higher padding
            outputImage
        );


        await runCommand('magick', compositeArgs);

        // Verify output
        if (fs.existsSync(outputImage)) {
            debugLogger.info("FontGenerator", `Preview created: ${outputImage}`);
            return outputImage;
        } else {
            throw new Error("Output file not created");
        }

    } catch (e: any) {
        debugLogger.error("FontGenerator", `Generation failed: ${e.message}`);
        return null;
    } finally {
        // Cleanup temp converted font if it was created
        if (isTempFont && fs.existsSync(workingFontPath)) {
            try { fs.unlinkSync(workingFontPath); } catch (e) { /* ignore */ }
        }
    }
}
