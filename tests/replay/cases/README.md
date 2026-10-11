Every fixed core bug must add or update a non-truncated `.tfulog.json` replay case that reproduces it.

A replay proves its recorded command trace through core ticks.
It does not by itself prove that the production driver executes generated AI orders.

## Corps treasury reclaim

`m6-corps-reclaim-wallet.tfulog.json` starts from the unchanged mini scenario with seed 42.
Its three legal commands create a corps, reclaim one castle, and dissolve the remaining corps.
Normal monthly ticks supply both treasury balances; the case contains no injected prerequisites.

`../corpsReclaimWallet.spec.ts` checks exact recording, repeated replay, native pending-command continuation, and changed-command detection.
The reclaim refunds the full wallet and clears it before new income arrives.
The dissolution refunds that new income once.
The mini's ruling lord retains loyalty 100; this case does not prove nonruling dismissal penalties.

This new case does not replace the two older frozen cases or claim complete replay coverage for every previous fix.

## Paid diplomacy trust completion

`m6-diplomacy-trust-merit.tfulog.json` starts from the unchanged mini scenario with seed 42.
Two legal commands start and stop ordinary diplomacy work.
Twenty-two paid months reach the directed trust cap; one further paid month awards no duplicate merit.
The 691-tick journey contains no injected resources, ages, traits, pacts, or mission state.

`../diplomacyTrustMerit.spec.ts` checks exact recording, repeatability, real payments, daily invariants, and legal changed-command detection.
Native continuation reconstructs pending START and STOP queues and restores actual ongoing work after the trust-cap crossing.
The final persistent state, events, and random streams match; only transient AI intent records fall outside native persistence.
This case proves trust-cap work completion, not executor attribution for agreement settlement.

## Physical transport interception after conquest

`m6-transport-physical-occupancy.tfulog.json` starts from the unchanged mini scenario with seed 42.
Its 70 ticks retain 24 accepted commands, including normally generated AI orders with their actual clan authority.
Ordinary marches, combat, encirclement and castle capture earn B2 before cargo enters the new friendly route.
No initial roads, resources, traits or ages change.

`../transportPhysicalOccupancy.spec.ts` checks the actual departing army and arriving cargo, repeated recording, and daily invariants.
Native continuation restores genuine pending player cargo and the ongoing enemy road leg.
The enemy recall remains a recorded clan command, not a forged pending player command.
Earlier legal cargo reaches the same node before the enemy leaves; the control confirms real looting and a different final hash.

This case supplies permanent unchanged-scenario evidence for the transport node-occupancy correction.
It does not prove the full production campaign, browser interaction or national AI acceptance.

## Maximum carried food after transport looting

`m6-transport-loot-carry-cap.tfulog.json` starts from the unchanged mini scenario with seed 42.
Ordinary combat earns B2 before legal cargo reaches the physically present enemy army.
The army carries 306 food for 237 soldiers, above the default provisioning target but below the maximum capacity.
The full 100-food cargo fits; normal daily consumption leaves 401 food.

`../transportLootCarryCap.spec.ts` checks exact recording, repeatability, daily invariants, native continuation and a legal arrival-date change.
Native continuation restores actual pending player cargo and the ongoing siege with genuine persistent AI orders.
Explicit clan-authorized march and recall commands remain recorded commands; they do not pretend to be generated AI orders or pending player commands.
This case proves acceptance above the provisioning target; the focused core tests separately prove integer overflow at maximum capacity.

## Monthly reward accounting boundary

`m6-reward-month-boundary.tfulog.json` starts from the unchanged mini scenario with seed 42.
Three accepted small gifts cross the actual month opening: the recorded monthly counter moves from 50 to zero to 50.
The annual gift count remains three, and an independent no-gift journey confirms the full 150-gold payment despite normal monthly income and salaries.

`../rewardMonthBoundary.spec.ts` checks repeated recording, daily invariants and exact replay.
This player-command core trace preserves generated AI orders as pending; it does not execute them through the production driver.
Native continuation rebuilds genuinely pending gifts on both sides of the boundary and preserves persistent state, events and random streams.
A legally applied timing change moves the third gift into the old month.
Payment and annual count remain unchanged, but the final monthly counter becomes zero.

## Monthly reward boundary with AI execution

`m6-reward-month-boundary-ai.tfulog.json` is a separate unchanged-mini trace with seed 42.
It retains three player gifts and eight naturally generated Beta commands with their actual clan authority.
The core journey transfers generated AI orders before each daily queue drain, in the same order as the production bridge.
The monthly counter moves from 50 to zero to 50; a no-gift twin confirms the full 150-gold debit.

`../rewardMonthBoundaryAi.spec.ts` checks repeated recording, complete replay, daily invariants and legal timing tampering.
Native checkpoints restore seven genuine pending AI orders and the pending player gifts on both sides of the boundary.
Persistent state, events and random streams match; only transient AI intent diagnostics fall outside native persistence.

`../../app/rewardMonthlyAiBridge.spec.ts` also executes the player gifts through actual `runOneDay` calls.
The production bridge generates and applies the AI commands without manual AI injection.
Its complete exported command log and final state hash match the new trace exactly.
This test does not mount Main or verify native browser rendering.

The earlier player-only reward case remains separate; this trace does not replace its expected results.

## Unpaid salaries and later recovery

`m6-payroll-unpaid-recovery.tfulog.json` starts from the unchanged mini scenario with seed 42.
Sixty normal ticks apply legal player orders and naturally generated AI orders with their actual authority.
Five large gifts exhaust the available funds before the next monthly salary payment.
The unpaid event names three ordinary payees, excluding the ruler; normal monthly loyalty drift precedes the two-point unpaid penalty.

The actual corps earns 97 gold before dissolution.
The legal dissolution refunds that wallet once; the following month pays salaries normally without an immediate loyalty repair.
A paid twin changes only the fifth gift size and preserves pre-boundary loyalty for the penalty comparison.

`../payrollUnpaidRecovery.spec.ts` checks complete recording, replay, daily invariants, actual payees, real refund, and legal timing tampering.
Native checkpoints preserve genuine pending AI orders, player gifts, the dissolution command, and the earned wallet.
Persistent state, events and random streams match; the native codec omits only transient AI intent diagnostics.

`../../app/payrollRecoveryBridge.spec.ts` also executes the actual production driver with player orders only.
The bridge generates its own AI orders; its complete exported log and final hash match the trace.
This case proves ordinary unpaid-payment recovery, not a permanent unchanged-scenario successor-payroll journey or native browser interaction.

## Earned successor corps eligibility

`m6-successor-corps-eligibility.tfulog.json` starts from the unchanged mini scenario with seed 42.
The complete recording retains 58 ticks and 20 accepted commands, including naturally generated AI orders.
Beta earns succession on day 143; its genuine pending construction settles on day 144.
An explicit trusted Beta order creates a corps on day 145 with the current ruler, `OFF_BETA_TAISHO_B`.
His stored `samurai-taisho` rank remains unchanged; an ordinary officer with that rank remains ineligible.

`../successorCorpsEligibility.spec.ts` checks complete recording, replay, daily invariants and rejected commander tampering.
Separate legal tampering changes only `hold` to `develop`; all commands remain accepted, but the actual directive and final hash differ.
Native checkpoints preserve two pending marches at tick 1 and the actual pending AI construction at tick 54.
Persistent state, events, random streams and the complete log match; the native codec omits only transient AI intent diagnostics.
The final hash is `9a94131bc3f94822`.

This trace does not prove natural AI commander selection, an Alpha player interface journey, or unchanged-scenario successor payroll.

## Monthly delegated castle administration

`m6-castle-delegation-cycle.tfulog.json` uses unchanged mini seed 42 over 61 ticks.
Its 16 accepted entries contain two player orders, four actual castle-authority orders, and ten naturally generated clan orders.
Delegation generates conscription, construction and development orders at the monthly boundary; normal queue draining accepts all four.
The subsequent player restoration prevents further delegated orders for that castle at the next boundary.

`../castleDelegationCycle.spec.ts` checks repeated recording, full replay, daily invariants and legal earlier restoration.
Native checkpoints preserve initial delegation, seven pending clan orders, four pending castle orders and the queued restoration.
Persistent state, events and random streams match; only transient AI intent diagnostics fall outside native persistence.
The final hash is `5edcb8d9f97f95b4`.

`../../app/castleDelegationDriver.spec.ts` also executes actual `runOneDay` calls and matches the complete exported trace.
Loaded continuation preserves the full persistent result; its export honestly remains truncated rather than replacing the original full oracle.
This journey does not prove native browser geometry or indefinite delegated administration.

## Earned successor salaries and recovery

`m6-earned-successor-payroll-recovery.tfulog.json` uses unchanged mini seed 42 over 120 ticks, with 24 accepted commands.
Normal gameplay earns succession on day 143.
Corps creation, three gifts and dissolution are explicit trusted Beta-clan inputs, not spontaneous AI selections or Alpha player actions.
All naturally generated AI orders remain intact and execute through the normal daily queue.

Day 150 still pays salaries; day 180 produces the actual unpaid event for the two ordinary payees.
Normal monthly drift precedes each two-point unpaid penalty; the current ruler remains exempt, loyal at 100 and unchanged in stored rank.
Dissolution refunds the actual 52-gold wallet; day 210 pays normally without immediate repair of the past loyalty loss.

`../earnedSuccessorPayrollRecovery.spec.ts` checks complete recording, full replay, daily invariants and legal earlier dissolution that prevents unpaid salaries.
Native checkpoints preserve genuine pending player marches and natural AI construction, plus settled resource states before and after unpaid salaries.
Manual Beta inputs never enter saved player or AI pending queues; these tests do not claim pending persistence for those inputs.
Persistent state, events and random streams match, apart from the codec's existing omission of transient AI intent diagnostics.
The final hash is `96e23560c17f9801`.

This trace does not prove a production bridge or native Alpha-player successor-payroll journey.

## Rakuichi income ownership

`m6-rakuichi-income-ownership.tfulog.json` uses unchanged mini seed 42 over 31 ticks.
Its thirteen accepted commands contain three player orders and ten naturally generated AI orders.
Normal marches give Alpha district `dist.b2x` on day 97; castle `castle.b2` remains Beta-owned.
The day 120 settlement gives Alpha 188 income; the earlier castle-policy calculation gives 181.
The final hash is `f448ba666e2dd981`.

`../rakuichiIncomeOwnership.spec.ts` checks complete replay, daily invariants and independent income calculations.
Native checkpoints preserve real pending orders and settled resources; the codec omits only transient AI intent diagnostics.
A legal policy-revocation twin also removes daily commerce growth, so its resources are not an identical comparison.

`../../app/rakuichiIncomeDriver.spec.ts` executes actual `runOneDay` calls with player orders only.
The driver generates its own AI orders; its full exported log matches the trace.
The monthly observer receives the actual income and gold settlement.
Loaded continuation preserves the persistent result but exports an honestly truncated recording.
The trace stops on day 121; an exploratory continuation loses the district on day 123.
This case does not prove permanent conquest or native browser interaction.
