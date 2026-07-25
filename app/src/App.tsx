import { useEffect, useRef, useState } from "react";
import "./App.css";
import { ChainView } from "./components/ChainView";
import { AddNodeModal } from "./components/AddNodeModal";
import { PrimaryToolbar } from "./components/PrimaryToolbar";
import { ChainSummaryPanel } from "./components/ChainSummaryPanel";
import { useRecipeDatabase } from "./state/useRecipeDatabase";
import { useChainStore } from "./state/chainStore";
import { downloadChain, loadFromLocalStorage, readChainFile, saveToLocalStorage } from "./state/persistence";
import { buildShareUrl, clearShareHash, readShareUrl } from "./state/shareLink";
import { useIconStore } from "./state/iconStore";

function randomPosition() {
  return { x: 200 + Math.random() * 300, y: 150 + Math.random() * 300 };
}

function App() {
  const { db, loading, error } = useRecipeDatabase();
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addItemNode = useChainStore((s) => s.addItemNode);
  const addMachineNode = useChainStore((s) => s.addMachineNode);
  const addNoteNode = useChainStore((s) => s.addNoteNode);
  const clear = useChainStore((s) => s.clear);
  const loadChain = useChainStore((s) => s.loadChain);
  const nodeCount = useChainStore((s) => s.nodes.length);
  // Read straight from the store (not via ChainView) so this stays in sync with
  // SelectionToolbar/EdgeColorToolbar without any prop-drilling - all three toolbars share the
  // same bottom-center spot and are never shown at once: this one only when nothing at all is
  // selected (a single selected node now shows SelectionToolbar too, for its recolor swatches).
  const selectedCount = useChainStore((s) => s.nodes.filter((n) => n.selected).length);
  const selectedEdgeCount = useChainStore((s) => s.edges.filter((e) => e.selected).length);
  const loadIcons = useIconStore((s) => s.load);

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

  // Restore a shared link's chain first (an explicit "open this chain" action), falling back to
  // the last autosaved canvas only if there's no share hash and nothing's loaded yet already -
  // then keep autosaving on every change. The share hash is cleared once consumed so a later
  // refresh resumes from autosave instead of re-loading the (possibly now-stale) shared chain.
  useEffect(() => {
    (async () => {
      const shared = await readShareUrl();
      if (shared) {
        loadChain(shared.nodes, shared.edges);
        clearShareHash();
      } else if (useChainStore.getState().nodes.length === 0) {
        const saved = loadFromLocalStorage();
        if (saved) loadChain(saved.nodes, saved.edges);
      }
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useChainStore.subscribe((state) => {
      clearTimeout(timer);
      timer = setTimeout(() => saveToLocalStorage(state.nodes, state.edges), 800);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [loadChain]);

  function handleSave() {
    const { nodes, edges } = useChainStore.getState();
    downloadChain(nodes, edges);
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
      <h1 className="app-title-overlay">GregLineMaker</h1>

      {!summaryOpen && (
        <button type="button" className="summary-toggle-btn" title="Chain summary" onClick={() => setSummaryOpen(true)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
      <ChainSummaryPanel open={summaryOpen} onClose={() => setSummaryOpen(false)} db={db} />

      <main className="chain-area">{db && <ChainView db={db} />}</main>

      {selectedCount === 0 && selectedEdgeCount === 0 && (
        <PrimaryToolbar
          dbReady={!!db}
          loading={loading}
          error={error}
          canSave={nodeCount > 0}
          shareStatus={shareStatus}
          onAddNode={() => setAddNodeOpen(true)}
          onSave={handleSave}
          onLoad={() => fileInputRef.current?.click()}
          onShare={handleShare}
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
          onAddMachine={(label, tier) => addMachineNode(label, tier, randomPosition())}
          onAddNote={(text) => addNoteNode(text, randomPosition())}
        />
      )}
    </div>
  );
}

export default App;
