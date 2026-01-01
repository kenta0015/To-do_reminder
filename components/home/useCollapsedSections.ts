// FILE: components/home/useCollapsedSections.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CollapsedState = {
  late: boolean;
  today: boolean;
  tomorrow: boolean;
  thisWeek: boolean;
};

export type CollapsedSectionKey = keyof CollapsedState;

const STORAGE_KEY = '@home_collapsed_sections_v1';

const DEFAULT_STATE: CollapsedState = {
  late: false,
  today: false,
  tomorrow: false,
  thisWeek: false,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function normalizeCollapsedState(v: unknown): CollapsedState | null {
  if (!isRecord(v)) return null;

  const getBool = (key: CollapsedSectionKey): boolean | null => {
    const x = v[key];
    if (typeof x === 'boolean') return x;
    return null;
  };

  const late = getBool('late');
  const today = getBool('today');
  const tomorrow = getBool('tomorrow');
  const thisWeek = getBool('thisWeek');

  if (late === null || today === null || tomorrow === null || thisWeek === null) return null;

  return { late, today, tomorrow, thisWeek };
}

async function safeReadCollapsedState(storageKey: string): Promise<CollapsedState> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return DEFAULT_STATE;

    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeCollapsedState(parsed);
    if (!normalized) return DEFAULT_STATE;

    return normalized;
  } catch {
    return DEFAULT_STATE;
  }
}

async function safeWriteCollapsedState(storageKey: string, state: CollapsedState): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function useCollapsedSections(opts?: {
  storageKey?: string;
  initialState?: CollapsedState;
}): {
  collapsed: CollapsedState;
  toggle: (key: CollapsedSectionKey) => void;
  expand: (key: CollapsedSectionKey) => void;
  collapse: (key: CollapsedSectionKey) => void;
  hydrate: () => Promise<void>;
  isHydrated: boolean;
} {
  const storageKey = opts?.storageKey ?? STORAGE_KEY;
  const initial = opts?.initialState ?? DEFAULT_STATE;

  const [collapsed, setCollapsed] = useState<CollapsedState>(initial);
  const [isHydrated, setIsHydrated] = useState(false);

  const hydrateInFlightRef = useRef<Promise<void> | null>(null);

  const persist = useCallback(
    async (next: CollapsedState): Promise<void> => {
      await safeWriteCollapsedState(storageKey, next);
    },
    [storageKey]
  );

  const hydrate = useCallback(async (): Promise<void> => {
    if (hydrateInFlightRef.current) return hydrateInFlightRef.current;

    const p = (async () => {
      const next = await safeReadCollapsedState(storageKey);
      setCollapsed(next);

      // If storage is missing/corrupt, write a clean value once to stabilize future loads.
      await safeWriteCollapsedState(storageKey, next);

      setIsHydrated(true);
    })();

    hydrateInFlightRef.current = p;

    try {
      await p;
    } finally {
      hydrateInFlightRef.current = null;
    }
  }, [storageKey]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const toggle = useCallback(
    (key: CollapsedSectionKey) => {
      setCollapsed((prev) => {
        const next: CollapsedState = { ...prev, [key]: !prev[key] };
        void persist(next);
        return next;
      });
    },
    [persist]
  );

  const expand = useCallback(
    (key: CollapsedSectionKey) => {
      setCollapsed((prev) => {
        if (!prev[key]) return prev;
        const next: CollapsedState = { ...prev, [key]: false };
        void persist(next);
        return next;
      });
    },
    [persist]
  );

  const collapse = useCallback(
    (key: CollapsedSectionKey) => {
      setCollapsed((prev) => {
        if (prev[key]) return prev;
        const next: CollapsedState = { ...prev, [key]: true };
        void persist(next);
        return next;
      });
    },
    [persist]
  );

  return {
    collapsed,
    toggle,
    expand,
    collapse,
    hydrate,
    isHydrated,
  };
}
