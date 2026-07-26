import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { ChainView } from "./components/ChainView";
import { AddNodeModal } from "./components/AddNodeModal";
import { SettingsModal } from "./components/SettingsModal";
import { PrimaryToolbar } from "./components/PrimaryToolbar";
import { PageTabs } from "./components/PageTabs";
import { ChainSummaryPanel } from "./components/ChainSummaryPanel";
import { Tooltip } from "./components/Tooltip";
import { useRecipeDatabase } from "./state/useRecipeDatabase";
import { useChainStore } from "./state/chainStore";
import { usePagesStore } from "./state/pagesStore";
import { chainFilename, downloadChain, readChainFile, savePage } from "./state/persistence";
import { buildShareUrl, clearShareHash, readShareUrl } from "./state/shareLink";
import { useIconStore } from "./state/iconStore";
import { computeBottlenecks } from "./lib/productionTime";

function randomPosition() {
  return { x: 200 + Math.random() * 300, y: 150 + Math.random() * 300 };
}

function App() {
  const { db, loading, error, progress } = useRecipeDatabase();
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [bottleneckOn, setBottleneckOn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addItemNode = useChainStore((s) => s.addItemNode);
  const addMachineNode = useChainStore((s) => s.addMachineNode);
  const addNoteNode = useChainStore((s) => s.addNoteNode);
  const clear = useChainStore((s) => s.clear);
  const loadChain = useChainStore((s) => s.loadChain);
  const nodeCount = useChainStore((s) => s.nodes.length);
  const nodes = useChainStore((s) => s.nodes);
  const edges = useChainStore((s) => s.edges);
  const setBottleneckHighlight = useChainStore((s) => s.setBottleneckHighlight);
  // Read straight from the store (not via ChainView) so this stays in sync with
  // SelectionToolbar/EdgeColorToolbar without any prop-drilling - all three toolbars share the
  // same bottom-center spot and are never shown at once: this one only when nothing at all is
  // selected (a single selected node now shows SelectionToolbar too, for its recolor swatches).
  const selectedCount = useChainStore((s) => s.nodes.filter((n) => n.selected).length);
  const selectedEdgeCount = useChainStore((s) => s.edges.filter((e) => e.selected).length);
  const loadIcons = useIconStore((s) => s.load);
  const iconsLoading = useIconStore((s) => s.loading);
  const iconsError = useIconStore((s) => s.error);

  const pages = usePagesStore((s) => s.pages);
  const activePageId = usePagesStore((s) => s.activePageId);
  const pagesReady = usePagesStore((s) => s.ready);
  const switchPage = usePagesStore((s) => s.switchPage);
  const createPage = usePagesStore((s) => s.createPage);
  const renamePage = usePagesStore((s) => s.renamePage);
  const deletePage = usePagesStore((s) => s.deletePage);

  const bottlenecks = useMemo(() => computeBottlenecks(nodes, edges, db ?? undefined), [nodes, edges, db]);

  // Which nodes/edges the "!" toggle should ring/stroke red right now - just the bottleneck
  // machines themselves and their OUTPUT connections (not input edges, and not the connected item
  // nodes at all), so the flag points at the slow process itself rather than implicating everything
  // around it. Recomputed whenever the toggle, the bottleneck list, or the graph itself changes;
  // synced into the store below so ItemNode/MachineNode/BendableEdge (which don't have db) can read
  // it directly, the same way ChainSummaryPanel's hover highlight already works.
  const bottleneckHighlight = useMemo(() => {
    if (!bottleneckOn || bottlenecks.length === 0) return { nodeIds: [] as string[], edgeIds: [] as string[] };
    const machineIds = new Set(bottlenecks.map((b) => b.machineId));
    const edgeIds = edges.filter((e) => machineIds.has(e.source)).map((e) => e.id);
    return { nodeIds: [...machineIds], edgeIds };
  }, [bottleneckOn, bottlenecks, edges]);

  useEffect(() => {
    setBottleneckHighlight(bottleneckHighlight.nodeIds, bottleneckHighlight.edgeIds);
  }, [bottleneckHighlight, setBottleneckHighlight]);

  useEffect(() => {
    loadIcons();
  }, [loadIcons]);

  useEffect(() => {
    if (!summaryOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSummaryOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [summaryOpen]);

  // Load page metadata + the active page's chain first (sync, no flicker - migrates the old
  // single-canvas autosave into a first page on a user's first run under this scheme). Then, a
  // shared link's chain becomes a brand-new page (never clobbers whatever page was already active)
  // rather than the old "overwrite whatever's on screen" behavior - the share hash is cleared once
  // consumed so a later refresh doesn't re-import the same (possibly now-stale) shared chain. Keep
  // autosaving the active page on every change.
  useEffect(() => {
    usePagesStore.getState().init();
    (async () => {
      const shared = await readShareUrl();
      if (shared) {
        const id = usePagesStore.getState().createPage("Shared chain");
        useChainStore.getState().hardLoad(shared.nodes, shared.edges);
        savePage(id, shared.nodes, shared.edges);
        clearShareHash();
      }
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useChainStore.subscribe((state) => {
      clearTimeout(timer);
      timer = setTimeout(() => savePage(usePagesStore.getState().activePageId, state.nodes, state.edges), 800);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  function handleSave() {
    const { nodes, edges } = useChainStore.getState();
    const activePage = usePagesStore.getState().pages.find((p) => p.id === usePagesStore.getState().activePageId);
    downloadChain(nodes, edges, activePage ? chainFilename(activePage.name) : undefined);
  }

  async function handleShare() {
    const { nodes, edges } = useChainStore.getState();
    const { url, long } = await buildShareUrl(nodes, edges);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus(long ? "Link copied (very long - may not paste everywhere)" : "Link copied to clipboard!");
    } catch {
      window.prompt("Copy this link:", url);
      return;
    }
    setTimeout(() => setShareStatus(null), 3000);
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    try {
      const { nodes, edges } = await readChainFile(file);
      loadChain(nodes, edges);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't load that file.");
    }
  }

  return (
    <div className="app-shell">
      <h1 className="app-title-overlay">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="app-title-logo" />
        GregLineMaker
        <span className="app-title-credit">by OwlyFans</span>
      </h1>

      {!summaryOpen && (
        <Tooltip label="Chain summary" placement="right">
          <button type="button" className="summary-toggle-btn" onClick={() => setSummaryOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="2" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </Tooltip>
      )}
      <ChainSummaryPanel open={summaryOpen} onClose={() => setSummaryOpen(false)} db={db} />

      {pagesReady && (
        <PageTabs
          pages={pages}
          activePageId={activePageId}
          onSwitch={switchPage}
          onCreate={createPage}
          onRename={renamePage}
          onDelete={deletePage}
        />
      )}

      {!summaryOpen && bottlenecks.length > 0 && (
        <Tooltip
          label={`${bottlenecks.length} possible bottleneck${bottlenecks.length === 1 ? "" : "s"} - click to highlight on canvas`}
          placement="right"
        >
          <button
            type="button"
            className={`bottleneck-toggle-btn${bottleneckOn ? " active" : ""}`}
            onClick={() => setBottleneckOn((v) => !v)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5 L15 14.5 H1 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="12.3" r="0.9" fill="currentColor" />
            </svg>
          </button>
        </Tooltip>
      )}

      <main className="chain-area">
        {db ? (
          <ChainView db={db} />
        ) : (
          <div className="initial-loading">
            <div className="initial-loading-spinner" />
            <div className="initial-loading-text">
              {error ? `Failed to load recipe database: ${error}` : "Loading recipe database..."}
            </div>
            {!error && progress !== null && (
              <>
                <div className="initial-loading-bar">
                  <div className="initial-loading-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="initial-loading-percent">{progress}%</div>
              </>
            )}
          </div>
        )}
      </main>

      {selectedCount === 0 && selectedEdgeCount === 0 && (
        <PrimaryToolbar
          dbReady={!!db}
          loading={loading}
          error={error}
          progress={progress}
          iconsLoading={iconsLoading}
          iconsError={iconsError}
          canSave={nodeCount > 0}
          shareStatus={shareStatus}
          onAddNode={() => setAddNodeOpen(true)}
          onSave={handleSave}
          onLoad={() => fileInputRef.current?.click()}
          onShare={handleShare}
          onOpenSettings={() => setSettingsOpen(true)}
          onClear={clear}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChosen}
        style={{ display: "none" }}
      />

      {addNodeOpen && db && (
        <AddNodeModal
          db={db}
          onClose={() => setAddNodeOpen(false)}
          onAddItem={(kind, itemId, label, amount) => addItemNode(kind, itemId, label, randomPosition(), amount)}
          onAddMachine={(label, tier, machineId, coilTier) => addMachineNode(label, tier, randomPosition(), machineId, coilTier)}
          onAddNote={(text) => addNoteNode(text, randomPosition())}
        />
      )}

      {settingsOpen && <SettingsModal db={db} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export default App;
