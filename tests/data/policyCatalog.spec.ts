import { describe, expect, it } from 'vitest';
import manifest from '../../src/data/scenarios/s1560/policies.json';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { zPoliciesFile, zScenario } from '../../src/data/schemas';
import { POLICY_DEFS } from '../../src/core/policies';
import { validateEnactPolicy, applyEnactPolicy } from '../../src/core/commands/domesticCommands';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';

describe('M8 policy manifest contract (05 §3.7.1–3.7.2)', () => {
  it('contains exactly the twelve canonical policies with matching prestige, first-month upkeep and exclusions', () => {
    const policies = zPoliciesFile.parse(manifest).policies;
    expect(policies).toHaveLength(12);
    expect(policies.map((policy) => policy.id)).toEqual(POLICY_DEFS.map((policy) => policy.id));
    for (const [index, definition] of POLICY_DEFS.entries()) {
      expect(policies[index]).toMatchObject({
        prestigeReq: definition.unlockPrestige,
        costGold: definition.upkeepGold,
        exclusiveWith: definition.exclusiveWith === null ? [] : [definition.exclusiveWith],
      });
    }
  });
  it('rejects both incomplete and obsolete thirteen-entry manifests', () => {
    const policies = zPoliciesFile.parse(manifest).policies;
    expect(zPoliciesFile.safeParse({ version: 1, policies: policies.slice(1) }).success).toBe(
      false,
    );
    const obsolete = [...policies, { ...policies[0]!, id: 'pol.extra' }]; // policy-count-negative-probe
    expect(obsolete).toHaveLength(13); // policy-count-negative-probe
    expect(zPoliciesFile.safeParse({ version: 1, policies: obsolete }).success).toBe(false);
  });
  it('loads the manifest into a complete aggregate schema without inventing missing events', async () => {
    const bundle = await loadS1560Scenario();
    expect(zScenario.safeParse(bundle).success).toBe(true);
    expect(bundle.catalogs.policies).toEqual(zPoliciesFile.parse(manifest).policies);
    expect(bundle.events).toEqual([]);
  });
  it('manifest costGold equals the actual first-month fee, not an additional adoption fee', () => {
    const state = buildTinyState(),
      definition = POLICY_DEFS[0];
    state.clans[CLAN_ALPHA]!.prestige = definition.unlockPrestige;
    const command = { type: 'enactPolicy' as const, clanId: CLAN_ALPHA, policyId: definition.id };
    state.clans[CLAN_ALPHA]!.gold = manifest.policies[0]!.costGold - 1;
    expect(validateEnactPolicy(state, command).ok).toBe(false);
    state.clans[CLAN_ALPHA]!.gold += 1;
    expect(validateEnactPolicy(state, command).ok).toBe(true);
    applyEnactPolicy(state, command, () => {});
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(0);
  });
});
