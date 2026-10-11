import type { EventEngine } from '../../core/systems/events/engine';
import { createRuntimeEventEngine } from '../../core/systems/events/runtime';
import { S1560_SCENARIO_ID } from '../../data/scenarios/s1560/meta';

export async function loadScenarioEventEngine(scenarioId: string): Promise<EventEngine> {
  if (scenarioId === 'tiny' || scenarioId === 'debug-visual-map-01') {
    return createRuntimeEventEngine([]);
  }
  if (scenarioId !== S1560_SCENARIO_ID) {
    throw new Error(`Unsupported event scenario: ${scenarioId}`);
  }
  const scenario = await import('../../data/scenarios/s1560/index');
  return createRuntimeEventEngine(scenario.loadS1560EventCatalog());
}
