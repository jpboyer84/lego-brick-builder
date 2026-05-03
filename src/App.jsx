import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";

const LEGO_COLORS = {
  red: "#C4281B", blue: "#0055BF", yellow: "#F5CD2F", green: "#237841",
  white: "#F4F4F4", black: "#1B2A34", orange: "#FE8A18", lime: "#A6CA55",
  darkGreen: "#184632", brown: "#583927", tan: "#E4CD9E", darkGray: "#6C6E68",
  lightGray: "#A0A5A9", pink: "#FC97AC", purple: "#6B327B", cyan: "#068BC9",
  darkBlue: "#143044", darkRed: "#720E0F", sand: "#D9BB7B", lavender: "#C9CAE2",
};

const STUD = 0.8;
const BRICK_H = 0.32;

// ═══════════════════════════════════════════
// PIECE GEOMETRY HELPERS (unchanged)
// ═══════════════════════════════════════════

function createMaterial(color, isHighlighted, isGhosted) {
  const mat = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.35, metalness: 0.0, clearcoat: 0.4, clearcoatRoughness: 0.25,
    transparent: isGhosted, opacity: isGhosted ? 0.3 : 1, side: THREE.DoubleSide,
  });
  if (isHighlighted) mat.emissive = color.clone().multiplyScalar(0.2);
  return mat;
}

function createBoxMesh(w, d, h, material) {
  const geo = new THREE.BoxGeometry(w - 0.04, h - 0.02, d - 0.04);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(w / 2, h / 2, d / 2);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function createSlopeMesh(w, d, h, direction, material) {
  let verts;
  switch (direction) {
    case "east": verts = [0,0,0, w,0,0, w,0,d, 0,0,d, w,h,0, w,h,d]; break;
    case "west": verts = [0,0,0, w,0,0, w,0,d, 0,0,d, 0,h,0, 0,h,d]; break;
    case "north": verts = [0,0,0, w,0,0, w,0,d, 0,0,d, 0,h,d, w,h,d]; break;
    case "south": default: verts = [0,0,0, w,0,0, w,0,d, 0,0,d, 0,h,0, w,h,0]; break;
  }
  let indices;
  switch (direction) {
    case "east": indices = [0,2,1, 0,3,2, 1,2,5, 1,5,4, 0,5,3, 0,4,5, 0,1,4, 3,5,2]; break;
    case "west": indices = [0,2,1, 0,3,2, 0,4,5, 0,5,3, 4,1,5, 1,2,5, 0,1,4, 3,5,2]; break;
    case "north": indices = [0,2,1, 0,3,2, 2,5,4, 2,4,3, 0,1,5, 0,5,4, 0,4,3, 1,2,5]; break;
    case "south": default: indices = [0,2,1, 0,3,2, 0,5,1, 0,4,5, 4,2,5, 4,3,2, 0,4,3, 1,2,5]; break;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function createSlopeInvMesh(w, d, h, direction, material) {
  const m = createSlopeMesh(w, d, h, direction, material);
  m.rotation.x = Math.PI; m.position.set(0, h, d);
  return m;
}

function createWedgeMesh(w, d, h, direction, material) {
  let corners;
  switch (direction) {
    case "sw": corners = [[0,0],[w,0],[0,d]]; break;
    case "se": corners = [[w,0],[w,d],[0,0]]; break;
    case "ne": corners = [[w,d],[0,d],[w,0]]; break;
    case "nw": corners = [[0,d],[0,0],[w,d]]; break;
    default: corners = [[0,0],[w,0],[0,d]];
  }
  const verts = [];
  for (const [x, z] of corners) verts.push(x, 0, z);
  for (const [x, z] of corners) verts.push(x, h, z);
  const indices = [0,2,1, 3,4,5, 0,1,4, 0,4,3, 1,2,5, 1,5,4, 2,0,3, 2,3,5];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function createConeMesh(w, d, h, material) {
  const r = (Math.min(w, d) / 2) * 0.95;
  const geo = new THREE.ConeGeometry(r, h, 24);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(w / 2, h / 2, d / 2);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function createCylinderMesh(w, d, h, material) {
  const r = (Math.min(w, d) / 2) * 0.95;
  const geo = new THREE.CylinderGeometry(r, r, h, 24);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(w / 2, h / 2, d / 2);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function createArchMesh(w, d, h, material) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(w, 0); shape.lineTo(w, h); shape.lineTo(0, h); shape.lineTo(0, 0);
  const hole = new THREE.Path();
  const ah = h * 0.6, ai = w * 0.15;
  hole.moveTo(ai, 0); hole.lineTo(w - ai, 0); hole.lineTo(w - ai, ah * 0.5);
  hole.bezierCurveTo(w - ai, ah, ai, ah, ai, ah * 0.5); hole.lineTo(ai, 0);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function addStuds(group, w, d, h, material, type, direction) {
  const studGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16);
  const sW = Math.round(w / STUD), sD = Math.round(d / STUD);
  for (let sx = 0; sx < sW; sx++) for (let sz = 0; sz < sD; sz++) {
    if (type === "wedge") {
      const cx = sx + 0.5, cz = sz + 0.5, wU = w / STUD, dU = d / STUD;
      let inside = false;
      switch (direction) {
        case "sw": inside = (cx / wU + cz / dU) < 1; break;
        case "se": inside = ((wU - cx) / wU + cz / dU) < 1; break;
        case "ne": inside = ((wU - cx) / wU + (dU - cz) / dU) < 1; break;
        case "nw": inside = (cx / wU + (dU - cz) / dU) < 1; break;
      }
      if (!inside) continue;
    }
    const stud = new THREE.Mesh(studGeo, material);
    stud.position.set(0.4 + sx * STUD, h + 0.06, 0.4 + sz * STUD);
    stud.castShadow = true; group.add(stud);
  }
}

function createPieceGroup(brick, isHighlighted, isGhosted) {
  const color = new THREE.Color(LEGO_COLORS[brick.color] || brick.color || "#C4281B");
  const material = createMaterial(color, isHighlighted, isGhosted);
  const type = brick.type || "brick";
  const w = (brick.width || 1) * STUD, d = (brick.depth || 1) * STUD, h = (brick.height || 1) * BRICK_H;
  const direction = brick.direction || "east";
  const group = new THREE.Group();
  let mesh, hasStuds = false;
  switch (type) {
    case "brick": mesh = createBoxMesh(w, d, h, material); hasStuds = true; break;
    case "tile": mesh = createBoxMesh(w, d, h, material); break;
    case "plate": mesh = createBoxMesh(w, d, h, material); hasStuds = true; break;
    case "slope": mesh = createSlopeMesh(w, d, h, direction, material); break;
    case "slope_inv": mesh = createSlopeInvMesh(w, d, h, direction, material); break;
    case "wedge": mesh = createWedgeMesh(w, d, h, direction, material); hasStuds = true; break;
    case "cone": mesh = createConeMesh(w, d, h, material); break;
    case "cylinder": mesh = createCylinderMesh(w, d, h, material); break;
    case "round_brick": mesh = createCylinderMesh(w, d, h, material); hasStuds = true; break;
    case "arch": mesh = createArchMesh(w, d, h, material); break;
    default: mesh = createBoxMesh(w, d, h, material); hasStuds = true;
  }
  group.add(mesh);
  if (hasStuds) addStuds(group, w, d, h, material, type, direction);
  return group;
}

// ═══════════════════════════════════════════
// 3D RENDERER (unchanged)
// ═══════════════════════════════════════════

const LegoCanvas = forwardRef(function LegoCanvas({ bricks, highlightStep }, ref) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const frameRef = useRef(null);
  const mouseRef = useRef({ isDown: false, lastX: 0, lastY: 0 });
  const rotRef = useRef({ x: -0.4, y: 0.6 });
  const [ready, setReady] = useState(false);

  useImperativeHandle(ref, () => ({
    capture: () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return null;
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      try { return rendererRef.current.domElement.toDataURL("image/png"); } catch { return null; }
    }
  }), []);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    if (mount.clientWidth > 0 && mount.clientHeight > 0) { setReady(true); return; }
    const ro = new ResizeObserver(() => {
      if (mount.clientWidth > 0 && mount.clientHeight > 0) { setReady(true); ro.disconnect(); }
    });
    ro.observe(mount);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!ready || !mountRef.current) return;
    const mount = mountRef.current;
    const w = mount.clientWidth, h = mount.clientHeight;
    const scene = new THREE.Scene(); scene.background = null; sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    camera.position.set(0, 8, 16); camera.lookAt(0, 0, 0); cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(w, h); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement); rendererRef.current = renderer;
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(8, 15, 10); dl.castShadow = true; scene.add(dl);
    scene.add(new THREE.DirectionalLight(0xaaccff, 0.3)).position.set(-5, 5, -8);
    const onResize = () => { const ww = mount.clientWidth, hh = mount.clientHeight; if (!ww || !hh) return; camera.aspect = ww / hh; camera.updateProjectionMatrix(); renderer.setSize(ww, hh); };
    window.addEventListener("resize", onResize);
    const onDown = e => { mouseRef.current.isDown = true; mouseRef.current.lastX = e.clientX || e.touches?.[0]?.clientX || 0; mouseRef.current.lastY = e.clientY || e.touches?.[0]?.clientY || 0; };
    const onMove = e => { if (!mouseRef.current.isDown) return; const x = e.clientX || e.touches?.[0]?.clientX || 0, y = e.clientY || e.touches?.[0]?.clientY || 0; rotRef.current.y += (x - mouseRef.current.lastX) * 0.008; rotRef.current.x = Math.max(-1.2, Math.min(0.2, rotRef.current.x + (y - mouseRef.current.lastY) * 0.008)); mouseRef.current.lastX = x; mouseRef.current.lastY = y; };
    const onUp = () => { mouseRef.current.isDown = false; };
    mount.addEventListener("mousedown", onDown); mount.addEventListener("mousemove", onMove); mount.addEventListener("mouseup", onUp); mount.addEventListener("mouseleave", onUp);
    mount.addEventListener("touchstart", onDown, { passive: true }); mount.addEventListener("touchmove", onMove, { passive: true }); mount.addEventListener("touchend", onUp);
    return () => { window.removeEventListener("resize", onResize); mount.removeEventListener("mousedown", onDown); mount.removeEventListener("mousemove", onMove); mount.removeEventListener("mouseup", onUp); mount.removeEventListener("mouseleave", onUp); mount.removeEventListener("touchstart", onDown); mount.removeEventListener("touchmove", onMove); mount.removeEventListener("touchend", onUp); cancelAnimationFrame(frameRef.current); renderer.dispose(); if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement); };
  }, [ready]);

  useEffect(() => {
    const scene = sceneRef.current, renderer = rendererRef.current, camera = cameraRef.current;
    if (!scene || !renderer || !camera || !bricks || bricks.length === 0) return;

    // Clear old model
    while (scene.children.length > 3) {
      const c = scene.children[3];
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      scene.remove(c);
    }

    // Build the full model into a group
    const fullGroup = new THREE.Group();
    const vis = highlightStep !== undefined ? bricks.filter(b => b.step <= highlightStep) : bricks;
    vis.forEach(brick => {
      const isH = highlightStep !== undefined && brick.step === highlightStep;
      const isG = highlightStep !== undefined && brick.step < highlightStep;
      const pg = createPieceGroup(brick, isH, isG);
      const px = (brick.x || 0) * STUD, py = (brick.y || 0) * BRICK_H, pz = (brick.z || 0) * STUD;
      pg.position.set(px, py, pz);
      fullGroup.add(pg);
    });

    // Use Three.js Box3 to get the TRUE bounding box after all transforms
    const box = new THREE.Box3().setFromObject(fullGroup);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    // Shift the group so its center is at origin
    fullGroup.position.sub(center);
    scene.add(fullGroup);

    // Compute camera distance to fully contain the bounding sphere
    const fovRad = (camera.fov / 2) * Math.PI / 180;
    const radius = sphere.radius || 1;
    const dist = radius / Math.sin(fovRad);  // exact fit
    const padded = dist * 1.3; // 30% padding so it doesn't fill edge-to-edge

    cancelAnimationFrame(frameRef.current);
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      // No auto-rotation — model stays still until the user drags
      const rx = rotRef.current.x, ry = rotRef.current.y;
      // rx controls elevation (negative = looking from above), ry controls horizontal angle
      const cosRx = Math.cos(rx);
      camera.position.x = padded * Math.sin(ry) * cosRx;
      camera.position.y = padded * -Math.sin(rx);
      camera.position.z = padded * Math.cos(ry) * cosRx;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();
  }, [bricks, highlightStep, ready]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%", cursor: "grab", borderRadius: "16px", overflow: "hidden" }} />;
});

// ═══════════════════════════════════════════
// PIECE CARD (unchanged)
// ═══════════════════════════════════════════

function shade(color, pct) {
  let R = parseInt(color.substring(1, 3), 16), G = parseInt(color.substring(3, 5), 16), B = parseInt(color.substring(5, 7), 16);
  R = Math.min(255, Math.max(0, R + Math.round(R * pct / 100)));
  G = Math.min(255, Math.max(0, G + Math.round(G * pct / 100)));
  B = Math.min(255, Math.max(0, B + Math.round(B * pct / 100)));
  return `rgb(${R},${G},${B})`;
}

function PieceCard({ piece }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const color = LEGO_COLORS[piece.color] || piece.color || "#C4281B";
    const type = piece.type || "brick", bw = piece.width || 1, bd = piece.depth || 1;
    const scale = Math.min((w - 20) / (bw * 22 + 10), (h - 20) / (bd * 22 + 18));
    const ox = (w - bw * 22 * scale) / 2, oy = (h - (bd * 22 + 12) * scale) / 2 + 4;
    const brickW = bw * 22 * scale, brickD = bd * 22 * scale, sideH = 12 * scale;
    ctx.save(); ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 1;
    if (type === "cone" || type === "cylinder" || type === "round_brick") {
      const cx = ox + brickW / 2, r = Math.min(brickW, brickD) / 2;
      ctx.fillStyle = shade(color, -25); ctx.beginPath();
      ctx.ellipse(cx, oy + brickD, r, sideH * 0.4, 0, 0, Math.PI); ctx.lineTo(cx + r, oy + brickD - sideH);
      ctx.ellipse(cx, oy + brickD - sideH, r, sideH * 0.4, 0, 0, Math.PI, true); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = type === "cone" ? shade(color, 20) : color; ctx.beginPath();
      ctx.ellipse(cx, oy + brickD - sideH, type === "cone" ? r * 0.2 : r, sideH * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (type === "slope") {
      ctx.fillStyle = shade(color, -25); ctx.beginPath();
      ctx.moveTo(ox, oy + brickD + sideH); ctx.lineTo(ox + brickW, oy + brickD + sideH); ctx.lineTo(ox + brickW, oy);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(ox, oy + brickD); ctx.lineTo(ox + brickW, oy); ctx.lineTo(ox + brickW, oy + brickD);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (type === "wedge") {
      ctx.fillStyle = shade(color, -25); ctx.fillRect(ox, oy + brickD, brickW, sideH); ctx.strokeRect(ox, oy + brickD, brickW, sideH);
      ctx.fillStyle = color; ctx.beginPath();
      const dir = piece.direction || "sw";
      switch (dir) {
        case "sw": ctx.moveTo(ox, oy); ctx.lineTo(ox + brickW, oy); ctx.lineTo(ox, oy + brickD); break;
        case "se": ctx.moveTo(ox + brickW, oy); ctx.lineTo(ox + brickW, oy + brickD); ctx.lineTo(ox, oy); break;
        case "ne": ctx.moveTo(ox + brickW, oy + brickD); ctx.lineTo(ox, oy + brickD); ctx.lineTo(ox + brickW, oy); break;
        case "nw": ctx.moveTo(ox, oy + brickD); ctx.lineTo(ox, oy); ctx.lineTo(ox + brickW, oy + brickD); break;
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = shade(color, -30); ctx.fillRect(ox, oy + brickD, brickW, sideH); ctx.strokeRect(ox, oy + brickD, brickW, sideH);
      ctx.fillStyle = color; ctx.fillRect(ox, oy, brickW, brickD); ctx.strokeRect(ox, oy, brickW, brickD);
      if (type === "brick" || type === "plate") for (let sx = 0; sx < bw; sx++) for (let sz = 0; sz < bd; sz++) {
        ctx.beginPath(); ctx.arc(ox + sx * 22 * scale + 11 * scale, oy + sz * 22 * scale + 11 * scale, 7 * scale, 0, Math.PI * 2);
        ctx.fillStyle = shade(color, 15); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.stroke();
      }
    }
    ctx.restore();
  }, [piece]);
  const typeLabel = (() => { const t = piece.type || "brick", dir = piece.direction ? ` (${piece.direction})` : ""; const m = { brick: "Brick", tile: "Tile", plate: "Plate", slope: `Slope${dir}`, slope_inv: `Inv Slope${dir}`, wedge: `Wedge${dir}`, cone: "Cone", cylinder: "Cylinder", round_brick: "Round Brick", arch: "Arch" }; return m[t] || "Brick"; })();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.06)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
      <canvas ref={canvasRef} width={80} height={60} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#f0f0f0", textTransform: "capitalize" }}>{piece.width}×{piece.depth}{piece.height > 1 ? `×${piece.height}` : ""} {piece.color}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{typeLabel}</div>
      </div>
      <div style={{ fontWeight: 800, fontSize: 20, color: LEGO_COLORS[piece.color] || "#fff", fontFamily: "'Fredoka', sans-serif" }}>×{piece.count}</div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN APP — Conversational flow: home → chat → build
// ═══════════════════════════════════════════
export default function LegoBuilder() {
  const [screen, setScreen] = useState("home");
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [displayMsgs, setDisplayMsgs] = useState([]);
  const [error, setError] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [originalRequest, setOriginalRequest] = useState("");

  const [tweakInput, setTweakInput] = useState("");
  const [isTweaking, setIsTweaking] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  const [buildData, setBuildData] = useState(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showPieces, setShowPieces] = useState(false);

  const buildCanvasRef = useRef(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const loadingMsgs = useMemo(() => [
    "🧱 Sorting through the brick bin...", "🔍 Finding the perfect pieces...",
    "📐 Measuring stud connections...", "🎨 Picking the best colors...",
    "🏗️ Snapping bricks together...", "✨ Adding the finishing touches...",
    "🧠 Thinking like a Master Builder...", "🔺 Adding slopes and wedges...",
  ], []);

  useEffect(() => {
    if (!isGenerating && !isTweaking && !isRefining) return;
    let i = 0; setLoadingMsg(loadingMsgs[0]);
    const iv = setInterval(() => { i = (i + 1) % loadingMsgs.length; setLoadingMsg(loadingMsgs[i]); }, 2200);
    return () => clearInterval(iv);
  }, [isGenerating, isTweaking, isRefining, loadingMsgs]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMsgs, isGenerating]);

  // Focus input after bot responds
  useEffect(() => {
    if (!isGenerating && screen === "chat") inputRef.current?.focus();
  }, [isGenerating, screen]);

  const callAI = useCallback(async (messages) => {
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!r.ok) throw new Error(`API error: ${r.status}`);
    const data = await r.json();
    return data.content?.map(c => c.text || "").join("") || "";
  }, []);

  const processAIResponse = useCallback((rawText, history) => {
    let cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch {
      // If not JSON, show as plain text in chat
      const newDisplay = [...displayMsgs, { role: "bot", text: cleaned }];
      setDisplayMsgs(newDisplay);
      setChatHistory([...history, { role: "assistant", content: cleaned }]);
      return;
    }

    if (parsed.type === "question") {
      const msg = parsed.message || "What should we build?";
      const newDisplay = [...displayMsgs, { role: "bot", text: msg }];
      setDisplayMsgs(newDisplay);
      setChatHistory([...history, { role: "assistant", content: JSON.stringify(parsed) }]);
    } else if (parsed.type === "build" && parsed.bricks) {
      setChatHistory([...history, { role: "assistant", content: JSON.stringify(parsed) }]);
      setBuildData(parsed);
      setCurrentStep(-1);
      setScreen("build");
    } else {
      const newDisplay = [...displayMsgs, { role: "bot", text: "Hmm, something went sideways. Try telling me what you want to build!" }];
      setDisplayMsgs(newDisplay);
    }
  }, [displayMsgs]);

  // Start a conversation from home screen
  const handleStartBuild = useCallback(async (customInput) => {
    const val = (customInput || input).trim();
    if (!val || isGenerating) return;
    setInput("");
    setError(null);
    setOriginalRequest(val);

    const userMsg = { role: "user", content: val };
    const newHistory = [userMsg];
    setChatHistory(newHistory);
    setDisplayMsgs([{ role: "user", text: val }]);
    setScreen("chat");
    setIsGenerating(true);

    try {
      const rawText = await callAI(newHistory);
      processAIResponse(rawText, newHistory);
    } catch (err) {
      setError("Oops! BrickBot tripped over a brick. Try again!");
      console.error(err);
    }
    setIsGenerating(false);
  }, [input, isGenerating, callAI, processAIResponse]);

  // Send a message in the chat
  const handleSendMessage = useCallback(async () => {
    const val = input.trim();
    if (!val || isGenerating) return;
    setInput("");
    setError(null);

    const userMsg = { role: "user", content: val };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setDisplayMsgs(prev => [...prev, { role: "user", text: val }]);
    setIsGenerating(true);

    try {
      // Build API messages — only send content strings, not JSON objects for assistant turns
      const apiMessages = newHistory.map(m => ({ role: m.role, content: m.content }));
      const rawText = await callAI(apiMessages);
      processAIResponse(rawText, newHistory);
    } catch (err) {
      setError("Oops! BrickBot tripped over a brick. Try again!");
      console.error(err);
    }
    setIsGenerating(false);
  }, [input, isGenerating, chatHistory, callAI, processAIResponse]);

  const handleTweak = useCallback(async () => {
    const val = tweakInput.trim();
    if (!val || isTweaking || !buildData) return;
    setIsTweaking(true); setError(null); setTweakInput("");
    try {
      const tweakMessages = [{
        role: "user",
        content: `I have this LEGO build called "${buildData.name}" with ${buildData.bricks?.length || 0} pieces: ${JSON.stringify(buildData)}\n\nThe kid wants this change: "${val}"\n\nGenerate an updated version. Keep roughly the same number of pieces. Use slopes, wedges, cones, cylinders. Respond with ONLY a JSON object: {"type": "build", "name": "...", "description": "...", "bricks": [...], "steps": [...]}. No markdown.`
      }];
      const rawText = await callAI(tweakMessages);
      const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.bricks) { parsed.type = "build"; setBuildData(parsed); setCurrentStep(-1); }
    } catch (err) { setError("Couldn't make that change — try describing it differently!"); }
    setIsTweaking(false);
  }, [tweakInput, isTweaking, buildData, callAI]);

  const handleRefine = useCallback(async () => {
    if (isRefining || !buildData || !buildCanvasRef.current?.capture) return;
    const imageDataUrl = buildCanvasRef.current.capture();
    if (!imageDataUrl) return;
    setIsRefining(true); setError(null);
    try {
      const r = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ build: buildData, imageDataUrl, originalRequest, difficulty: `about ${buildData.bricks?.length || 50} pieces` }),
      });
      if (!r.ok) throw new Error(`Refine error ${r.status}`);
      const data = await r.json();
      const text = data.content?.map(c => c.text || "").join("") || "";
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.bricks) { parsed.type = "build"; setBuildData(parsed); setCurrentStep(-1); }
    } catch (err) { setError("Refinement failed — give it another shot!"); }
    setIsRefining(false);
  }, [isRefining, buildData, originalRequest]);

  const pieces = useMemo(() => {
    if (!buildData?.bricks) return [];
    const map = {};
    buildData.bricks.forEach(b => {
      const t = b.type || "brick", dir = b.direction || "";
      const key = `${t}-${b.width}x${b.depth}x${b.height || 1}-${b.color}-${dir}`;
      if (!map[key]) map[key] = { type: t, direction: b.direction, width: b.width, depth: b.depth, height: b.height || 1, color: b.color, count: 0 };
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [buildData]);

  const totalSteps = buildData?.steps?.length || 0;
  const currentStepData = buildData?.steps?.[currentStep];

  const resetAll = () => {
    setScreen("home"); setBuildData(null); setChatHistory([]); setDisplayMsgs([]);
    setShowPieces(false); setError(null); setTweakInput(""); setCurrentStep(-1);
    setOriginalRequest(""); setInput("");
  };

  // ═══════════ HOME ═══════════
  if (screen === "home") {
    return (
      <div style={S.container}>
        <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <div style={S.homeWrapper}>
          <div style={{ textAlign: "center", paddingTop: 20 }}>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
              {["red", "yellow", "blue", "green", "orange"].map((c, i) => (
                <div key={i} style={{ width: 36, height: 22, borderRadius: 4, background: LEGO_COLORS[c], boxShadow: "0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)", animation: "brickBounce 1.5s ease-in-out infinite", animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <h1 style={S.title}>Brick Builder</h1>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", margin: "8px 0 0", maxWidth: 480, marginInline: "auto" }}>
              Tell me what you want to build and I'll design a real LEGO model with step-by-step instructions!
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={S.inputWrapper}>
              <input style={S.mainInput} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleStartBuild()} placeholder="What should we build? 🧱" />
              <button style={{ ...S.goButton, opacity: !input.trim() ? 0.5 : 1 }} onClick={() => handleStartBuild()} disabled={!input.trim()}>
                Let's Go! 🚀
              </button>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <p style={S.ideasLabel}>Need ideas? Tap one:</p>
            <div style={S.ideasGrid}>
              {[["🚀", "Star Wars X-Wing"], ["🏰", "Medieval castle"], ["🚗", "Race car"], ["🏠", "Cozy house"], ["🌳", "Treehouse"], ["🤖", "Friendly robot"]].map(([emoji, idea], i) => (
                <button key={i} style={S.ideaChip} onClick={() => { setInput(idea); handleStartBuild(idea); }}>
                  <span style={{ fontSize: 20 }}>{emoji}</span><span>{idea}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════ CHAT ═══════════
  if (screen === "chat") {
    return (
      <div style={S.container}>
        <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <div style={S.chatWrapper}>
          <div style={S.chatHeader}>
            <button style={S.backBtn} onClick={resetAll}>← Back</button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "center" }}>
              <span style={{ fontSize: 28 }}>🤖</span>
              <h2 style={S.chatTitle}>BrickBot</h2>
            </div>
            <div style={{ width: 70 }} />
          </div>

          <div style={S.chatMessages}>
            {displayMsgs.map((m, i) => (
              <div key={i} style={m.role === "user" ? S.userRow : S.botRow}>
                {m.role === "bot" && <div style={S.botAvatarWrap}>🤖</div>}
                <div style={m.role === "user" ? S.userBubble : S.botBubble}>{m.text}</div>
              </div>
            ))}

            {isGenerating && (
              <div style={S.botRow}>
                <div style={S.botAvatarWrap}>🤖</div>
                <div style={S.botBubble}>
                  <div style={S.typingDots}><span style={{ ...S.dot, animationDelay: "0s" }}>●</span><span style={{ ...S.dot, animationDelay: "0.2s" }}>●</span><span style={{ ...S.dot, animationDelay: "0.4s" }}>●</span></div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>{loadingMsg}</div>
                </div>
              </div>
            )}

            {error && <div style={{ ...S.error, margin: "0 16px" }}>{error}</div>}
            <div ref={chatEndRef} />
          </div>

          <div style={S.chatInputRow}>
            <input ref={inputRef} style={S.chatInput} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSendMessage()} placeholder="Type your answer..." disabled={isGenerating} autoFocus />
            <button style={{ ...S.chatSend, opacity: (!input.trim() || isGenerating) ? 0.5 : 1 }} onClick={handleSendMessage} disabled={!input.trim() || isGenerating}>Send</button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════ BUILD ═══════════
  return (
    <div style={S.container}>
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <div style={S.buildWrapper}>
        <div style={S.buildHeader}>
          <button style={S.backBtn} onClick={resetAll}>← New Build</button>
          <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
            <h2 style={S.buildTitle}>{buildData?.name || "Your Build"}</h2>
            <p style={S.buildDesc}>{buildData?.description}</p>
          </div>
          <button style={{ ...S.piecesToggle, background: showPieces ? LEGO_COLORS.red : "rgba(255,255,255,0.1)" }} onClick={() => setShowPieces(!showPieces)}>📦</button>
        </div>

        <div style={S.buildBody}>
          <div style={S.canvasArea}>
            <LegoCanvas ref={buildCanvasRef} bricks={buildData?.bricks || []} highlightStep={currentStep === -1 ? undefined : currentStep + 1} />
            <div style={S.canvasHint}>🖱️ Drag to rotate</div>
          </div>
          {showPieces && (
            <div style={S.piecesPanel}>
              <h3 style={S.piecesPanelTitle}>📦 Pieces Needed</h3>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600, marginBottom: 8 }}>{buildData?.bricks?.length || 0} pieces • {pieces.length} types</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{pieces.map((p, i) => <PieceCard key={i} piece={p} />)}</div>
            </div>
          )}
        </div>

        <div style={S.stepsBar}>
          <div style={S.stepProgress}>
            <button onClick={() => setCurrentStep(-1)} style={{ ...S.stepDot, background: currentStep === -1 ? LEGO_COLORS.yellow : "rgba(255,255,255,0.15)", transform: currentStep === -1 ? "scale(1.3)" : "scale(1)", color: currentStep === -1 ? "#1B2A34" : "rgba(255,255,255,0.5)", fontSize: 11, width: 32 }}>★</button>
            {buildData?.steps?.map((_, i) => (
              <button key={i} onClick={() => setCurrentStep(i)} style={{ ...S.stepDot, background: i === currentStep ? LEGO_COLORS.yellow : (currentStep > -1 && i < currentStep) ? LEGO_COLORS.green : "rgba(255,255,255,0.15)", transform: i === currentStep ? "scale(1.3)" : "scale(1)", color: (i === currentStep || (currentStep > -1 && i < currentStep)) ? "#1B2A34" : "rgba(255,255,255,0.5)" }}>{i + 1}</button>
            ))}
          </div>

          {currentStep === -1 ? (
            <div style={S.stepCard}>
              <div style={S.stepHeader}>
                <span style={{ ...S.stepBadge, background: "rgba(168,255,120,0.2)", color: "#a8ff78" }}>★ Finished Build</span>
                <h3 style={S.stepTitle}>This is what you're building!</h3>
              </div>
              <p style={S.stepDesc}>Spin it around and check it out! Tap "Start Building" when you're ready.</p>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 600, marginTop: 6 }}>{buildData?.bricks?.length || 0} pieces • {totalSteps} steps</div>
            </div>
          ) : (
            <div style={S.stepCard}>
              <div style={S.stepHeader}>
                <span style={S.stepBadge}>Step {currentStep + 1} / {totalSteps}</span>
                <h3 style={S.stepTitle}>{currentStepData?.title}</h3>
              </div>
              <p style={S.stepDesc}>{currentStepData?.description}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {currentStepData?.brickIds?.map(id => {
                  const b = buildData.bricks.find(br => br.id === id);
                  if (!b) return null;
                  const t = b.type || "brick";
                  return <span key={id} style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: `1px solid ${LEGO_COLORS[b.color] || "#fff"}`, color: LEGO_COLORS[b.color] || "#fff", textTransform: "capitalize" }}>{b.width}×{b.depth} {b.color} {t !== "brick" ? t : ""}</span>;
                })}
              </div>
            </div>
          )}

          {currentStep === -1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={S.tweakInput} value={tweakInput} onChange={e => setTweakInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleTweak()} placeholder="Want changes? e.g. make it red, add wings..." disabled={isTweaking || isRefining} />
                <button style={{ ...S.tweakBtn, opacity: (!tweakInput.trim() || isTweaking || isRefining) ? 0.5 : 1 }} onClick={handleTweak} disabled={!tweakInput.trim() || isTweaking || isRefining}>
                  {isTweaking ? "✨ ..." : "✏️ Tweak"}
                </button>
                <button style={{ ...S.refineBtn, opacity: (isRefining || isTweaking) ? 0.5 : 1 }} onClick={handleRefine} disabled={isRefining || isTweaking} title="AI looks at the build and improves it">
                  {isRefining ? "👁️ ..." : "👁️ Refine"}
                </button>
              </div>
              {(isTweaking || isRefining) && <div style={S.loadingBar}><div style={S.loadingFill} /><span style={S.loadingText}>{loadingMsg}</span></div>}
              {error && <div style={S.error}>{error}</div>}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {currentStep === -1 ? (
              <button style={{ ...S.navBtn, ...S.navBtnPrimary, padding: "12px 32px", fontSize: 16 }} onClick={() => setCurrentStep(0)}>🧱 Start Building →</button>
            ) : (
              <>
                <button style={{ ...S.navBtn, opacity: currentStep === 0 ? 0.5 : 1 }} onClick={() => setCurrentStep(currentStep === 0 ? -1 : currentStep - 1)}>{currentStep === 0 ? "← Preview" : "← Prev"}</button>
                <button style={{ ...S.navBtn, ...S.navBtnPrimary, opacity: currentStep >= totalSteps - 1 ? 0.3 : 1 }} onClick={() => setCurrentStep(Math.min(totalSteps - 1, currentStep + 1))} disabled={currentStep >= totalSteps - 1}>Next →</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── STYLES ───
const S = {
  container: { width: "100%", minHeight: "100vh", background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)", fontFamily: "'Nunito', sans-serif", color: "#f0f0f0", overflow: "hidden" },
  title: { fontFamily: "'Fredoka', sans-serif", fontSize: "clamp(36px, 8vw, 56px)", fontWeight: 700, background: "linear-gradient(135deg, #F5CD2F, #FE8A18, #C4281B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0, lineHeight: 1.1 },
  homeWrapper: { maxWidth: 720, margin: "0 auto", padding: "40px 20px 60px", display: "flex", flexDirection: "column", gap: 32 },
  inputWrapper: { display: "flex", gap: 10, background: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 6, border: "2px solid rgba(255,255,255,0.1)" },
  mainInput: { flex: 1, padding: "14px 18px", fontSize: 16, background: "transparent", border: "none", outline: "none", color: "#fff", fontFamily: "'Nunito', sans-serif", fontWeight: 600 },
  goButton: { padding: "12px 24px", fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg, #C4281B, #FE8A18)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontFamily: "'Fredoka', sans-serif", whiteSpace: "nowrap" },
  ideasLabel: { fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 },
  ideasGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 },
  ideaChip: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, cursor: "pointer", color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: 600, fontFamily: "'Nunito', sans-serif", textAlign: "left" },
  chatWrapper: { maxWidth: 600, margin: "0 auto", height: "100vh", display: "flex", flexDirection: "column" },
  chatHeader: { display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)", flexShrink: 0 },
  chatTitle: { fontFamily: "'Fredoka', sans-serif", fontSize: 22, fontWeight: 600, margin: 0, color: "#F5CD2F" },
  chatMessages: { flex: 1, overflow: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16 },
  userRow: { display: "flex", justifyContent: "flex-end" },
  botRow: { display: "flex", alignItems: "flex-start", gap: 10 },
  botAvatarWrap: { width: 36, height: 36, borderRadius: "50%", background: "rgba(245,205,47,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 },
  userBubble: { background: "linear-gradient(135deg, #0055BF, #068BC9)", padding: "12px 18px", borderRadius: "18px 18px 4px 18px", maxWidth: "80%", fontSize: 15, fontWeight: 600, lineHeight: 1.5 },
  botBubble: { background: "rgba(255,255,255,0.08)", padding: "12px 18px", borderRadius: "18px 18px 18px 4px", maxWidth: "85%", fontSize: 15, fontWeight: 600, lineHeight: 1.5 },
  typingDots: { display: "flex", gap: 4, alignItems: "center" },
  dot: { fontSize: 16, color: "rgba(255,255,255,0.5)", animation: "dotPulse 1.2s ease-in-out infinite" },
  chatInputRow: { display: "flex", gap: 8, padding: "12px 16px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.15)", flexShrink: 0 },
  chatInput: { flex: 1, padding: "14px 18px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, color: "#fff", fontSize: 16, fontFamily: "'Nunito', sans-serif", fontWeight: 600, outline: "none" },
  chatSend: { padding: "14px 22px", background: "linear-gradient(135deg, #C4281B, #FE8A18)", color: "#fff", border: "none", borderRadius: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Fredoka', sans-serif", fontSize: 15 },
  backBtn: { padding: "8px 14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", whiteSpace: "nowrap" },
  error: { padding: "10px 16px", background: "rgba(196,40,27,0.2)", borderRadius: 10, fontSize: 14, color: "#ff8a80", fontWeight: 600 },
  loadingBar: { position: "relative", height: 36, background: "rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  loadingFill: { position: "absolute", left: 0, top: 0, height: "100%", width: "100%", background: "linear-gradient(90deg, transparent, rgba(245,205,47,0.15), transparent)", animation: "shimmer 2s ease-in-out infinite" },
  loadingText: { position: "relative", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)" },
  buildWrapper: { height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  buildHeader: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 },
  buildTitle: { fontFamily: "'Fredoka', sans-serif", fontSize: 18, fontWeight: 600, margin: 0, color: "#F5CD2F" },
  buildDesc: { fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0 },
  piecesToggle: { padding: "8px 14px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, color: "#fff", fontSize: 16, cursor: "pointer", fontFamily: "'Nunito', sans-serif" },
  buildBody: { flex: 1, display: "flex", overflow: "hidden", minHeight: 0 },
  canvasArea: { flex: 1, position: "relative", minWidth: 0 },
  canvasHint: { position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 600, pointerEvents: "none" },
  piecesPanel: { width: 280, flexShrink: 0, background: "rgba(0,0,0,0.3)", borderLeft: "1px solid rgba(255,255,255,0.08)", padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 8 },
  piecesPanelTitle: { fontFamily: "'Fredoka', sans-serif", fontSize: 16, fontWeight: 600, margin: 0, color: "#F5CD2F" },
  stepsBar: { flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)", padding: "12px 16px 16px" },
  stepProgress: { display: "flex", justifyContent: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" },
  stepDot: { width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "'Fredoka', sans-serif", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" },
  stepCard: { background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "14px 18px", marginBottom: 10 },
  stepHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  stepBadge: { fontSize: 11, fontWeight: 700, background: "rgba(245,205,47,0.2)", color: "#F5CD2F", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" },
  stepTitle: { fontFamily: "'Fredoka', sans-serif", fontSize: 16, fontWeight: 600, margin: 0 },
  stepDesc: { fontSize: 14, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.5 },
  tweakInput: { flex: 1, minWidth: 200, padding: "12px 16px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 14, fontFamily: "'Nunito', sans-serif", fontWeight: 600, outline: "none" },
  tweakBtn: { padding: "12px 18px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "'Fredoka', sans-serif", fontSize: 14, whiteSpace: "nowrap" },
  refineBtn: { padding: "12px 18px", background: "linear-gradient(135deg, #6B327B, #C9CAE2)", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "'Fredoka', sans-serif", fontSize: 14, whiteSpace: "nowrap" },
  navBtn: { padding: "10px 20px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif" },
  navBtnPrimary: { background: "linear-gradient(135deg, #0055BF, #068BC9)", borderColor: "transparent" },
};

if (typeof document !== "undefined") {
  const s = document.createElement("style");
  s.textContent = `
    @keyframes brickBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
    @keyframes dotPulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
    input::placeholder { color: rgba(255,255,255,0.3) !important; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
    button:not(:disabled):hover { filter: brightness(1.1); }
  `;
  document.head.appendChild(s);
}
