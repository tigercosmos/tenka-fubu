import { Application, BitmapText, Container, Graphics } from 'pixi.js';
import { TOKENS_NUM } from '../styles/tokens';
import { t } from '@i18n/zh-TW';
import { UI_BATTLE_GEOMETRY as G, type BattleView } from './battleViewModel';
import { UI } from '../uiConstants';

const color = (side: 'attacker' | 'defender' | 'neutral'): number =>
  side === 'attacker'
    ? TOKENS_NUM.accentIndigo
    : side === 'defender'
      ? TOKENS_NUM.accentVermilion
      : TOKENS_NUM.neutralClanless;
const ratio = (value: number, max: number): number =>
  max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
const dpr = (): number => Math.min(UI.uiDprMax, Math.max(1, window.devicePixelRatio || 1));

/** Static tactical scene: host owns resize observation and all accessible interactions. */
export class BattleRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private graphics: Graphics | null = null;
  private labels = new Map<string, BitmapText>();
  private pendingInit: Promise<void> | null = null;
  private view: BattleView | null = null;
  private disposed = false;
  private ready = false;
  private allocated = false;
  private renderCount = 0;

  init(host: HTMLElement): Promise<void> {
    if (this.disposed || this.ready) return Promise.resolve();
    if (this.pendingInit) return this.pendingInit;
    this.pendingInit = this.initialize(host);
    return this.pendingInit;
  }

  private async initialize(host: HTMLElement): Promise<void> {
    const app = new Application();
    this.app = app;
    try {
      await app.init({
        width: 1,
        height: 1,
        resolution: dpr(),
        autoDensity: true,
        antialias: true,
        backgroundAlpha: 0,
        autoStart: false,
        sharedTicker: false,
      });
      this.allocated = true;
      if (this.disposed) {
        app.destroy({ removeView: true }, { children: true });
        this.allocated = false;
        return;
      }
      app.canvas.setAttribute('aria-hidden', 'true');
      app.canvas.style.pointerEvents = 'none';
      app.canvas.style.display = 'block';
      host.appendChild(app.canvas);
      this.root = new Container();
      this.root.label = 'tacticalBattle';
      this.root.eventMode = 'none';
      this.graphics = new Graphics();
      this.root.addChild(this.graphics);
      app.stage.addChild(this.root);
      this.ready = true;
      if (this.view) this.update(this.view);
    } catch (error) {
      if (!this.disposed) this.destroy();
      throw error;
    }
  }

  update(view: BattleView): void {
    if (this.disposed) return;
    this.view = view;
    const app = this.app,
      root = this.root,
      g = this.graphics;
    if (!this.ready || !app || !root || !g || view.width <= 0 || view.height <= 0) return;
    if (
      app.screen.width !== view.width ||
      app.screen.height !== view.height ||
      app.renderer.resolution !== dpr()
    )
      app.renderer.resize(view.width, view.height, dpr());
    const s = view.glyphScale;
    const needed = new Set<string>();
    const label = (key: string, text: string, x: number, y: number): void => {
      needed.add(key);
      let part = this.labels.get(key);
      if (!part) {
        // No stroke/shadow TextStyle: reuse the preloaded font, avoiding per-instance halo atlases.
        part = new BitmapText({
          text,
          style: { fontFamily: 'Noto Serif TC', fontSize: G.labelSize, fill: TOKENS_NUM.ink900 },
        });
        part.anchor.set(0.5);
        root.addChild(part);
        this.labels.set(key, part);
      }
      part.text = text;
      part.scale.set(Math.max(1, s));
      part.position.set(x, y);
    };
    g.clear();
    for (const edge of view.edges) {
      g.moveTo(edge.from.x, edge.from.y)
        .lineTo(edge.to.x, edge.to.y)
        .stroke({ color: TOKENS_NUM.washi100, width: 5 * s });
      g.moveTo(edge.from.x, edge.from.y)
        .lineTo(edge.to.x, edge.to.y)
        .stroke({ color: TOKENS_NUM.ink500, width: 2 * s });
    }
    for (const node of view.nodes) {
      const r = G.nodeRadius * s;
      if (node.isHonjin) {
        g.poly([
          node.x,
          node.y - r * 1.5,
          node.x + r * 1.5,
          node.y,
          node.x,
          node.y + r * 1.5,
          node.x - r * 1.5,
          node.y,
        ])
          .fill(TOKENS_NUM.washi100)
          .stroke({ color: color(node.owner), width: 3 * s });
        g.circle(node.x, node.y, r * 0.6).stroke({ color: TOKENS_NUM.ink900, width: 2 * s });
      } else {
        g.circle(node.x, node.y, r)
          .fill(TOKENS_NUM.washi100)
          .stroke({ color: color(node.owner), width: 3 * s });
      }
      // Node ownership has a shape channel in addition to color.
      if (node.owner === 'attacker') g.circle(node.x, node.y, 3 * s).fill(color(node.owner));
      else if (node.owner === 'defender')
        g.poly([
          node.x,
          node.y - 4 * s,
          node.x + 4 * s,
          node.y + 3 * s,
          node.x - 4 * s,
          node.y + 3 * s,
        ]).fill(color(node.owner));
      const barX = node.x - 16 * s,
        barY = node.y + 22 * s;
      g.rect(barX, barY, 32 * s, 4 * s).fill(TOKENS_NUM.ink100);
      g.rect(barX, barY, 32 * s * ratio(node.flagPower, node.flagPowerMax), 4 * s).fill(
        color(node.owner),
      );
      label(
        `node:${node.id}`,
        `${node.isHonjin ? `${t('ui.battle.honjin')} ` : ''}${Math.max(0, Math.round(node.flagPower))}`,
        node.x,
        node.y + 36 * s,
      );
    }
    for (const unit of view.units) {
      const { x, y } = unit;
      g.moveTo(x, y + G.unitBottom * s)
        .lineTo(unit.anchorX, unit.anchorY)
        .stroke({ color: TOKENS_NUM.ink300, width: s, alpha: 0.4 });
      const c = unit.routed ? TOKENS_NUM.ink300 : color(unit.side);
      if (unit.selected)
        g.circle(x, y, 18 * s).stroke({ color: TOKENS_NUM.accentGold, width: 3 * s });
      g.moveTo(x - 9 * s, y + 10 * s)
        .lineTo(x - 9 * s, y - 18 * s)
        .stroke({ color: TOKENS_NUM.ink900, width: 2 * s });
      const halfFlag = G.flagWidth / 2,
        flagTop = -G.flagHeight + 9;
      g.poly([
        x - halfFlag * s,
        y + flagTop * s,
        x + halfFlag * s,
        y + flagTop * s,
        x + 5 * s,
        y - 5 * s,
        x + halfFlag * s,
        y + 9 * s,
        x - halfFlag * s,
        y + 9 * s,
      ])
        .fill(c)
        .stroke({ color: TOKENS_NUM.ink900, width: 1.5 * s });
      if (unit.side === 'attacker') g.circle(x, y - 4 * s, 3 * s).fill(TOKENS_NUM.washi100);
      else
        g.poly([x, y - 8 * s, x + 4 * s, y - 1 * s, x - 4 * s, y - 1 * s]).fill(
          TOKENS_NUM.washi100,
        );
      if (unit.routed)
        g.moveTo(x - 8 * s, y + 7 * s)
          .lineTo(x + 8 * s, y - 15 * s)
          .stroke({ color: TOKENS_NUM.washi100, width: 3 * s });
      g.roundRect(x - G.unitHalfWidth * s, y + 12 * s, G.unitHalfWidth * 2 * s, 17 * s, 2 * s).fill(
        TOKENS_NUM.washi100,
      );
      label(`unit:${unit.id}`, unit.troops.toLocaleString('en-US'), x, y + 20 * s);
      g.rect(x - 15 * s, y + 31 * s, 30 * s, 3 * s).fill(TOKENS_NUM.ink100);
      g.rect(x - 15 * s, y + 31 * s, 30 * s * ratio(unit.morale, 100), 3 * s).fill(c);
    }
    for (const [key, part] of this.labels) {
      if (needed.has(key)) continue;
      part.parent?.removeChild(part);
      part.destroy({ style: true });
      this.labels.delete(key);
    }
    app.render();
    this.renderCount++;
  }

  getDiagnostics() {
    return {
      ready: this.ready,
      disposed: this.disposed,
      nodes: this.ready ? (this.view?.nodes.length ?? 0) : 0,
      edges: this.ready ? (this.view?.edges.length ?? 0) : 0,
      units: this.ready ? (this.view?.units.length ?? 0) : 0,
      labels: this.labels.size,
      renderCount: this.renderCount,
      resolution: this.app?.renderer?.resolution ?? 0,
      ownedTickerListeners: 0,
      tickerStarted: this.app?.ticker?.started ?? false,
    };
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const part of this.labels.values()) {
      part.parent?.removeChild(part);
      part.destroy({ style: true });
    }
    this.labels.clear();
    if (this.allocated) this.app?.destroy({ removeView: true }, { children: true });
    this.allocated = false;
    // Pending init owns destruction after its asynchronous allocation completes.
    this.ready = false;
    this.app = null;
    this.root = null;
    this.graphics = null;
    this.view = null;
  }
}
