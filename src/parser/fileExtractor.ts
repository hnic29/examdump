import fs from 'node:fs/promises';
import path from 'node:path';

// Use require() directly — externalized from Vite bundle so dynamic import() is unreliable.
// pdf-parse is required from /lib/pdf-parse.js (not the package root) to avoid its
// test-file auto-loading behaviour, which crashes in non-standard working directories.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth: { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> } = require('mammoth');

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File is too large (${Math.round(stat.size / 1024 / 1024)} MB). Maximum supported size is 50 MB.`);
  }

  if (ext === '.txt') {
    return fs.readFile(filePath, 'utf-8');
  }

  if (ext === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === '.docx' || ext === '.doc') {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext}. Supported: .txt, .pdf, .docx, .json`);
}
