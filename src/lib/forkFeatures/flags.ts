export const FORK_FEATURE_IDS = ['voiceScore', 'replyLoom', 'fan', 'yearRail'] as const;

export type ForkFeatureId = typeof FORK_FEATURE_IDS[number];

const STORAGE_KEY = 'tweb-fork-features';

export const FORK_FEATURE_DEFAULTS: Record<ForkFeatureId, boolean> = {
  voiceScore: true,
  replyLoom: true,
  fan: true,
  yearRail: true
};

type StoredFlags = Partial<Record<ForkFeatureId, boolean>>;

const listeners = new Set<(id: ForkFeatureId, enabled: boolean) => void>();

function readStored(): StoredFlags {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as StoredFlags;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch(_err) {
    return {};
  }
}

function writeStored(stored: StoredFlags) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

function queryOverride(id: ForkFeatureId): boolean | undefined {
  if(typeof location === 'undefined') {
    return undefined;
  }

  const params = new URLSearchParams(location.search);
  if(!params.has(id)) {
    return undefined;
  }

  const value = params.get(id);
  return value !== '0' && value !== 'false' && value !== 'off';
}

export function isForkFeatureEnabled(id: ForkFeatureId): boolean {
  const fromQuery = queryOverride(id);
  if(fromQuery !== undefined) {
    return fromQuery;
  }

  const stored = readStored()[id];
  return stored === undefined ? FORK_FEATURE_DEFAULTS[id] : stored;
}

export function setForkFeatureEnabled(id: ForkFeatureId, enabled: boolean) {
  const stored = readStored();
  stored[id] = enabled;
  writeStored(stored);
  listeners.forEach((listener) => listener(id, enabled));
}

export function onForkFeatureChange(listener: (id: ForkFeatureId, enabled: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readForkFeatureFlags(): Record<ForkFeatureId, boolean> {
  return {
    voiceScore: isForkFeatureEnabled('voiceScore'),
    replyLoom: isForkFeatureEnabled('replyLoom'),
    fan: isForkFeatureEnabled('fan'),
    yearRail: isForkFeatureEnabled('yearRail')
  };
}
