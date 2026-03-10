import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import Papa from "papaparse";
import allAmpCsv from "../../../all_amp.csv?raw";
import { cn } from "@/lib/utils";

interface DataRow {
  x: number | string;
  y: number | string;
  z: number | string;
  part_type?: string;
  source?: string;
  name?: string;
  id?: string | number;
}

interface HoveredPoint {
  id: string | number;
  name: string;
  part_type?: string;
  source?: string;
  position: [number, number, number];
}

interface AmpNameRow {
  sequence?: string;
}

interface PointCloudHeroProps {
  csvUrl: string;
  className?: string;
  background?: string;
  showLegend?: boolean;
  showOverlay?: boolean;
  enableZoom?: boolean;
  allowPageScrollOnWheel?: boolean;
  highlightPartType?: string | null;
  onHighlightPartTypeChange?: (partType: string | null) => void;
  partTypeLabels?: Record<string, string>;
  legendTitle?: string;
  animateConvergence?: boolean;
  convergenceProgress?: number;
  controlledCameraDistance?: number;
  onCameraMove?: (distance: number) => void;
}

const PART_TYPE_COLORS: Record<string, string> = {
  cluster_01: "#d62828",
  cluster_02: "#f77f00",
  cluster_03: "#e09f3e",
  cluster_04: "#2a9d8f",
  cluster_05: "#1d4ed8",
  cluster_06: "#3a86ff",
  cluster_07: "#6a4c93",
  cluster_08: "#8338ec",
  cluster_09: "#ff006e",
  cluster_10: "#b5179e",
  cluster_11: "#2d6a4f",
  cluster_12: "#40916c",
  cluster_13: "#577590",
  cluster_14: "#ef476f",
  apd: "#ff5c5c",
  dramp: "#4ea8de",
  ampainter: "#f4a261",
  diffamp: "#2a9d8f",
  uniprot: "#9b5de5",
  mixed: "#ffd166",
  other: "#adb5bd",
  unknown: "#6c757d",
  cds: "#ff6b6b",
  composite: "#4ecdc4",
  regulatory: "#ffe66d",
  dna: "#95e1d3",
  protein: "#ff8c42",
  rbs: "#c44569",
  intermediate: "#9b59b6",
  reporter: "#3498db",
  promoter: "#2ecc71",
  primer: "#e74c3c",
  rna: "#f39c12",
  generator: "#1abc9c",
  device: "#e67e22",
  tag: "#9b59b6",
  binding: "#34495e",
  protein_domain: "#16a085",
};

const AMP_DISPLAY_NAMES = Papa.parse<AmpNameRow>(allAmpCsv, {
  header: true,
  skipEmptyLines: true,
}).data
  .map((row) => String(row.sequence || "").trim())
  .filter(Boolean);

function getAmpDisplayName(index: number): string {
  if (AMP_DISPLAY_NAMES.length === 0) {
    return `AMP ${index + 1}`;
  }

  return AMP_DISPLAY_NAMES[index % AMP_DISPLAY_NAMES.length];
}

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aHighlight;
  attribute vec3 aInitialPosition;
  uniform float uConvergenceProgress;
  varying vec3 vColor;
  varying float vDepth;
  varying float vHighlight;

  void main() {
    vColor = aColor;
    vHighlight = aHighlight;

    vec3 finalPosition = mix(aInitialPosition, position, uConvergenceProgress);
    vec4 mvPosition = modelViewMatrix * vec4(finalPosition, 1.0);

    float dist = -mvPosition.z;
    vDepth = dist;
    float attenuation = clamp(300.0 / dist, 0.0, 10.0);
    gl_PointSize = aSize * attenuation;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vDepth;
  varying float vHighlight;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    float alpha = smoothstep(1.0, 0.0, d);

    float depthFade = 1.0 - smoothstep(5.0, 20.0, vDepth) * 0.4;
    alpha *= depthFade;

    float dimFactor = vHighlight > 0.5 ? 1.0 : (vHighlight < -0.5 ? 0.25 : 1.0);
    alpha *= dimFactor;

    float glow = smoothstep(0.2, 0.0, d) * 0.25;
    vec3 color = vColor + glow;
    gl_FragColor = vec4(color, alpha);
  }
`;

function fallbackColorForType(type: string): string {
  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = (hash * 31 + type.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 88%, 54%)`;
}

function checkWebGLSupport(): { supported: boolean; error?: string } {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

    if (!gl) {
      return {
        supported: false,
        error: "WebGL is not supported by your browser",
      };
    }

    return { supported: true };
  } catch (error) {
    return {
      supported: false,
      error: `WebGL initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

class StarFieldErrorBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onError: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[PointCloudHero] Error caught by boundary:", error, errorInfo);
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

function useCSV(csvUrl: string) {
  const [rows, setRows] = useState<DataRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(csvUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch CSV (${response.status})`);
        }
        return response.text();
      })
      .then((csvText) => {
        if (cancelled) {
          return;
        }

        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (cancelled) {
              return;
            }

            if (results.errors.length > 0) {
              setError(results.errors[0].message || "CSV parse error");
              setLoading(false);
              return;
            }

            const filtered = (results.data as DataRow[]).filter(
              (row) => row.x != null && row.y != null && row.z != null,
            );

            setRows(filtered);
            setLoading(false);
          },
          error: (parseError) => {
            if (cancelled) {
              return;
            }
            setError(parseError.message || "CSV parse error");
            setLoading(false);
          },
        });
      })
      .catch((fetchError: unknown) => {
        if (cancelled) {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "CSV load error");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [csvUrl]);

  return { rows, error, loading };
}

function buildGeometryFromRows(rows: DataRow[], generateRandomInitial: boolean) {
  const pointCount = rows.length;
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const sizes = new Float32Array(pointCount);
  const partTypes = new Array<string>(pointCount).fill("");
  const initialPositions = generateRandomInitial ? new Float32Array(pointCount * 3) : null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const parsedRows = rows.map((row) => ({
    x: typeof row.x === "number" ? row.x : parseFloat(String(row.x)),
    y: typeof row.y === "number" ? row.y : parseFloat(String(row.y)),
    z: typeof row.z === "number" ? row.z : parseFloat(String(row.z)),
  }));

  for (const coord of parsedRows) {
    if (Number.isFinite(coord.x)) {
      minX = Math.min(minX, coord.x);
      maxX = Math.max(maxX, coord.x);
    }
    if (Number.isFinite(coord.y)) {
      minY = Math.min(minY, coord.y);
      maxY = Math.max(maxY, coord.y);
    }
    if (Number.isFinite(coord.z)) {
      minZ = Math.min(minZ, coord.z);
      maxZ = Math.max(maxZ, coord.z);
    }
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const rangeZ = maxZ - minZ || 1;
  const scale = 500 / Math.max(rangeX, rangeY, rangeZ);

  const fallbackPalette = [
    new THREE.Color("#9ec9ff"),
    new THREE.Color("#ffd6a5"),
    new THREE.Color("#bdb2ff"),
    new THREE.Color("#caffbf"),
    new THREE.Color("#ffadad"),
    new THREE.Color("#fdffb6"),
  ];
  const partMap = new Map<string, number>();
  let nextIndex = 0;
  let center: { x: number; y: number; z: number } | undefined;

  for (let i = 0; i < pointCount; i++) {
    const row = rows[i];
    const coord = parsedRows[i];

    const x = Number.isFinite(coord.x) ? (coord.x - minX - rangeX / 2) * scale : 0;
    const y = Number.isFinite(coord.y) ? (coord.y - minY - rangeY / 2) * scale : 0;
    const z = Number.isFinite(coord.z) ? (coord.z - minZ - rangeZ / 2) * scale : 0;

    if (row.id == 22801) {
      center = { x, y, z };
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    if (initialPositions) {
      const randomRadius = 800;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = Math.random() * randomRadius;

      initialPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      initialPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      initialPositions[i * 3 + 2] = radius * Math.cos(phi);
    }

    sizes[i] = 0.5 + Math.random() * 0.8;

    const type = (row.part_type || "").toLowerCase();
    partTypes[i] = type;

    let color: THREE.Color;
    if (type) {
      const knownColor = PART_TYPE_COLORS[type];
      if (knownColor) {
        color = new THREE.Color(knownColor);
      } else {
        if (!partMap.has(type)) {
          partMap.set(type, nextIndex++);
        }
        color = fallbackPalette[(partMap.get(type) || 0) % fallbackPalette.length];
      }
    } else {
      const t = THREE.MathUtils.clamp((z + 500) / 1000, 0, 1);
      color = new THREE.Color().setHSL(0.6 * (1 - t) + 0.02, 0.6, 0.6 + 0.2 * (1 - t));
    }

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  if (center) {
    for (let i = 0; i < pointCount; i++) {
      positions[i * 3] -= center.x;
      positions[i * 3 + 1] -= center.y;
      positions[i * 3 + 2] -= center.z;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute(
    "aInitialPosition",
    new THREE.BufferAttribute(initialPositions || positions.slice(), 3),
  );
  geometry.setAttribute(
    "aHighlight",
    new THREE.BufferAttribute(new Float32Array(pointCount), 1),
  );
  geometry.computeBoundingSphere();

  return { geometry, positions, partTypes };
}

function PointCloudPicker({
  rows,
  positions,
  onHover,
}: {
  rows: DataRow[];
  positions: Float32Array;
  onHover: (point: HoveredPoint | null) => void;
}) {
  const { camera, gl, size } = useThree();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      let closestIndex = -1;
      let closestScreenDistance = Infinity;
      let closestDepth = Infinity;
      const pixelThreshold = 5;

      for (let i = 0; i < rows.length; i++) {
        const point = new THREE.Vector3(
          positions[i * 3],
          positions[i * 3 + 1],
          positions[i * 3 + 2],
        );
        const projected = point.clone().project(camera);

        if (projected.z >= 1) {
          continue;
        }

        const screenX = (projected.x * 0.5 + 0.5) * size.width;
        const screenY = (-(projected.y * 0.5) + 0.5) * size.height;
        const dx = screenX - mouseX;
        const dy = screenY - mouseY;
        const screenDistance = Math.sqrt(dx * dx + dy * dy);
        const depth = camera.position.distanceTo(point);

        if (screenDistance < pixelThreshold) {
          if (
            screenDistance < closestScreenDistance ||
            (screenDistance === closestScreenDistance && depth < closestDepth)
          ) {
            closestScreenDistance = screenDistance;
            closestDepth = depth;
            closestIndex = i;
          }
        }
      }

      if (closestIndex !== -1 && closestIndex !== hoveredIndex) {
        const row = rows[closestIndex];
        setHoveredIndex(closestIndex);
        onHover({
          id: row.id ?? closestIndex,
          name: getAmpDisplayName(closestIndex),
          part_type: row.part_type,
          source: row.source,
          position: [
            positions[closestIndex * 3],
            positions[closestIndex * 3 + 1],
            positions[closestIndex * 3 + 2],
          ],
        });
        canvas.style.cursor = "pointer";
      } else if (closestIndex === -1 && hoveredIndex !== null) {
        setHoveredIndex(null);
        onHover(null);
        canvas.style.cursor = "grab";
      } else if (closestIndex === -1) {
        canvas.style.cursor = "grab";
      }
    };

    const handlePointerLeave = () => {
      setHoveredIndex(null);
      onHover(null);
      canvas.style.cursor = "grab";
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.style.cursor = "default";
    };
  }, [camera, gl, hoveredIndex, onHover, positions, rows, size.height, size.width]);

  return null;
}

function HoverLabelProjector({
  hoveredData,
  onScreenPosUpdate,
}: {
  hoveredData: HoveredPoint | null;
  onScreenPosUpdate: (position: { x: number; y: number } | null) => void;
}) {
  const { camera, size } = useThree();

  useFrame(() => {
    if (!hoveredData) {
      onScreenPosUpdate(null);
      return;
    }

    const vector = new THREE.Vector3(...hoveredData.position);
    vector.project(camera);

    const x = (vector.x * 0.5 + 0.5) * size.width;
    const y = (-(vector.y * 0.5) + 0.5) * size.height;

    if (vector.z < 1) {
      onScreenPosUpdate({ x, y });
    } else {
      onScreenPosUpdate(null);
    }
  });

  return null;
}

function CameraMotionDetector({
  onCameraMove,
}: {
  onCameraMove?: (distance: number) => void;
}) {
  const { camera } = useThree();
  const initialPosition = useRef<THREE.Vector3 | null>(null);

  useFrame(() => {
    if (initialPosition.current === null) {
      initialPosition.current = camera.position.clone();
    }

    if (onCameraMove && initialPosition.current) {
      onCameraMove(camera.position.distanceTo(initialPosition.current));
    }
  });

  return null;
}

function CameraDistanceController({
  distance,
}: {
  distance?: number;
}) {
  const { camera } = useThree();

  useFrame(() => {
    if (distance == null) {
      return;
    }

    const direction = camera.position.clone();
    if (direction.lengthSq() < 1e-6) {
      direction.set(0, 0.1, 1);
    }

    const nextPosition = direction.normalize().multiplyScalar(distance);
    camera.position.lerp(nextPosition, 0.18);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

function StarPoints({
  rows,
  highlightPartType,
  onHover,
  animateConvergence,
  convergenceProgress,
}: {
  rows: DataRow[];
  highlightPartType: string | null;
  onHover: (point: HoveredPoint | null) => void;
  animateConvergence: boolean;
  convergenceProgress: number;
}) {
  const geometryData = useMemo(
    () => buildGeometryFromRows(rows, animateConvergence),
    [rows, animateConvergence],
  );
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uConvergenceProgress: { value: 1.0 },
    }),
    [],
  );

  useFrame(() => {
    if (materialRef.current?.uniforms?.uConvergenceProgress) {
      materialRef.current.uniforms.uConvergenceProgress.value = animateConvergence
        ? convergenceProgress
        : 1.0;
    }
  });

  useEffect(() => {
    const attribute = geometryData.geometry.getAttribute("aHighlight") as THREE.BufferAttribute;
    const highlights = attribute.array as Float32Array;

    for (let i = 0; i < highlights.length; i++) {
      if (highlightPartType === null) {
        highlights[i] = 0;
      } else if (geometryData.partTypes[i] === highlightPartType) {
        highlights[i] = 1;
      } else {
        highlights[i] = -1;
      }
    }

    attribute.needsUpdate = true;
  }, [geometryData, highlightPartType]);

  return (
    <>
      <points frustumCulled>
        <primitive object={geometryData.geometry} attach="geometry" />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          blending={THREE.AdditiveBlending}
          transparent
          depthWrite={false}
          uniforms={uniforms}
        />
      </points>
      <PointCloudPicker rows={rows} positions={geometryData.positions} onHover={onHover} />
    </>
  );
}

export default function PointCloudHero({
  csvUrl,
  className,
  background = "#02040a",
  showLegend = true,
  showOverlay = true,
  enableZoom = true,
  allowPageScrollOnWheel = false,
  highlightPartType: controlledHighlightPartType,
  onHighlightPartTypeChange,
  partTypeLabels,
  legendTitle,
  animateConvergence = false,
  convergenceProgress = 1.0,
  controlledCameraDistance,
  onCameraMove,
}: PointCloudHeroProps) {
  const { rows, error, loading } = useCSV(csvUrl);
  const [hoveredData, setHoveredData] = useState<HoveredPoint | null>(null);
  const [screenPos, setScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [internalHighlightPartType, setInternalHighlightPartType] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [webglSupport, setWebglSupport] = useState<{ supported: boolean; error?: string } | null>(
    null,
  );
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);

  const highlightPartType =
    controlledHighlightPartType === undefined
      ? internalHighlightPartType
      : controlledHighlightPartType;

  const updateHighlightPartType = (nextPartType: string | null) => {
    if (controlledHighlightPartType === undefined) {
      setInternalHighlightPartType(nextPartType);
    }
    onHighlightPartTypeChange?.(nextPartType);
  };

  useEffect(() => {
    setWebglSupport(checkWebGLSupport());
  }, []);

  useEffect(() => {
    if (!canvasElement || !allowPageScrollOnWheel) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      window.scrollBy({ top: event.deltaY, left: 0, behavior: "auto" });
    };

    canvasElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvasElement.removeEventListener("wheel", handleWheel);
  }, [allowPageScrollOnWheel, canvasElement]);

  const legendItems = useMemo(() => {
    if (!rows || rows.length === 0) {
      return [] as Array<[string, string]>;
    }

    const counts = new Map<string, number>();
    for (const row of rows) {
      const type = (row.part_type || "unknown").toLowerCase();
      counts.set(type, (counts.get(type) || 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([type]) => [type, PART_TYPE_COLORS[type] || fallbackColorForType(type)] as [string, string]);
  }, [rows]);

  const defaultLegendTitle = useMemo(() => {
    if (!legendItems.length) {
      return "Part Types";
    }

    const clusterCount = legendItems.filter(([type]) => type.startsWith("cluster_")).length;
    return clusterCount >= Math.ceil(legendItems.length / 2) ? "Similarity Clusters" : "Part Types";
  }, [legendItems]);

  const hoveredTypeLabel =
    hoveredData?.part_type && hoveredData.part_type.toLowerCase().startsWith("cluster_") ? "Cluster" : "Type";

  const showFallback = (webglSupport && !webglSupport.supported) || renderError !== null;
  const fallbackMessage =
    renderError || webglSupport?.error || error || "Unable to render 3D visualization";

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {!showFallback && rows && !loading && !error && (
        <div className="absolute inset-0 z-10">
          <StarFieldErrorBoundary
            onError={(caughtError) =>
              setRenderError(caughtError.message || "An error occurred while rendering the 3D scene")
            }
          >
            <Canvas
              camera={{ fov: 60, near: 0.1, far: 5000, position: [0, 10, 100] }}
              dpr={[1, 2]}
              gl={{
                antialias: false,
                powerPreference: "high-performance",
                alpha: false,
                logarithmicDepthBuffer: true,
              }}
              onCreated={({ gl }) => {
                gl.setClearColor(new THREE.Color(background), 1);
                setCanvasElement(gl.domElement);
              }}
            >
              <color attach="background" args={[background]} />
              <StarPoints
                rows={rows}
                highlightPartType={highlightPartType}
                onHover={setHoveredData}
                animateConvergence={animateConvergence}
                convergenceProgress={convergenceProgress}
              />
              <HoverLabelProjector hoveredData={hoveredData} onScreenPosUpdate={setScreenPos} />
              <EffectComposer multisampling={0}>
                <Bloom
                  intensity={0.2}
                  luminanceThreshold={0.05}
                  luminanceSmoothing={0.2}
                  mipmapBlur
                />
                <Noise opacity={0.05} />
                <Vignette eskil={false} offset={0.2} darkness={0.6} />
              </EffectComposer>
              <CameraDistanceController distance={controlledCameraDistance} />
              <CameraMotionDetector onCameraMove={onCameraMove} />
              <OrbitControls
                enableDamping
                dampingFactor={0.05}
                enablePan={false}
                enableZoom={enableZoom}
                minDistance={50}
                maxDistance={600}
              />
            </Canvas>
          </StarFieldErrorBoundary>
        </div>
      )}

      {!showFallback && rows && !loading && !error && showOverlay && (
        <div className="pointer-events-none absolute left-0 top-0 z-20 p-4 text-sm text-white/80">
          <div className="font-medium">3D Starfield</div>
          <div className="opacity-80">Scroll to zoom, drag to orbit</div>
        </div>
      )}

      {!showFallback && rows && !loading && !error && showLegend && legendItems.length > 0 && (
        <div className="absolute right-4 top-4 z-30 rounded-lg border border-white/20 bg-black/60 p-3 text-white backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{legendTitle || defaultLegendTitle}</span>
            {highlightPartType && (
              <button
                type="button"
                onClick={() => updateHighlightPartType(null)}
                className="rounded border border-white/25 px-2 py-0.5 text-[10px] hover:bg-white/10"
              >
                Clear
              </button>
            )}
          </div>
          <div className="space-y-1 text-xs">
            {legendItems.map(([type, color]) => {
              const active = highlightPartType === type;
              const dimmed = highlightPartType !== null && !active;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateHighlightPartType(active ? null : type)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-1 py-0.5 text-left capitalize transition-opacity",
                    dimmed ? "opacity-35" : "opacity-100",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 6px ${color}`,
                    }}
                  />
                  <span>{partTypeLabels?.[type] || type.replace("_", " ")}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!showFallback && hoveredData && screenPos && (
        <div
          className="pointer-events-none absolute z-40"
          style={{
            left: `${screenPos.x}px`,
            top: `${screenPos.y}px`,
            transform: "translate(-50%, calc(-100% - 20px))",
          }}
        >
          <div className="min-w-[200px] rounded-lg border border-white/50 bg-black/95 px-4 py-3 text-white shadow-2xl">
            <div className="mb-1 break-all text-base font-semibold leading-tight">{hoveredData.name}</div>
            <div className="space-y-1 text-sm text-white/80">
              <div>ID: {hoveredData.id}</div>
              {hoveredData.part_type && (
                <div>{hoveredTypeLabel}: {partTypeLabels?.[hoveredData.part_type.toLowerCase()] || hoveredData.part_type.replace("_", " ")}</div>
              )}
              {hoveredData.source && <div>Source: {hoveredData.source.replace("_", " ")}</div>}
            </div>
          </div>
        </div>
      )}

      {(loading || error || showFallback) && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center px-6 text-center text-sm text-white/80"
          style={{ background }}
        >
          {loading ? "Loading 3D point cloud..." : fallbackMessage}
        </div>
      )}
    </div>
  );
}
