import { useRef, useEffect, useState, useCallback } from "react";
import { Globe, Plus, RefreshCw, Info } from "lucide-react";
import { loadGlobeData, stepPhysics, project, saveNode, saveEdge, type GlobeState, type KnowledgeNode } from "./lib/globe-engine";

// ♃ 3D Knowledge Globe
// Shows your condenser knowledge network as an interactive 3D constellation
// Reads from neutronstar, deep-cosmos-chat, mind-garden localStorage

const SPEC_COLORS: Record<string, string> = {
  baseline: "#f59e0b", memory: "#6366f1", streaming: "#22d3ee",
  emotion: "#f472b6", coding: "#4ade80", security: "#ef4444",
  language: "#a78bfa", analysis: "#fb923c", relationship: "#34d399",
  knowledge: "#60a5fa", orchestration: "#fbbf24", conflict: "#f87171",
  "mind-garden": "#818cf8", "deep-cosmos": "#38bdf8", "analysis": "#fb923c",
};

export default function App() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const stateRef    = useRef<GlobeState>(loadGlobeData());
  const rotRef      = useRef({ x: 0.2, y: 0, dragging: false, lx: 0, ly: 0 });
  const rafRef      = useRef<number>(0);
  const [selected, setSelected] = useState<KnowledgeNode | null>(null);
  const [nodeCount, setNodeCount] = useState(stateRef.current.nodes.length);
  const [addLabel, setAddLabel]   = useState("");
  const [showAdd, setShowAdd]     = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width; const H = canvas.height;
    const cx = W/2; const cy = H/2;
    const rot = rotRef.current;

    ctx.clearRect(0, 0, W, H);

    const { nodes, edges } = stateRef.current;

    // Project all nodes
    const projected = nodes.map(n => ({ ...n, ...project(n.x, n.y, n.z, rot.x, rot.y, cx, cy) }));
    projected.sort((a,b) => a.depth - b.depth);

    // Draw edges
    for (const edge of edges) {
      const a = projected.find(n => n.id === edge.from);
      const b = projected.find(n => n.id === edge.to);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.strokeStyle = \`rgba(255,255,255,\${edge.strength * 0.15})\`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Draw nodes
    for (const n of projected) {
      const color = SPEC_COLORS[n.specialization || "baseline"] || "#6366f1";
      const r = (n.value || 8) * n.scale;
      const isSelected = selected?.id === n.id;

      // Glow
      if (isSelected || n.type === "hub") {
        const grd = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, r * 3);
        grd.addColorStop(0, color + "40");
        grd.addColorStop(1, "transparent");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = color + (n.depth < 0 ? "cc" : "aa");
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Label (only closer nodes)
      if (n.scale > 0.7 || n.type === "hub") {
        ctx.font = \`\${Math.max(8, 10 * n.scale)}px monospace\`;
        ctx.fillStyle = \`rgba(255,255,255,\${Math.min(1, n.scale)})\`;
        ctx.textAlign = "center";
        ctx.fillText(n.label.slice(0,20), n.sx, n.sy + r + 12);
      }
    }

    // HUD
    ctx.font = "10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "left";
    ctx.fillText(\`\${nodes.length} nodes · drag to rotate · click to inspect\`, 12, H - 12);
  }, [selected]);

  useEffect(() => {
    let lastTime = 0;
    const loop = (t: number) => {
      if (t - lastTime > 30) {
        stateRef.current = stepPhysics(stateRef.current);
        // Auto-rotate
        if (!rotRef.current.dragging) rotRef.current.y += 0.003;
        draw();
        lastTime = t;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // Resize canvas
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Mouse/touch interaction
  const onMouseDown = (e: React.MouseEvent) => {
    rotRef.current.dragging = true;
    rotRef.current.lx = e.clientX;
    rotRef.current.ly = e.clientY;
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!rotRef.current.dragging) return;
    rotRef.current.y += (e.clientX - rotRef.current.lx) * 0.005;
    rotRef.current.x += (e.clientY - rotRef.current.ly) * 0.005;
    rotRef.current.lx = e.clientX;
    rotRef.current.ly = e.clientY;
  };
  const onMouseUp = () => { rotRef.current.dragging = false; };

  const onClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const rot = rotRef.current;
    const cx = canvas.width/2; const cy = canvas.height/2;

    for (const n of stateRef.current.nodes) {
      const p = project(n.x, n.y, n.z, rot.x, rot.y, cx, cy);
      const r = (n.value || 8) * p.scale + 8;
      if (Math.hypot(mx - p.sx, my - p.sy) < r) {
        setSelected(prev => prev?.id === n.id ? null : n);
        return;
      }
    }
    setSelected(null);
  };

  const addNode = () => {
    if (!addLabel.trim()) return;
    const node: KnowledgeNode = {
      id: crypto.randomUUID(), label: addLabel.trim(),
      type: "concept", specialization: "baseline", value: 8,
      x: (Math.random()-0.5)*200, y: (Math.random()-0.5)*200, z: (Math.random()-0.5)*200,
      vx:0, vy:0, vz:0, connections: [],
    };
    stateRef.current.nodes.push(node);
    saveNode(node);
    setNodeCount(stateRef.current.nodes.length);
    setAddLabel(""); setShowAdd(false);
  };

  const reload = () => {
    stateRef.current = loadGlobeData();
    setNodeCount(stateRef.current.nodes.length);
    setSelected(null);
  };

  return (
    <div className="h-screen flex flex-col" style={{background:"#050510"}}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-mono text-white/70 tracking-wide">Knowledge Globe</span>
          <span className="text-[10px] font-mono text-white/30 px-1.5 border border-white/10 rounded">♃ visualization</span>
        </div>
        <div className="flex gap-2">
          <button onClick={reload} className="p-1.5 rounded text-white/40 hover:text-white/70 transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={() => setShowAdd(v => !v)} className="p-1.5 rounded text-white/40 hover:text-white/70 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Add node bar */}
      {showAdd && (
        <div className="flex gap-2 px-4 py-2 border-b border-white/10">
          <input value={addLabel} onChange={e => setAddLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && addNode()}
            placeholder="Node label..." className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-white/70 focus:outline-none" />
          <button onClick={addNode} className="px-3 py-1.5 bg-indigo-600/60 hover:bg-indigo-600 rounded text-xs font-mono text-white transition-colors">Add</button>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onClick={onClick} />

        {/* Selected node info */}
        {selected && (
          <div className="absolute top-4 right-4 bg-black/70 border border-white/10 rounded-lg p-3 text-xs font-mono text-white/70 max-w-xs space-y-1 backdrop-blur">
            <div className="flex items-center gap-1.5 text-white/90"><Info className="w-3 h-3" />{selected.label}</div>
            <div>Type: {selected.type}</div>
            <div>Spec: {selected.specialization || "—"}</div>
            <div>Mass: {selected.value}</div>
          </div>
        )}
      </div>
    </div>
  );
}
