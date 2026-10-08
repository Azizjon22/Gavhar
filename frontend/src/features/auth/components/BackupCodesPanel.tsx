import { Copy, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { copyToClipboard, downloadTextFile } from '@/lib/clipboard';

/** Bir martalik zaxira kodlar — faqat shu yerda bir marta ko'rsatiladi. */
export function BackupCodesPanel({ codes }: { codes: string[] }) {
  const { t } = useTranslation();
  const asText = codes.join('\n');

  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border bg-muted/60 p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code} className="tabular text-center tracking-wider">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void copyToClipboard(asText)}>
          <Copy />
          {t('common.copy')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadTextFile(
              'gavhar-zaxira-kodlar.txt',
              `${t('twoFactor.backup.fileHeader')}\n\n${asText}\n`,
            )
          }
        >
          <Download />
          {t('common.download')}
        </Button>
      </div>
    </div>
  );
}
