import { createSettingsStore } from './store';

/** Browser-session preferences; application boot owns effects, not this storage singleton. */
export const settingsStore = createSettingsStore();
