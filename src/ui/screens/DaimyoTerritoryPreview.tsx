import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import type { ScenarioBundleData } from '@data/schemas';
import type { ClanId } from '@core/state/ids';
import { loadOutline } from '@ui/map/mapDraw';
import { MAPVIEW, WORLD_SIZE } from '@ui/map/mapViewConfig';
import { TOKENS_NUM } from '@ui/styles/tokens';
import { t } from '@i18n/zh-TW';
import { buildDaimyoTerritoryData, clanAtTerritoryCell } from './territoryPreviewModel';
import styles from './DaimyoSelect.module.css';

function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export interface DaimyoTerritoryPreviewProps {
  bundle: ScenarioBundleData;
  selectedClanId: ClanId | null;
  selectedName: string | null;
  onSelectClan: (clanId: ClanId) => void;
}

export function DaimyoTerritoryPreview({
  bundle,
  selectedClanId,
  selectedName,
  onSelectClan,
}: DaimyoTerritoryPreviewProps): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null);
  const territory = useMemo(() => buildDaimyoTerritoryData(bundle), [bundle]);
  const { grid, districtOwner } = territory;

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const scale = grid.size / WORLD_SIZE;
    context.fillStyle = cssColor(MAPVIEW.colors.sea);
    context.fillRect(0, 0, grid.size, grid.size);
    context.fillStyle = cssColor(MAPVIEW.colors.land);
    for (const polygon of loadOutline().polygons) {
      const points = polygon.points;
      if (points.length < 6) continue;
      context.beginPath();
      context.moveTo((points[0] ?? 0) * scale, (points[1] ?? 0) * scale);
      for (let i = 2; i + 1 < points.length; i += 2)
        context.lineTo((points[i] ?? 0) * scale, (points[i + 1] ?? 0) * scale);
      context.closePath();
      context.fill();
    }
    const raster = document.createElement('canvas');
    raster.width = grid.size;
    raster.height = grid.size;
    raster.getContext('2d')?.putImageData(grid.imageData, 0, 0);
    context.drawImage(raster, 0, 0);

    if (selectedClanId !== null) {
      const outline = context.createImageData(grid.size, grid.size);
      const selected = new Uint8Array(grid.size * grid.size);
      for (let i = 0; i < selected.length; i += 1) {
        const districtIndex = grid.nearestDistrict[i];
        if (districtIndex !== undefined && districtIndex !== 0xffff) {
          const districtId = grid.districtIds[districtIndex];
          if (districtId !== undefined && districtOwner[districtId] === selectedClanId)
            selected[i] = 1;
        }
      }
      const red = (TOKENS_NUM.accentVermilion >> 16) & 255;
      const green = (TOKENS_NUM.accentVermilion >> 8) & 255;
      const blue = TOKENS_NUM.accentVermilion & 255;
      for (let y = 2; y < grid.size - 2; y += 1) {
        for (let x = 2; x < grid.size - 2; x += 1) {
          const i = y * grid.size + x;
          if (
            selected[i] !== 1 ||
            (selected[i - 1] === 1 &&
              selected[i + 1] === 1 &&
              selected[i - grid.size] === 1 &&
              selected[i + grid.size] === 1)
          )
            continue;
          // The atlas is shown at roughly one third of its raster size. A five-cell
          // outline stays visibly separate from the clan hue at that display scale.
          for (let dy = -2; dy <= 2; dy += 1) {
            for (let dx = -2; dx <= 2; dx += 1) {
              const offset = ((y + dy) * grid.size + x + dx) * 4;
              outline.data[offset] = red;
              outline.data[offset + 1] = green;
              outline.data[offset + 2] = blue;
              outline.data[offset + 3] = 255;
            }
          }
        }
      }
      const outlineCanvas = document.createElement('canvas');
      outlineCanvas.width = grid.size;
      outlineCanvas.height = grid.size;
      outlineCanvas.getContext('2d')?.putImageData(outline, 0, 0);
      context.drawImage(outlineCanvas, 0, 0);
    }
  }, [districtOwner, grid, selectedClanId]);

  return (
    <figure className={styles.preview}>
      <figcaption>
        {t('ui.daimyo.mapPreview')}
        <span aria-live="polite">{selectedName ?? t('ui.common.select')}</span>
      </figcaption>
      <canvas
        ref={canvas}
        width={grid.size}
        height={grid.size}
        className={styles.previewCanvas}
        role="img"
        aria-label={t('ui.daimyo.mapHint')}
        onPointerUp={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          const x = Math.floor(((event.clientX - rect.left) / rect.width) * grid.size);
          const y = Math.floor(((event.clientY - rect.top) / rect.height) * grid.size);
          const clanId = clanAtTerritoryCell(territory, x, y);
          if (clanId !== null) onSelectClan(clanId);
        }}
      />
      <p>{t('ui.daimyo.mapHint')}</p>
    </figure>
  );
}
