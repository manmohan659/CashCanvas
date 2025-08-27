// Minimal OCR adapter. We keep OCR optional and only load in browser.
import type { OCRItem } from './types';

export async function extractItemsFromImageBase64(dataUrlOrBase64: string): Promise<OCRItem[]> {
  if (typeof window === 'undefined') return [];
  try {
    const Tesseract: any = await import('tesseract.js');
    const image = dataUrlOrBase64.startsWith('data:') ? dataUrlOrBase64 : `data:image/png;base64,${dataUrlOrBase64}`;
    const { data } = await Tesseract.recognize(image, 'eng');
    const lines = (data.text || '').split(/\n+/).map((s: string) => s.trim()).filter(Boolean);
    // Heuristic: detect lines like "Item ... 12.34" or "12.34 Item"
    const items: OCRItem[] = [];
    for (const line of lines) {
      const m1 = line.match(/^(.*?)[\s:]+([\-\+]?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)$/);
      const m2 = line.match(/^([\-\+]?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)[\s:]+(.*)$/);
      const m = m1 || m2;
      if (m) {
        const name = (m1 ? m1[1] : m2![2]).trim();
        const amtStr = (m1 ? m1[2] : m2![1]).replace(/,/g, '');
        const amount = Number(amtStr);
        if (Number.isFinite(amount) && amount > 0) {
          items.push({ name, amount });
        }
      }
    }
    return items;
  } catch {
    return [];
  }
}


