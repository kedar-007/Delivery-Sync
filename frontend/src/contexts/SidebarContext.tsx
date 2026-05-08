import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SidebarItemPref {
  key: string;
  visible: boolean;
  order: number;
}

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggleCollapsed: () => void;
  items: SidebarItemPref[];
  toggleItem: (key: string) => void;
  moveItem: (key: string, dir: 'up' | 'down') => void;
  reorderItems: (activeKey: string, overKey: string) => void;
  resetItems: () => void;
}

// ─── Defaults (matches NAV_ITEMS order in Sidebar.tsx) ───────────────────────

const DEFAULT_ITEMS: SidebarItemPref[] = [
  { key: 'Dashboard',      visible: true, order: 0 },
  { key: 'Projects',       visible: true, order: 1 },
  { key: 'Daily Work',     visible: true, order: 2 },
  { key: 'People',         visible: true, order: 3 },
  { key: 'Assets',         visible: true, order: 4 },
  { key: 'Reports & AI',   visible: true, order: 5 },
  { key: 'Executive',      visible: true, order: 6 },
  { key: 'Administration', visible: true, order: 7 },
  { key: 'Bug Reports',    visible: true, order: 8 },
  { key: 'Help & Docs',    visible: true, order: 9 },
];

interface StoredSidebar {
  collapsed?: boolean;
  items?: SidebarItemPref[];
}

const STORAGE_KEY = 'ds_sidebar_prefs';

const readStored = (): StoredSidebar => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
};

const writeStored = (patch: Partial<StoredSidebar>) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStored(), ...patch }));

// ─── Context ──────────────────────────────────────────────────────────────────

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const useSidebar = (): SidebarContextValue => {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be inside <SidebarProvider>');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const SidebarProvider = ({ children }: { children: ReactNode }) => {
  const [collapsed, setCollapsedState] = useState(false);
  const [items, setItemsState] = useState<SidebarItemPref[]>(DEFAULT_ITEMS);

  useEffect(() => {
    const stored = readStored();
    if (stored.collapsed !== undefined) setCollapsedState(stored.collapsed);
    if (stored.items?.length) {
      // Merge stored prefs with defaults (handles new items added to the app)
      const merged = DEFAULT_ITEMS.map((def) => {
        const saved = stored.items!.find((i) => i.key === def.key);
        return saved ? { ...def, ...saved } : def;
      });
      merged.sort((a, b) => a.order - b.order);
      setItemsState(merged);
    }
  }, []);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    writeStored({ collapsed: v });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      writeStored({ collapsed: !prev });
      return !prev;
    });
  }, []);

  const toggleItem = useCallback((key: string) => {
    setItemsState((prev) => {
      const updated = prev.map((i) => (i.key === key ? { ...i, visible: !i.visible } : i));
      writeStored({ items: updated });
      return updated;
    });
  }, []);

  const moveItem = useCallback((key: string, dir: 'up' | 'down') => {
    setItemsState((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((i) => i.key === key);
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev;

      const updated = sorted.map((item, i) => {
        if (i === idx)     return { ...item, order: sorted[swapIdx].order };
        if (i === swapIdx) return { ...item, order: sorted[idx].order };
        return item;
      });
      writeStored({ items: updated });
      return updated;
    });
  }, []);

  const reorderItems = useCallback((activeKey: string, overKey: string) => {
    setItemsState((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const fromIdx = sorted.findIndex((i) => i.key === activeKey);
      const toIdx   = sorted.findIndex((i) => i.key === overKey);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const next = [...sorted];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      const updated = next.map((i, idx) => ({ ...i, order: idx }));
      writeStored({ items: updated });
      return updated;
    });
  }, []);

  const resetItems = useCallback(() => {
    setItemsState(DEFAULT_ITEMS);
    writeStored({ items: DEFAULT_ITEMS });
  }, []);

  return (
    <SidebarContext.Provider value={{
      collapsed, setCollapsed, toggleCollapsed,
      items, toggleItem, moveItem, reorderItems, resetItems,
    }}>
      {children}
    </SidebarContext.Provider>
  );
};
