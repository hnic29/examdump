import * as pdfjsLib from 'pdfjs-dist';
// eslint-disable-next-line import/no-unresolved -- Vite's `?url` suffix import, typed via vite/client
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export interface FileContent {
  text: string;
  /** Base64 data URIs indexed by [[IMG:N]] placeholders in text. Empty for non-DOCX files. */
  images: string[];
}

async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  return pages.join('\n');
}

async function extractDocxContent(arrayBuffer: ArrayBuffer): Promise<FileContent> {
  const images: string[] = [];

  // Use convertToHtml so we can intercept embedded images via the image callback.
  // Images are replaced with [[IMG:N]] placeholders in the extracted text.
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const b64 = await image.read('base64');
        images.push(`data:${image.contentType};base64,${b64}`);
        return { src: `__IMG_${images.length - 1}__` };
      }),
    }
  );

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

export async function extractFileContent(file: File): Promise<FileContent> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File is too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum supported size is 50 MB.`);
  }
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

  if (ext === '.txt') {
    return { text: await file.text(), images: [] };
  }

  if (ext === '.pdf') {
    const text = await extractPdfText(await file.arrayBuffer());
    return { text, images: [] };
  }

  if (ext === '.docx' || ext === '.doc') {
    return extractDocxContent(await file.arrayBuffer());
  }

  throw new Error(`Unsupported file type: ${ext}. Supported: .txt, .pdf, .docx, .json`);
}
