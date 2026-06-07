import fs from 'node:fs/promises';
import path from 'node:path';

// Use require() directly — externalized from Vite bundle so dynamic import() is unreliable.
// pdf-parse v2 exposes a class (`PDFParse`), not a callable default export.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse') as {
  PDFParse: new (opts: { data: Buffer }) => {
    getText: (opts?: { pageJoiner?: string }) => Promise<{ text: string }>;
    destroy: () => Promise<void>;
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
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
    const parser = new PDFParse({ data: buffer });
    try {
      // pageJoiner '\n' suppresses the default "-- N of M --" page markers,
      // which would otherwise break the rule parser's question-block detection.
      const result = await parser.getText({ pageJoiner: '\n' });
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (ext === '.docx' || ext === '.doc') {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext}. Supported: .txt, .pdf, .docx, .json`);
}
