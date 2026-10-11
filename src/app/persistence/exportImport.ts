import { decodeSave, type SaveFile } from '@core/save/serialize';
import { dayToCalendar } from '@core/systems/time';
import { SAVECFG, type LoadOutcome } from './saveStore';

/** 匯入驗證只回傳預覽資料；不寫入槽位，也不改變進行中的遊戲。 */
export async function importSave(file: Pick<File, 'size' | 'text'>): Promise<LoadOutcome> {
  if (file.size > SAVECFG.importFileMaxBytes) return { ok: false, error: 'file-too-large' };
  try {
    const raw = await file.text();
    const decoded = decodeSave(raw);
    if (!decoded.ok) {
      return {
        ok: false,
        error:
          decoded.code === 'invalidFile'
            ? 'invalid-file'
            : decoded.code === 'newerVersion'
              ? 'newer-version'
              : 'corrupt',
      };
    }
    const original = JSON.parse(raw) as { version: number };
    return {
      ok: true,
      save: decoded.saveFile,
      migratedFrom: decoded.migrated ? original.version : null,
    };
  } catch {
    return { ok: false, error: 'invalid-file' };
  }
}

export function buildExport(save: SaveFile): { name: string; json: string } {
  const date = dayToCalendar(save.meta.day);
  const clan = save.meta.clanId.replace(/^clan\./u, '').replace(/[^a-z0-9-]/gu, '-');
  const month = String(date.month).padStart(2, '0');
  const day = String(date.dayOfMonth).padStart(2, '0');
  return {
    name: `tenkafubu_${clan}_${date.year}-${month}-${day}_${save.timestamp}.tenkafubu.json`,
    json: JSON.stringify(save),
  };
}

/** 下載不開啟視窗；finally 確保成功與失敗都清除暫時資源。 */
export function downloadSave(save: SaveFile): void {
  const exported = buildExport(save);
  const url = URL.createObjectURL(new Blob([exported.json], { type: 'application/json' }));
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = exported.name;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
