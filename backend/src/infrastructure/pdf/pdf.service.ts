import { dirname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
// Standart import: pdfmake obyekt nusxasini eksport qiladi (metodlari prototipda),
// `import * as` esa ularni yo'qotadi.
import pdfmake from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

const FONT_DIR = join(dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');

// Roboto lotin va kirill harflarini qo'llaydi — o'zbekcha va ruscha matn uchun yetarli.
pdfmake.setFonts({
  Roboto: {
    normal: join(FONT_DIR, 'Roboto-Regular.ttf'),
    bold: join(FONT_DIR, 'Roboto-Medium.ttf'),
    italics: join(FONT_DIR, 'Roboto-Italic.ttf'),
    bolditalics: join(FONT_DIR, 'Roboto-MediumItalic.ttf'),
  },
});

/** Hujjat ichidan tashqi manzil yoki ixtiyoriy mahalliy fayl o'qilishiga yo'l qo'yilmaydi. */
const policies = pdfmake as unknown as {
  setUrlAccessPolicy?: (policy: (url: string) => boolean) => void;
  setLocalAccessPolicy?: (policy: (path: string) => boolean) => void;
};
policies.setUrlAccessPolicy?.(() => false);
policies.setLocalAccessPolicy?.((path) => path.startsWith(FONT_DIR));

@Injectable()
export class PdfService {
  /** Hujjat ta'rifidan PDF yaratadi (server tomonda, brauzersiz). */
  render(definition: TDocumentDefinitions): Promise<Buffer> {
    return pdfmake
      .createPdf({
        ...definition,
        defaultStyle: { font: 'Roboto', fontSize: 10, ...definition.defaultStyle },
      })
      .getBuffer();
  }
}
