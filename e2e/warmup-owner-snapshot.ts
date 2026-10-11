export type WarmupOwnerSnapshot = {
  dialogs: number;
  owners: readonly string[];
  unknownDialogs: number;
};

export async function clickInDocumentWarmup(
  click: (options: { timeout: number; noWaitAfter?: boolean }) => Promise<void>,
  readSnapshot: () => Promise<WarmupOwnerSnapshot>,
): Promise<'clicked' | 'retry'> {
  try {
    await click({ timeout: 750, noWaitAfter: true });
    return 'clicked';
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'TimeoutError' &&
      classifyLateWarmupOwner(await readSnapshot()) === 'retry'
    )
      return 'retry';
    throw error;
  }
}

export function classifyLateWarmupOwner(snapshot: WarmupOwnerSnapshot): 'none' | 'retry' {
  const { dialogs, owners, unknownDialogs } = snapshot;
  if (dialogs === 0 && owners.length === 0 && unknownDialogs === 0) return 'none';
  // Retry observation only; no owner is bypassed, dismissed or counted as handled.
  if (
    dialogs === 1 &&
    unknownDialogs === 0 &&
    owners.length === 1 &&
    ['month-summary', 'proposal-inbox', 'envoy-modal', 'event-modal'].includes(owners[0]!)
  )
    return 'retry';
  throw new Error('Unknown or simultaneous warmup modal owner');
}
