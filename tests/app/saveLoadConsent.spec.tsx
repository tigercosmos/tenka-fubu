import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SaveLoadPanel, type SaveLoadPanelProps } from '../../src/ui/screens/SaveLoadPanel';
import { createSaveStore, type SaveSlotView } from '../../src/app/persistence/saveStore';
import {
  createMemorySaveStorage,
  type SaveStorageAdapter,
} from '../../src/app/persistence/storage';
import { buildSaveFile } from '../../src/core/save/serialize';
import type { SaveMeta } from '../../src/core/save/serialize';
import { SAVE_FORMAT_VERSION } from '../../src/core/save/migrate';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { initializeBridgeSession, resetBridgeForTests } from '../../src/app/bridge';
import { validateState } from '../../src/core/state/invariants';
import { buildTinyState } from '../fixtures/tiny';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { t } from '../../src/i18n/zh-TW';
import { ConfirmDialog } from '../../src/ui/components';
import { SystemMenuHost } from '../../src/ui/screens/SystemMenuHost';
import { CLAN_ALPHA } from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
});
function handler(button: HTMLElement): () => void {
  const key = Object.keys(button).find((k) => k.startsWith('__reactProps$'));
  expect(key).toBeTruthy();
  const props = (button as unknown as Record<string, { onClick?: () => void }>)[key!];
  expect(props?.onClick).toBeTypeOf('function');
  return props!.onClick!;
}
async function settle(callback: () => void): Promise<void> {
  await act(async () => {
    callback();
    await Promise.resolve();
  });
}
function occupied(name: string, day: number): SaveSlotView {
  const meta: SaveMeta = {
    scenarioId: 's1560',
    appVersion: 'test',
    clanId: 'clan.oda',
    clanName: name,
    leaderName: `${name}大名`,
    day,
    castleCount: 3,
    officerCount: 20,
    totalKokudaka: 120000,
    difficulty: 'normal',
    version: SAVE_FORMAT_VERSION,
  };
  return {
    slotId: 'manual:1',
    status: 'ok',
    meta,
    timestamp: 1751808000000 + day * 1000,
    needsMigration: false,
  };
}
function setup(confirming = true, patch: Partial<SaveLoadPanelProps> = {}) {
  const game = buildTinyState();
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  const a = occupied('原甲家', 90),
    b = occupied('後乙家', 120);
  const props: SaveLoadPanelProps = {
    mode: 'load',
    context: 'main',
    slots: [a],
    dirty: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    onLoad: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    onImportLoad: vi.fn(),
    onImportStore: vi.fn(),
    onImportCancel: vi.fn(),
    ...patch,
  };
  const view = render(<SaveLoadPanel {...props} />);
  if (confirming)
    fireEvent.click(
      within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
        name: t('ui.save.action.delete'),
      }),
    );
  const confirm = confirming
    ? handler(
        within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.confirm') }),
      )
    : () => {};
  return { game, a, b, props, view, confirm };
}

it('rejects old delete consent when the same slot ID contains a different save', async () => {
  const { game, b, props, view, confirm } = setup();
  const before = structuredClone(game);
  view.rerender(<SaveLoadPanel {...props} slots={[b]} />);
  await settle(confirm);
  expect(props.onDelete).not.toHaveBeenCalled();
  expect(game).toEqual(before);
  expect(screen.getByText('後乙家 · 後乙家大名').isConnected).toBe(true);
});

it.each(['changed timestamp', 'identical metadata'] as const)(
  'preserves actual replacement slot bytes after old delete consent with %s',
  async (caseName) => {
    const adapter = createMemorySaveStorage();
    const saves = createSaveStore(adapter);
    const game = buildTinyState();
    expect(validateState(game)).toEqual([]);
    const first = buildSaveFile(game, 100);
    expect(await saves.saveToSlot('manual:1', first)).toEqual({ ok: true });
    const props: SaveLoadPanelProps = {
      mode: 'load',
      context: 'main',
      dirty: true,
      slots: await saves.listSlots(),
      onClose: vi.fn(),
      onSave: vi.fn(),
      onLoad: vi.fn(),
      onDelete: async (slot, guard) => {
        expect(await saves.deleteSlot(slot, guard)).toEqual({ ok: true });
      },
      onExport: vi.fn(),
      onImport: vi.fn(),
      onImportLoad: vi.fn(),
      onImportStore: vi.fn(),
      onImportCancel: vi.fn(),
    };
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    store.getState().actions.setScreen('main');
    const view = render(<SaveLoadPanel {...props} />);
    fireEvent.click(
      within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
        name: t('ui.save.action.delete'),
      }),
    );
    const confirm = handler(screen.getByRole('button', { name: t('ui.common.confirm') }));
    const replacement = structuredClone(game);
    replacement.clans[CLAN_ALPHA]!.gold += 1;
    expect(validateState(replacement)).toEqual([]);
    const second = buildSaveFile(replacement, caseName === 'identical metadata' ? 100 : 200);
    if (caseName === 'identical metadata') expect(second.meta).toEqual(first.meta);
    expect(await saves.saveToSlot('manual:1', second)).toEqual({ ok: true });
    const raw = await adapter.get('tf.save.manual:1.blob');
    expect(typeof raw).toBe('string');
    view.rerender(<SaveLoadPanel {...props} slots={await saves.listSlots()} />);
    await settle(confirm);
    expect(await adapter.get('tf.save.manual:1.blob')).toBe(raw);
    const loaded = await saves.loadFromSlot('manual:1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.save.state.clans[CLAN_ALPHA]!.gold).toBe(second.state.clans[CLAN_ALPHA]!.gold);
  },
);

it('keeps the fresh save action usable after a controlled mode change', async () => {
  const { props, view, game } = setup(false);
  const before = structuredClone(game);
  view.rerender(<SaveLoadPanel {...props} mode="save" />);
  fireEvent.click(
    within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
      name: t('ui.save.action.save'),
    }),
  );
  await settle(() =>
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: t('ui.common.confirm'),
      }),
    ),
  );
  expect(props.onSave).toHaveBeenCalledTimes(1);
  expect(props.onLoad).not.toHaveBeenCalled();
  expect(game).toEqual(before);
});

it.each(['unmount', 'game', 'mode', 'context', 'cancel'] as const)(
  'rejects retained delete confirmation after %s',
  async (change) => {
    const { game, props, view, confirm } = setup();
    act(() => {
      if (change === 'unmount') view.unmount();
      if (change === 'game') {
        const replacement = structuredClone(game);
        setGame(replacement);
        initializeBridgeSession(replacement, [], { loaded: true });
      }
      if (change === 'mode') view.rerender(<SaveLoadPanel {...props} mode="save" />);
      if (change === 'context') view.rerender(<SaveLoadPanel {...props} context="title" />);
      if (change === 'cancel')
        fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    });
    const current = store.getState().game;
    const before = structuredClone(current);
    await settle(confirm);
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(store.getState().game).toBe(current);
    expect(current).toEqual(before);
  },
);

it('does not submit or cancel old consent below an unrelated native dialog', async () => {
  const { props, confirm } = setup();
  const cancel = handler(screen.getByRole('button', { name: t('ui.common.cancel') }));
  const owned = screen.getByRole('dialog');
  render(
    <ConfirmDialog open title="Other" message="Other" onCancel={() => {}} onConfirm={() => {}} />,
  );
  await settle(() => {
    confirm();
    cancel();
  });
  expect(props.onDelete).not.toHaveBeenCalled();
  expect(owned.isConnected).toBe(true);
});

it('preserves consent for an equivalent refreshed slot and consumes it exactly once', async () => {
  const { game, a, props, view, confirm } = setup();
  const before = structuredClone(game);
  view.rerender(<SaveLoadPanel {...props} slots={[structuredClone(a)]} />);
  await settle(() => {
    confirm();
    confirm();
  });
  expect(props.onDelete).toHaveBeenCalledTimes(1);
  expect(vi.mocked(props.onDelete).mock.calls[0]?.[0]).toBe('manual:1');
  expect(game).toEqual(before);
});

it('cannot revive canceled deletion by opening a new consent for the same slot', async () => {
  const { props, confirm } = setup();
  fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
  fireEvent.click(
    within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
      name: t('ui.save.action.delete'),
    }),
  );
  const fresh = screen.getByRole('dialog');
  await settle(confirm);
  expect(props.onDelete).not.toHaveBeenCalled();
  expect(fresh.isConnected).toBe(true);
});

it.each(['save', 'load', 'export', 'back'] as const)(
  'rejects retained direct %s control after unmount',
  async (kind) => {
    const { props, view } = setup(false, { mode: kind === 'save' ? 'save' : 'load', dirty: false });
    const key =
      kind === 'save'
        ? 'ui.save.action.save'
        : kind === 'load'
          ? 'ui.save.action.load'
          : kind === 'export'
            ? 'ui.save.action.export'
            : 'ui.common.back';
    const scope = kind === 'back' ? screen : within(screen.getByTestId('save-slot-manual:1'));
    const invoke = handler(scope.getByRole('button', { name: t(key) }));
    view.unmount();
    await settle(invoke);
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onLoad).not.toHaveBeenCalled();
    expect(props.onExport).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  },
);

it.each(['save', 'load'] as const)(
  'does not apply retained %s consent to changed slot contents',
  async (kind) => {
    const { props, view, b } = setup(false, { mode: kind, dirty: true });
    fireEvent.click(
      within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
        name: t(kind === 'save' ? 'ui.save.action.save' : 'ui.save.action.load'),
      }),
    );
    const confirm = handler(screen.getByRole('button', { name: t('ui.common.confirm') }));
    view.rerender(<SaveLoadPanel {...props} slots={[b]} />);
    await settle(confirm);
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onLoad).not.toHaveBeenCalled();
  },
);

it.each(['load', 'store'] as const)(
  'rejects retained import-%s consent after preview identity replacement',
  async (kind) => {
    const preview = {
      identity: {},
      meta: occupied('匯入甲', 90).meta!,
      timestamp: 1000,
      migratedFrom: null,
    };
    const { props, view } = setup(false, { importPreview: preview });
    fireEvent.click(
      screen.getByRole('button', {
        name: t(kind === 'load' ? 'ui.save.importLoad' : 'ui.save.importStore'),
      }),
    );
    const confirm = handler(screen.getByRole('button', { name: t('ui.common.confirm') }));
    view.rerender(
      <SaveLoadPanel
        {...props}
        importPreview={{ ...preview, identity: {}, meta: { ...preview.meta, clanName: '匯入乙' } }}
      />,
    );
    await settle(confirm);
    expect(props.onImportLoad).not.toHaveBeenCalled();
    expect(props.onImportStore).not.toHaveBeenCalled();
  },
);

it('requires explicit confirmation to delete a corrupt slot', async () => {
  const corrupt: SaveSlotView = {
    slotId: 'manual:1',
    status: 'corrupt',
    meta: null,
    timestamp: null,
    needsMigration: false,
  };
  const { props } = setup(false, { slots: [corrupt] });
  fireEvent.click(
    within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
      name: t('ui.save.action.delete'),
    }),
  );
  expect(props.onDelete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
  expect(props.onDelete).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
      name: t('ui.save.action.delete'),
    }),
  );
  await settle(() => {
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
  });
  expect(props.onDelete).toHaveBeenCalledTimes(1);
});

it.each(['timestamp', 'metadata', 'status'] as const)(
  'rejects consent after an in-place slot %s change',
  async (field) => {
    const { a, props, confirm } = setup();
    // Defensive controlled-view mutation, not a claim of a normal storage write.
    if (field === 'timestamp') a.timestamp = (a.timestamp ?? 0) + 1;
    if (field === 'metadata') a.meta!.clanName = '新內容';
    if (field === 'status') a.status = 'corrupt';
    await settle(confirm);
    expect(props.onDelete).not.toHaveBeenCalled();
  },
);

function hosted(context: 'main' | 'title' = 'main') {
  const { game, props, view } = setup(false, { context });
  view.unmount();
  if (context === 'title') {
    setGame(null);
    store.getState().actions.setScreen('title');
  }
  const modal = { id: 'systemMenu' as const, params: {}, pausesTime: false };
  uiStore.getState().actions.enqueueModal(modal);
  const onBack = vi.fn();
  const hostedView = render(
    <SystemMenuHost
      systemPanel={{ title: 'Save slots', content: <SaveLoadPanel {...props} />, onBack }}
    />,
  );
  return { game, props, modal, onBack, view: hostedView };
}

it.each(['main', 'title'] as const)(
  'leases one parent native dialog for %s delete consent without a FIFO child',
  (context) => {
    const { props, modal } = hosted(context);
    const required = { id: 'monthSummary' as const, params: {}, pausesTime: true };
    fireEvent.click(
      within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
        name: t('ui.save.action.delete'),
      }),
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(uiStore.getState().modal).toBe(modal);
    expect(uiStore.getState().modalQueue).toEqual([]);
    act(() => uiStore.getState().actions.enqueueModal(required));
    expect(uiStore.getState().modalQueue).toEqual([required]);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(uiStore.getState().modal).toBe(modal);
    expect(uiStore.getState().modalQueue).toEqual([required]);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  },
);

it('successful parent-owned deletion does not close the parent or its waiting required owner', async () => {
  const { props, modal, game } = hosted();
  const before = structuredClone(game);
  fireEvent.click(
    within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
      name: t('ui.save.action.delete'),
    }),
  );
  const required = { id: 'monthSummary' as const, params: {}, pausesTime: true };
  act(() => uiStore.getState().actions.enqueueModal(required));
  await settle(() => fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') })));
  expect(props.onDelete).toHaveBeenCalledTimes(1);
  expect(uiStore.getState().modal).toBe(modal);
  expect(uiStore.getState().modalQueue).toEqual([required]);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(game).toEqual(before);
  expect(store.getState().session.lastPauseReason).toBe('user');
});

it('retained parent-owned consent cannot act after replacing the exact parent descriptor', async () => {
  const { props } = hosted();
  fireEvent.click(
    within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
      name: t('ui.save.action.delete'),
    }),
  );
  const confirm = handler(screen.getByRole('button', { name: t('ui.common.confirm') }));
  const replacement = { id: 'systemMenu' as const, params: {}, pausesTime: false };
  act(() => {
    uiStore.getState().actions.closeModal();
    uiStore.getState().actions.enqueueModal(replacement);
  });
  await settle(confirm);
  expect(props.onDelete).not.toHaveBeenCalled();
  expect(uiStore.getState().modal).toBe(replacement);
});

it.each(['save', 'load', 'delete'] as const)(
  'revokes actual delayed %s admission when its original panel unmounts',
  async (kind) => {
    const base = createMemorySaveStorage();
    let armed = false;
    let release = () => {};
    let observed = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      observed = resolve;
    });
    const adapter: SaveStorageAdapter = {
      ...base,
      async get(key) {
        const value = await base.get(key);
        if (armed && key === 'tf.save.manual:1.blob') {
          armed = false;
          observed();
          await gate;
        }
        return value;
      },
    };
    const saves = createSaveStore(adapter);
    const game = buildTinyState();
    expect(validateState(game)).toEqual([]);
    expect(await saves.saveToSlot('manual:1', buildSaveFile(game, 100))).toEqual({ ok: true });
    const raw = await base.get('tf.save.manual:1.blob');
    const replacement = structuredClone(game);
    replacement.clans[CLAN_ALPHA]!.gold += 20;
    const next = buildSaveFile(replacement, 200);
    let outcome: { ok: boolean; error?: string } | null = null;
    const operation: SaveLoadPanelProps['onDelete'] = async (slot, guard) => {
      if (kind === 'load') {
        const result = await saves.loadFromSlot(slot, guard);
        outcome = result;
        if (result.ok) setGame(result.save.state);
        return;
      }
      outcome =
        kind === 'save'
          ? await saves.saveToSlot(slot, next, guard)
          : await saves.deleteSlot(slot, guard);
    };
    const { props, view } = setup(false, {
      mode: kind === 'save' ? 'save' : 'load',
      slots: await saves.listSlots(),
      onSave: operation,
      onLoad: operation,
      onDelete: operation,
    });
    const live = store.getState().game;
    const before = structuredClone(live);
    const key =
      kind === 'save'
        ? 'ui.save.action.save'
        : kind === 'load'
          ? 'ui.save.action.load'
          : 'ui.save.action.delete';
    fireEvent.click(
      within(screen.getByTestId('save-slot-manual:1')).getByRole('button', { name: t(key) }),
    );
    armed = true;
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
    await started;
    view.unmount();
    await settle(release);
    expect(outcome).toEqual({ ok: false, error: 'slot-changed' });
    expect(await base.get('tf.save.manual:1.blob')).toBe(raw);
    expect(store.getState().game).toBe(live);
    expect(live).toEqual(before);
    expect(props.slots.find((slot) => slot.slotId === 'manual:1')?.status).toBe('ok');
  },
);
