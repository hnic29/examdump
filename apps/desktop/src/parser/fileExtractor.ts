import fs from 'node:fs/promises';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse') as {
  PDFParse: new (opts: { data: Buffer }) => {
    getText: (opts?: { pageJoiner?: string }) => Promise<{ text: string }>;
    destroy: () => Promise<void>;
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const mammoth = require('mammoth') as {
  extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
  convertToHtml: (opts: { buffer: Buffer; convertImage?: unknown }) => Promise<{ value: string }>;
  images: {
    imgElement: (fn: (image: { read: (enc: string) => Promise<string>; contentType: string }) => Promise<{ src: string }>) => unknown;
  };
};

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export interface FileContent {
  text: string;
  /** Base64 data URIs indexed by [[IMG:N]] placeholders in text. Empty for non-DOCX files. */
  images: string[];
}

export async function extractFileContent(filePath: string): Promise<FileContent> {
  const ext = path.extname(filePath).toLowerCase();

  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File is too large (${Math.round(stat.size / 1024 / 1024)} MB). Maximum supported size is 50 MB.`);
  }

  if (ext === '.txt') {
    const text = await fs.readFile(filePath, 'utf-8');
    return { text, images: [] };
  }

  if (ext === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText({ pageJoiner: '\n' });
      return { text: result.text, images: [] };
    } finally {
      await parser.destroy();
    }
  }

  if (ext === '.docx' || ext === '.doc') {
    const buffer = await fs.readFile(filePath);
    const images: string[] = [];

    // Use convertToHtml so we can intercept embedded images via the image callback.
    // Images are replaced with [[IMG:N]] placeholders in the extracted text.
    const result = await mammoth.convertToHtml({
      buffer,
      convertImage: mammoth.images.imgElement(async (image) => {
        const b64 = await image.read('base64');
        images.push(`data:${image.contentType};base64,${b64}`);
        return { src: `__IMG_${images.length - 1}__` };
      }),
    });

    const text = result.value
      .replace(/<img[^>]*src="__IMG_(\d+)__"[^>]*\/?>/gi, '\n[[IMG:$1]]\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    return { text, images };
  }

  throw new Error(`Unsupported file type: ${ext}. Supported: .txt, .pdf, .docx, .json`);
}
