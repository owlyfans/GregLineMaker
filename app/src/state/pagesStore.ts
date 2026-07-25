import { create } from "zustand";
import { useChainStore } from "./chainStore";
import { deletePageStorage, loadLegacyAutosave, loadPage, savePage } from "./persistence";

const META_KEY = "greglinemaker.pages-meta.v1";

export interface PageMeta {
  id: string;
  name: string;
}

interface PagesMetaFile {
  pages: PageMeta[];
  activePageId: string;
}

let idCounter = 0;
function newPageId(): string {
  idCounter += 1;
  return `page-${Date.now().toString(36)}-${idCounter}`;
}

function loadMeta(): PagesMetaFile | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.pages) || typeof parsed.activePageId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveMeta(meta: PagesMetaFile) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // storage full/unavailable - page list just won't survive a refresh
  }
}

interface PagesState {
  pages: PageMeta[];
  activePageId: string;
  ready: boolean;

  /** Loads page metadata (migrating the old single-chain autosave into a first page if this is the
   * very first run with pages), then loads the active page's chain into chainStore. Synchronous -
   * localStorage only - so App.tsx can call it before the first render settles, no loading flicker. */
  init: () => void;
  createPage: (name?: string) => string;
  switchPage: (id: string) => void;
  renamePage: (id: string, name: string) => void;
  deletePage: (id: string) => void;
}

export const usePagesStore = create<PagesState>((set, get) => ({
  pages: [],
  activePageId: "",
  ready: false,

  init: () => {
    if (get().ready) return;
    let meta = loadMeta();
    if (!meta) {
      const legacy = loadLegacyAutosave();
      const id = newPageId();
      savePage(id, legacy?.nodes ?? [], legacy?.edges ?? []);
      meta = { pages: [{ id, name: "Page 1" }], activePageId: id };
      saveMeta(meta);
    }
    const data = loadPage(meta.activePageId);
    useChainStore.getState().hardLoad(data?.nodes ?? [], data?.edges ?? []);
    set({ pages: meta.pages, activePageId: meta.activePageId, ready: true });
  },

  createPage: (name) => {
    const { pages, activePageId } = get();
    const { nodes, edges } = useChainStore.getState();
    savePage(activePageId, nodes, edges);

    const id = newPageId();
    const pageName = name?.trim() || `Page ${pages.length + 1}`;
    savePage(id, [], []);
    useChainStore.getState().hardLoad([], []);

    const nextPages = [...pages, { id, name: pageName }];
    set({ pages: nextPages, activePageId: id });
    saveMeta({ pages: nextPages, activePageId: id });
    return id;
  },

  switchPage: (id) => {
    const { pages, activePageId } = get();
    if (id === activePageId) return;
    if (!pages.some((p) => p.id === id)) return;

    const { nodes, edges } = useChainStore.getState();
    savePage(activePageId, nodes, edges);

    const data = loadPage(id);
    useChainStore.getState().hardLoad(data?.nodes ?? [], data?.edges ?? []);

    set({ activePageId: id });
    saveMeta({ pages, activePageId: id });
  },

  renamePage: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { pages, activePageId } = get();
    const nextPages = pages.map((p) => (p.id === id ? { ...p, name: trimmed } : p));
    set({ pages: nextPages });
    saveMeta({ pages: nextPages, activePageId });
  },

  deletePage: (id) => {
    const { pages, activePageId } = get();
    if (pages.length <= 1) return;
    const index = pages.findIndex((p) => p.id === id);
    if (index === -1) return;

    const nextPages = pages.filter((p) => p.id !== id);
    deletePageStorage(id);

    let nextActiveId = activePageId;
    if (id === activePageId) {
      const fallback = nextPages[index] ?? nextPages[index - 1] ?? nextPages[0];
      nextActiveId = fallback.id;
      const data = loadPage(nextActiveId);
      useChainStore.getState().hardLoad(data?.nodes ?? [], data?.edges ?? []);
    }

    set({ pages: nextPages, activePageId: nextActiveId });
    saveMeta({ pages: nextPages, activePageId: nextActiveId });
  },
}));
