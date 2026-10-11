import { useMemo, useState, type ReactElement } from 'react';
import { BattleCanvasHost } from '../battle/BattleCanvasHost';
import { createBattleLayoutFixture, type BattleLayoutFixtureKind } from './battleLayoutFixture';
import styles from './BattleLayoutGallery.module.css';

/** DEV presentation fixture. It does not start a session or dispatch gameplay commands. */
export default function BattleLayoutGallery(): ReactElement {
  const [kind, setKind] = useState<BattleLayoutFixtureKind>('dense8');
  const [scale, setScale] = useState(1);
  const [large, setLarge] = useState(false);
  const [selected, setSelected] = useState('bu.layout-01');
  const [action, setAction] = useState({ kind: 'none', id: '' });
  const fixture = useMemo(() => createBattleLayoutFixture(kind), [kind]);
  const record = (actionKind: string, id: string) => {
    if (actionKind === 'select') setSelected(id);
    setAction({ kind: actionKind, id });
  };
  return (
    <main className={styles.root} data-testid="battle-layout-gallery">
      <h1>Tactical map layout fixtures</h1>
      <p>
        Presentation only. These fixtures are not playable game states, saves or command
        simulations.
      </p>
      <fieldset>
        <legend>Fixture</legend>
        {(['dense8', 'full12', 'crossing8'] as const).map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`battle-layout-${option}`}
            aria-pressed={kind === option}
            onClick={() => {
              setKind(option);
              setSelected('bu.layout-01');
              setAction({ kind: 'none', id: '' });
            }}
          >
            {option}
          </button>
        ))}
      </fieldset>
      <fieldset>
        <legend>Scene UI scale</legend>
        {[0.8, 1, 1.5].map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`battle-layout-scale-${option}`}
            aria-pressed={scale === option}
            onClick={() => setScale(option)}
          >
            {option}
          </button>
        ))}
      </fieldset>
      <fieldset>
        <legend>Host dimensions</legend>
        <button
          type="button"
          aria-pressed={!large}
          data-testid="battle-layout-size-min"
          onClick={() => setLarge(false)}
        >
          678 x 444
        </button>
        <button
          type="button"
          aria-pressed={large}
          data-testid="battle-layout-size-large"
          onClick={() => setLarge(true)}
        >
          1024 x 600
        </button>
      </fieldset>
      <output data-testid="battle-layout-selected">{selected}</output>
      <output data-testid="battle-layout-action" data-kind={action.kind} data-id={action.id}>
        {action.kind}: {action.id}
      </output>
      <div className={styles.scroll}>
        <div
          className={styles.frame}
          data-testid="battle-layout-frame"
          style={{ width: large ? 1024 : 678, height: large ? 600 : 444 }}
        >
          <BattleCanvasHost
            battle={fixture}
            playerSide="attacker"
            selectedUnitId={selected}
            uiScale={scale}
            unitName={(id) => id}
            onSelectUnit={(id) => record('select', id)}
            onSelectEnemy={(id) => record('enemy', id)}
            onMoveJin={(id) => record('node', id)}
          />
        </div>
      </div>
    </main>
  );
}
