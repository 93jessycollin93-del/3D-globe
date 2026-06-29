// globe-engine.ts
// ♃ 3D Knowledge Globe — visualizes knowledge star network
// Future-proof:
//   - Canvas 2D by default (zero deps, works everywhere)
//   - Data reads neutronknowledge/neutronstar localStorage format
//   - Upgradeable to Three.js/react-three-fiber (same data schema)
//   - Nodes persist in localStorage
//   - Real-time physics simulation (force-directed)
//   - Jacky API integration for auto-linking related nodes

const JACKY_URL = (import.meta as any).env?.VITE_JACKY_URL || null;

export interface KnowledgeNode {
  id: string;
  label: string;
  type: "star" | "concept" | "connection" | "hub";
  specialization?: string;
  value: number;        // size of node
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  connections: string[]; // node ids
  color?: string;
}

export interface GlobeState {
  nodes: KnowledgeNode[];
  edges: { from: string; to: string; strength: number }[];
}

// ─── Load from multiple condenser localStorage sources ─────────────────────────

export function loadGlobeData(): GlobeState {
  const nodes: KnowledgeNode[] = [];
  const edges: { from: string; to: string; strength: number }[] = [];
  const seen = new Set<string>();

  // Neutronstar format: neutronstar:stars
  try {
    const stars = JSON.parse(localStorage.getItem("neutronstar:stars") || "[]");
    for (const s of stars.slice(0, 30)) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      nodes.push({
        id: s.id, label: s.thesis?.slice(0, 30) || "Star",
        type: "star", specialization: "neutronstar", value: 12,
        x: (Math.random()-0.5)*300, y: (Math.random()-0.5)*300, z: (Math.random()-0.5)*300,
        vx:0, vy:0, vz:0, connections: [],
      });
    }
  } catch { /* no data */ }

  // deep-cosmos-chat format: neutron-stars
  try {
    const stars = JSON.parse(localStorage.getItem("neutron-stars") || "[]");
    for (const s of stars.slice(0, 20)) {
      const id = s.id || crypto.randomUUID();
      if (seen.has(id)) continue;
      seen.add(id);
      nodes.push({
        id, label: s.title?.slice(0, 30) || "Cosmos",
        type: "star", specialization: "deep-cosmos", value: 10,
        x: (Math.random()-0.5)*300, y: (Math.random()-0.5)*300, z: (Math.random()-0.5)*300,
        vx:0, vy:0, vz:0, connections: [],
      });
    }
  } catch { /* no data */ }

  // mind-garden format: mind-garden:threads
  try {
    const threads = JSON.parse(localStorage.getItem("mind-garden:threads") || "[]");
    for (const t of threads.slice(0, 15)) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      nodes.push({
        id: t.id, label: t.title?.slice(0, 30) || "Thread",
        type: "concept", specialization: "mind-garden", value: 8,
        x: (Math.random()-0.5)*300, y: (Math.random()-0.5)*300, z: (Math.random()-0.5)*300,
        vx:0, vy:0, vz:0, connections: [],
      });
    }
  } catch { /* no data */ }

  // ai-data-analist format
  try {
    const records = JSON.parse(localStorage.getItem("ai-data-analist:history") || "[]");
    for (const r of records.slice(0, 10)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      nodes.push({
        id: r.id, label: r.result?.summary?.slice(0,30) || "Analysis",
        type: "concept", specialization: "analysis", value: 6,
        x: (Math.random()-0.5)*300, y: (Math.random()-0.5)*300, z: (Math.random()-0.5)*300,
        vx:0, vy:0, vz:0, connections: [],
      });
    }
  } catch { /* no data */ }

  // Custom nodes from globe storage
  try {
    const custom = JSON.parse(localStorage.getItem("globe:nodes") || "[]");
    for (const n of custom) {
      if (!seen.has(n.id)) { nodes.push(n); seen.add(n.id); }
    }
    const customEdges = JSON.parse(localStorage.getItem("globe:edges") || "[]");
    edges.push(...customEdges);
  } catch { /* no data */ }

  // If no nodes at all, create demo constellation
  if (nodes.length === 0) {
    const demo = [
      { label: "neutronknowledge ☉", type: "hub", specialization: "baseline", value: 20 },
      { label: "signal-refiner ♆", type: "star", specialization: "streaming", value: 12 },
      { label: "neutronstar ♄", type: "star", specialization: "memory", value: 14 },
      { label: "tension-tamer ♂", type: "star", specialization: "conflict", value: 10 },
      { label: "mind-garden ♃", type: "concept", specialization: "knowledge", value: 11 },
      { label: "jacky core", type: "hub", specialization: "orchestration", value: 18 },
    ] as const;
    for (const d of demo) {
      const id = crypto.randomUUID();
      nodes.push({ id, ...d, x: (Math.random()-0.5)*300, y: (Math.random()-0.5)*300, z: (Math.random()-0.5)*300, vx:0, vy:0, vz:0, connections: [] });
    }
    // Connect all to jacky
    const jacky = nodes.find(n => n.label === "jacky core");
    const baseline = nodes.find(n => n.label.includes("neutronknowledge"));
    if (jacky && baseline) {
      for (const n of nodes) {
        if (n.id !== jacky.id) edges.push({ from: jacky.id, to: n.id, strength: 0.5 });
      }
      edges.push({ from: baseline.id, to: jacky.id, strength: 1 });
    }
  }

  return { nodes, edges };
}

// ─── Save custom nodes ────────────────────────────────────────────────────────

export function saveNode(node: KnowledgeNode) {
  const existing: KnowledgeNode[] = JSON.parse(localStorage.getItem("globe:nodes") || "[]");
  existing.push(node);
  localStorage.setItem("globe:nodes", JSON.stringify(existing));
}

export function saveEdge(from: string, to: string, strength = 0.5) {
  const existing = JSON.parse(localStorage.getItem("globe:edges") || "[]");
  existing.push({ from, to, strength });
  localStorage.setItem("globe:edges", JSON.stringify(existing));
}

// ─── Physics (force-directed, runs per frame) ─────────────────────────────────

export function stepPhysics(state: GlobeState, dt = 0.016): GlobeState {
  const { nodes, edges } = state;
  const repulsion = 2000;
  const attraction = 0.05;
  const damping = 0.92;
  const centerForce = 0.002;

  // Apply forces
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    // Repulsion between all pairs
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;
      const force = repulsion / (dist * dist);
      const fx = (dx/dist)*force; const fy = (dy/dist)*force; const fz = (dz/dist)*force;
      a.vx -= fx*dt; a.vy -= fy*dt; a.vz -= fz*dt;
      b.vx += fx*dt; b.vy += fy*dt; b.vz += fz*dt;
    }
    // Center gravity
    a.vx -= a.x * centerForce;
    a.vy -= a.y * centerForce;
    a.vz -= a.z * centerForce;
  }

  // Attraction along edges
  for (const edge of edges) {
    const a = nodes.find(n => n.id === edge.from);
    const b = nodes.find(n => n.id === edge.to);
    if (!a || !b) continue;
    const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;
    const force = attraction * edge.strength * dist;
    const fx = (dx/dist)*force; const fy = (dy/dist)*force; const fz = (dz/dist)*force;
    a.vx += fx*dt; a.vy += fy*dt; a.vz += fz*dt;
    b.vx -= fx*dt; b.vy -= fy*dt; b.vz -= fz*dt;
  }

  // Integrate + damp
  for (const n of nodes) {
    n.vx *= damping; n.vy *= damping; n.vz *= damping;
    n.x += n.vx; n.y += n.vy; n.z += n.vz;
  }

  return { nodes: [...nodes], edges };
}

// ─── 2D projection of 3D point ─────────────────────────────────────────────────

export function project(x: number, y: number, z: number, rotX: number, rotY: number, cx: number, cy: number) {
  // Rotate around Y axis
  const cosY = Math.cos(rotY); const sinY = Math.sin(rotY);
  const x1 = x * cosY + z * sinY;
  const z1 = -x * sinY + z * cosY;
  // Rotate around X axis
  const cosX = Math.cos(rotX); const sinX = Math.sin(rotX);
  const y1 = y * cosX - z1 * sinX;
  const z2 = y * sinX + z1 * cosX;
  // Perspective
  const fov = 600;
  const scale = fov / (fov + z2 + 400);
  return { sx: cx + x1 * scale, sy: cy + y1 * scale, scale, depth: z2 };
}
