import { useState, useRef, useMemo } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Stars, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Info, X } from 'lucide-react';

// ─── Condenser network data ────────────────────────────────────────────────
// All 52 repos mapped to 3D positions on a knowledge sphere
// Grouped by specialization, connected by relationship edges

interface CondenserNode {
  id: string;
  name: string;
  symbol: string;
  specialization: string;
  status: "working" | "fixed" | "scaffolded" | "pending";
  position: [number, number, number];
  color: string;
}

const SPECIALIZATION_COLORS: Record<string, string> = {
  baseline:      "#f59e0b",   // gold
  emotion:       "#ec4899",   // pink
  coding:        "#3b82f6",   // blue
  knowledge:     "#8b5cf6",   // purple
  memory:        "#6366f1",   // indigo
  language:      "#06b6d4",   // cyan
  streaming:     "#10b981",   // emerald
  relationship:  "#f97316",   // orange
  security:      "#ef4444",   // red
  analysis:      "#84cc16",   // lime
  orchestration: "#a855f7",   // violet
  episodic:      "#64748b",   // slate
};

// Distribute nodes on a sphere using fibonacci lattice
function fibonacciSphere(n: number, radius: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    pts.push([Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius]);
  }
  return pts;
}

const RAW_NODES = [
  { id: "neutronknowledge",         symbol: "☉", spec: "baseline",      status: "working"   },
  { id: "quiet-heart-signal",       symbol: "♀", spec: "emotion",       status: "working"   },
  { id: "tension-tamer",            symbol: "♂", spec: "coding",        status: "working"   },
  { id: "apex-intelligence-hub",    symbol: "♃", spec: "knowledge",     status: "scaffolded"},
  { id: "neutronstar",              symbol: "♄", spec: "memory",        status: "fixed"     },
  { id: "signal-weaver-23",         symbol: "☿", spec: "language",      status: "scaffolded"},
  { id: "neutron-core-stream",      symbol: "♆", spec: "streaming",     status: "fixed"     },
  { id: "relational-compass",       symbol: "♇", spec: "relationship",  status: "working"   },
  { id: "veil-ops",                 symbol: "⚶", spec: "security",      status: "working"   },
  { id: "fobccc",                   symbol: "⚸", spec: "analysis",      status: "working"   },
  { id: "bot-squad-dynamics",       symbol: "♅", spec: "orchestration", status: "working"   },
  { id: "logbook-curator",          symbol: "☽", spec: "episodic",      status: "working"   },
  { id: "signal-refiner",           symbol: "☿", spec: "language",      status: "fixed"     },
  { id: "express-purely",           symbol: "♀", spec: "emotion",       status: "fixed"     },
  { id: "remix-of-jackie-s-compass",symbol: "♇", spec: "relationship",  status: "fixed"     },
  { id: "deep-cosmos-chat",         symbol: "♆", spec: "streaming",     status: "fixed"     },
  { id: "mind-garden-explorer",     symbol: "♃", spec: "knowledge",     status: "fixed"     },
  { id: "calm-comprehension",       symbol: "☽", spec: "episodic",      status: "fixed"     },
  { id: "star-lingo-flux",          symbol: "☿", spec: "language",      status: "fixed"     },
  { id: "density-weave-core",       symbol: "♆", spec: "streaming",     status: "working"   },
  { id: "signal-star-compress",     symbol: "♆", spec: "streaming",     status: "working"   },
  { id: "signal67",                 symbol: "♆", spec: "streaming",     status: "working"   },
  { id: "neutron-dense-ideas",      symbol: "♃", spec: "knowledge",     status: "working"   },
  { id: "core-light-vault",         symbol: "♄", spec: "memory",        status: "working"   },
  { id: "signal-sharpener",         symbol: "☿", spec: "language",      status: "working"   },
  { id: "jacky",                    symbol: "☉", spec: "baseline",      status: "working"   },
  { id: "jackie-core-keeper",       symbol: "☉", spec: "baseline",      status: "working"   },
  { id: "ocd-jacky-777",            symbol: "♄", spec: "memory",        status: "working"   },
  { id: "eru",                      symbol: "♅", spec: "orchestration", status: "working"   },
  { id: "neweru",                   symbol: "♅", spec: "orchestration", status: "working"   },
  { id: "jadelounge",               symbol: "♇", spec: "relationship",  status: "working"   },
  { id: "dakura",                   symbol: "⚶", spec: "security",      status: "fixed"     },
  { id: "clever-memory-bot",        symbol: "♄", spec: "memory",        status: "working"   },
  { id: "tikkerlive",               symbol: "⚸", spec: "analysis",      status: "working"   },
  { id: "momentum-habit-tracker",   symbol: "♂", spec: "coding",        status: "working"   },
  { id: "telegram-proxy-guide",     symbol: "☿", spec: "language",      status: "working"   },
  { id: "AI-Data-Analist",          symbol: "⚸", spec: "analysis",      status: "scaffolded"},
  { id: "3D-globe",                 symbol: "♃", spec: "knowledge",     status: "scaffolded"},
  { id: "signal-weaver-73",         symbol: "☿", spec: "language",      status: "working"   },
  { id: "cyber-store",              symbol: "⚶", spec: "security",      status: "working"   },
  { id: "PC",                       symbol: "♅", spec: "orchestration", status: "working"   },
  { id: "fobcce",                   symbol: "⚸", spec: "analysis",      status: "working"   },
];

const positions = fibonacciSphere(RAW_NODES.length, 5);

const NODES: CondenserNode[] = RAW_NODES.map((n, i) => ({
  id: n.id,
  name: n.id,
  symbol: n.symbol,
  specialization: n.spec,
  status: n.status as CondenserNode["status"],
  position: positions[i],
  color: SPECIALIZATION_COLORS[n.spec] || "#94a3b8",
}));

// Edges connect nodes of same specialization
const EDGES = NODES.flatMap((a, i) =>
  NODES.slice(i + 1)
    .filter(b => b.specialization === a.specialization)
    .map(b => ({ from: a.position, to: b.position, color: a.color }))
);

// ─── 3D Node component ────────────────────────────────────────────────────

function StarNode({ node, onClick }: { node: CondenserNode; onClick: (n: CondenserNode) => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  const size = node.status === "working" ? 0.12 : node.status === "fixed" ? 0.11 : 0.09;
  const emissiveIntensity = hovered ? 1.2 : node.specialization === "baseline" ? 0.8 : 0.4;

  return (
    <group position={node.position}>
      <mesh
        ref={meshRef}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(node); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <octahedronGeometry args={[size, 0]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={emissiveIntensity}
          roughness={0.3}
          metalness={0.8}
        />
      </mesh>
      {hovered && (
        <Text
          position={[0, size + 0.15, 0]}
          fontSize={0.12}
          color={node.color}
          anchorX="center"
          anchorY="bottom"
        >
          {node.symbol} {node.id.slice(0, 18)}
        </Text>
      )}
    </group>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────

export default function App() {
  const [selected, setSelected] = useState<CondenserNode | null>(null);
  const [filterSpec, setFilterSpec] = useState<string | null>(null);

  const visibleNodes = filterSpec ? NODES.filter(n => n.specialization === filterSpec) : NODES;
  const visibleEdges = filterSpec ? EDGES.filter(e => {
    const from = NODES.find(n => n.position === e.from);
    return from?.specialization === filterSpec;
  }) : EDGES;

  const specs = [...new Set(NODES.map(n => n.specialization))].sort();

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Canvas camera={{ position: [0, 0, 12], fov: 60 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#3b82f6" />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade />

        {visibleEdges.map((edge, i) => (
          <Line key={i} points={[edge.from, edge.to]} color={edge.color} lineWidth={0.3} opacity={0.15} transparent />
        ))}

        {visibleNodes.map(node => (
          <StarNode key={node.id} node={node} onClick={setSelected} />
        ))}

        <OrbitControls enableDamping dampingFactor={0.05} rotateSpeed={0.4} />
      </Canvas>

      {/* Header */}
      <div style={{ position:'absolute', top:16, left:16, pointerEvents:'none' }}>
        <div style={{ color:'#e2e8f0', fontSize:18, fontWeight:700, letterSpacing:2 }}>
          KNOWLEDGE NETWORK
        </div>
        <div style={{ color:'#64748b', fontSize:11, marginTop:2 }}>
          {NODES.length} condensers · {EDGES.length} connections · drag to rotate
        </div>
      </div>

      {/* Legend / filter */}
      <div style={{ position:'absolute', top:16, right:16, display:'flex', flexDirection:'column', gap:4 }}>
        <button
          onClick={() => setFilterSpec(null)}
          style={{ fontSize:10, padding:'3px 8px', borderRadius:4, border:'1px solid #334155',
            background: filterSpec === null ? '#1e293b' : 'transparent', color:'#94a3b8', cursor:'pointer' }}
        >
          All
        </button>
        {specs.map(spec => (
          <button key={spec} onClick={() => setFilterSpec(filterSpec === spec ? null : spec)}
            style={{ fontSize:10, padding:'3px 8px', borderRadius:4, border:`1px solid ${SPECIALIZATION_COLORS[spec]}40`,
              background: filterSpec === spec ? SPECIALIZATION_COLORS[spec] + '22' : 'transparent',
              color: SPECIALIZATION_COLORS[spec], cursor:'pointer', textAlign:'left' }}
          >
            {SPECIALIZATION_COLORS[spec] && '●'} {spec}
          </button>
        ))}
      </div>

      {/* Selected node panel */}
      {selected && (
        <div style={{ position:'absolute', bottom:24, left:24, background:'#0f172a',
          border:`1px solid ${selected.color}40`, borderRadius:12, padding:20, minWidth:260,
          boxShadow:`0 0 40px ${selected.color}20` }}>
          <button onClick={() => setSelected(null)}
            style={{ position:'absolute', top:12, right:12, background:'none', border:'none',
              color:'#64748b', cursor:'pointer' }}>
            <X size={14} />
          </button>
          <div style={{ color: selected.color, fontSize:24, marginBottom:4 }}>{selected.symbol}</div>
          <div style={{ color:'#e2e8f0', fontSize:14, fontWeight:600, marginBottom:4 }}>{selected.name}</div>
          <div style={{ color:'#64748b', fontSize:11, marginBottom:8 }}>{selected.specialization} condenser</div>
          <div style={{ fontSize:11, padding:'2px 8px', borderRadius:4, display:'inline-block',
            background: selected.status === 'working' ? '#16a34a22' : selected.status === 'fixed' ? '#2563eb22' : '#78350f22',
            color: selected.status === 'working' ? '#4ade80' : selected.status === 'fixed' ? '#60a5fa' : '#fbbf24',
            border: `1px solid ${selected.status === 'working' ? '#16a34a' : selected.status === 'fixed' ? '#2563eb' : '#78350f'}40`,
          }}>
            {selected.status.toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}
