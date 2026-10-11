import { buildTinyState, OFF_BETA_TAISHO } from '../fixtures/tiny';

/** Controlled legal poaching target; plot creation still requires the real command. */
export function preparePoachAdmission() {
  const game = buildTinyState();
  const target = game.officers[OFF_BETA_TAISHO]!;
  target.loyalty = 10;
  target.kinship = 'tozama';
  target.traits = [];
  return game;
}
