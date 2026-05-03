import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as THREE from "three";

// ─── LEGO COLOR PALETTE ───
const LEGO_COLORS = {
  red: "#C4281B",
  blue: "#0055BF",
  yellow: "#F5CD2F",
  green: "#237841",
  white: "#F4F4F4",
  black: "#1B2A34",
  orange: "#FE8A18",
  lime: "#A6CA55",
  darkGreen: "#184632",
  brown: "#583927",
  tan: "#E4CD9E",
  darkGray: "#6C6E68",
  lightGray: "#A0A5A9",
  pink: "#FC97AC",
  purple: "#6B327B",
  cyan: "#068BC9",
  darkBlue: "#143044",
  darkRed: "#720E0F",
  sand: "#D9BB7B",
  lavender: "#C9CAE2",
};

const COLOR_NAMES = Object.keys(LEGO_COLORS);

// ─── 3D LEGO BRICK RENDERER ───
function LegoCanvas({ bricks, highlightStep, rotateAuto, onLoaded }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const frameRef = useRef(null);
  const mouseRef = useRef({ isDown: false, lastX: 0, lastY: 0 });
  const rotRef = useRef({ x: -0.5, y: 0.5 });

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 1000);
    camera.position.set(0, 12, 20);
    camera.lookAt(0, 3, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(8, 15, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0xaaccff, 0.3);
    rimLight.position.set(-5, 5, -8);
    scene.add(rimLight);

    const handleResize = () => {
      const ww = mount.clientWidth;
      const hh = mount.clientHeight;
      camera.aspect = ww / hh;
      camera.updateProjectionMatrix();
      renderer.setSize(ww, hh);
    };
    window.addEventListener("resize", handleResize);

    const onMouseDown = (e) => {
      mouseRef.current.isDown = true;
      mouseRef.current.lastX = e.clientX || e.touches?.[0]?.clientX || 0;
      mouseRef.current.lastY = e.clientY || e.touches?.[0]?.clientY || 0;
    };
    const onMouseMove = (e) => {
      if (!mouseRef.current.isDown) return;
      const x = e.clientX || e.touches?.[0]?.clientX || 0;
      const y = e.clientY || e.touches?.[0]?.clientY || 0;
      rotRef.current.y += (x - mouseRef.current.lastX) * 0.008;
      rotRef.current.x += (y - mouseRef.current.lastY) * 0.008;
      rotRef.current.x = Math.max(-1.2, Math.min(0.2, rotRef.current.x));
      mouseRef.current.lastX = x;
      mouseRef.current.lastY = y;
    };
    const onMouseUp = () => { mouseRef.current.isDown = false; };

    mount.addEventListener("mousedown", onMouseDown);
    mount.addEventListener("mousemove", onMouseMove);
    mount.addEventListener("mouseup", onMouseUp);
    mount.addEventListener("mouseleave", onMouseUp);
    mount.addEventListener("touchstart", onMouseDown, { passive: true });
    mount.addEventListener("touchmove", onMouseMove, { passive: true });
    mount.addEventListener("touchend", onMouseUp);

    return () => {
      window.removeEventListener("resize", handleResize);
      mount.removeEventListener("mousedown", onMouseDown);
      mount.removeEventListener("mousemove", onMouseMove);
      mount.removeEventListener("mouseup", onMouseUp);
      mount.removeEventListener("mouseleave", onMouseUp);
      mount.removeEventListener("touchstart", onMouseDown);
      mount.removeEventListener("touchmove", onMouseMove);
      mount.removeEventListener("touchend", onMouseUp);
      cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!scene || !renderer || !camera) return;

    while (scene.children.length > 3) {
      const child = scene.children[3];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      scene.remove(child);
    }

    const group = new THREE.Group();
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;

    const visibleBricks = highlightStep !== undefined
      ? bricks.filter((b) => b.step <= highlightStep)
      : bricks;

    visibleBricks.forEach((brick) => {
      const bw = (brick.width || 1);
      const bd = (brick.depth || 1);
      const bh = (brick.height || 1);
      const unitW = bw * 0.8;
      const unitD = bd * 0.8;
      const unitH = bh * 0.32;

      const color = new THREE.Color(LEGO_COLORS[brick.color] || brick.color || "#C4281B");
      const isHighlighted = highlightStep !== undefined && brick.step === highlightStep;
      const isGhosted = highlightStep !== undefined && brick.step < highlightStep;

      const mat = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.35,
        metalness: 0.0,
        clearcoat: 0.4,
        clearcoatRoughness: 0.25,
        transparent: isGhosted,
        opacity: isGhosted ? 0.3 : 1,
      });

      if (isHighlighted) {
        mat.emissive = color.clone().multiplyScalar(0.2);
      }

      const brickGeo = new THREE.BoxGeometry(unitW - 0.04, unitH - 0.02, unitD - 0.04);
      const brickMesh = new THREE.Mesh(brickGeo, mat);
      const px = (brick.x || 0) * 0.8;
      const py = (brick.y || 0) * 0.32;
      const pz = (brick.z || 0) * 0.8;
      brickMesh.position.set(px, py + unitH / 2, pz);
      brickMesh.castShadow = true;
      brickMesh.receiveShadow = true;
      group.add(brickMesh);

      // Studs
      const studGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16);
      for (let sx = 0; sx < bw; sx++) {
        for (let sz = 0; sz < bd; sz++) {
          const stud = new THREE.Mesh(studGeo, mat);
          stud.position.set(
            px - (unitW / 2) + 0.4 + sx * 0.8,
            py + unitH + 0.06,
            pz - (unitD / 2) + 0.4 + sz * 0.8
          );
          stud.castShadow = true;
          group.add(stud);
        }
      }

      minX = Math.min(minX, px - unitW / 2);
      maxX = Math.max(maxX, px + unitW / 2);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py + unitH);
      minZ = Math.min(minZ, pz - unitD / 2);
      maxZ = Math.max(maxZ, pz + unitD / 2);
    });

    scene.add(group);

    const cx = (minX + maxX) / 2 || 0;
    const cy = (minY + maxY) / 2 || 0;
    const cz = (minZ + maxZ) / 2 || 0;
    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 4);
    const dist = size * 2.2;

    cancelAnimationFrame(frameRef.current);
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      if (rotateAuto && !mouseRef.current.isDown) {
        rotRef.current.y += 0.004;
      }
      camera.position.x = cx + dist * Math.sin(rotRef.current.y) * Math.cos(rotRef.current.x);
      camera.position.y = cy + dist * Math.sin(-rotRef.current.x) + size * 0.5;
      camera.position.z = cz + dist * Math.cos(rotRef.current.y) * Math.cos(rotRef.current.x);
      camera.lookAt(cx, cy, cz);
      renderer.render(scene, camera);
    };
    animate();
    if (onLoaded) onLoaded();
  }, [bricks, highlightStep, rotateAuto, onLoaded]);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100%",
        cursor: "grab",
        borderRadius: "16px",
        overflow: "hidden",
      }}
    />
  );
}

// ─── PIECE INVENTORY ITEM ───
function PieceCard({ piece }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const color = LEGO_COLORS[piece.color] || piece.color || "#C4281B";
    const bw = piece.width || 1;
    const bd = piece.depth || 1;

    const scale = Math.min((w - 20) / (bw * 22 + 10), (h - 20) / (bd * 22 + 18));
    const ox = (w - bw * 22 * scale) / 2;
    const oy = (h - (bd * 22 + 12) * scale) / 2 + 4;

    ctx.save();

    // Top face
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    const topY = oy;
    const brickW = bw * 22 * scale;
    const brickD = bd * 22 * scale;

    // Side face (darker)
    const sideH = 12 * scale;
    ctx.fillStyle = shadeColor(color, -30);
    ctx.fillRect(ox, topY + brickD, brickW, sideH);
    ctx.strokeRect(ox, topY + brickD, brickW, sideH);

    // Top face
    ctx.fillStyle = color;
    ctx.fillRect(ox, topY, brickW, brickD);
    ctx.strokeRect(ox, topY, brickW, brickD);

    // Studs
    for (let sx = 0; sx < bw; sx++) {
      for (let sz = 0; sz < bd; sz++) {
        const studX = ox + sx * 22 * scale + 11 * scale;
        const studY = topY + sz * 22 * scale + 11 * scale;
        const r = 7 * scale;
        ctx.beginPath();
        ctx.arc(studX, studY, r, 0, Math.PI * 2);
        ctx.fillStyle = shadeColor(color, 15);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.stroke();
      }
    }
    ctx.restore();
  }, [piece]);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "10px 14px",
      background: "rgba(255,255,255,0.06)",
      borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <canvas ref={canvasRef} width={80} height={60} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700,
          fontSize: "13px",
          color: "var(--text)",
          textTransform: "capitalize",
        }}>
          {piece.width}×{piece.depth}{piece.height > 1 ? `×${piece.height}` : ""} {piece.color}
        </div>
        <div style={{ fontSize: "12px", color: "var(--textDim)", marginTop: "2px" }}>
          {piece.label || "Brick"}
        </div>
      </div>
      <div style={{
        fontWeight: 800,
        fontSize: "20px",
        color: LEGO_COLORS[piece.color] || "#fff",
        fontFamily: "'Fredoka', sans-serif",
      }}>
        ×{piece.count}
      </div>
    </div>
  );
}

function shadeColor(color, percent) {
  let R = parseInt(color.substring(1, 3), 16);
  let G = parseInt(color.substring(3, 5), 16);
  let B = parseInt(color.substring(5, 7), 16);
  R = Math.min(255, Math.max(0, R + Math.round(R * percent / 100)));
  G = Math.min(255, Math.max(0, G + Math.round(G * percent / 100)));
  B = Math.min(255, Math.max(0, B + Math.round(B * percent / 100)));
  return `rgb(${R},${G},${B})`;
}

// ─── MAIN APP ───

export default function LegoBuilder() {
  const [screen, setScreen] = useState("home");
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [buildData, setBuildData] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [chatHistory, setChatHistory] = useState([]);
  const [error, setError] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [showPieces, setShowPieces] = useState(false);

  const loadingMsgs = useMemo(() => [
    "🧱 Sorting through the brick bin...",
    "🔍 Finding the perfect pieces...",
    "📐 Measuring stud connections...",
    "🎨 Picking the best colors...",
    "🏗️ Snapping bricks together...",
    "✨ Adding the finishing touches...",
    "🧠 Thinking like a Master Builder...",
    "📋 Writing the instructions...",
  ], []);

  useEffect(() => {
    if (!isGenerating) return;
    let i = 0;
    setLoadingMsg(loadingMsgs[0]);
    const interval = setInterval(() => {
      i = (i + 1) % loadingMsgs.length;
      setLoadingMsg(loadingMsgs[i]);
    }, 2200);
    return () => clearInterval(interval);
  }, [isGenerating, loadingMsgs]);

  const callAI = useCallback(async (messages) => {
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      const text = data.content?.map(c => c.text || "").join("") || "";
      return text;
    } catch (err) {
      throw err;
    }
  }, []);

  const handleSubmit = useCallback(async (customInput) => {
    const val = (customInput || input).trim();
    if (!val || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setInput("");

    const newHistory = [...chatHistory, { role: "user", content: val }];
    setChatHistory(newHistory);

    try {
      const apiMessages = newHistory.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await callAI(apiMessages);
      let parsed;
      try {
        const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        setChatHistory([...newHistory, { role: "assistant", content: response }]);
        setIsGenerating(false);
        return;
      }

      if (parsed.type === "question") {
        setChatHistory([...newHistory, { role: "assistant", content: parsed.message }]);
        setScreen("chat");
      } else if (parsed.type === "build") {
        setChatHistory([...newHistory, { role: "assistant", content: JSON.stringify(parsed) }]);
        setBuildData(parsed);
        setCurrentStep(-1);
        setScreen("build");
      }
    } catch (err) {
      setError("Oops! Something went wrong. Try again!");
      console.error(err);
    }
    setIsGenerating(false);
  }, [input, isGenerating, chatHistory, callAI]);

  const pieces = useMemo(() => {
    if (!buildData?.bricks) return [];
    const map = {};
    buildData.bricks.forEach(b => {
      const key = `${b.width}x${b.depth}x${b.height || 1}-${b.color}`;
      if (!map[key]) {
        map[key] = { width: b.width, depth: b.depth, height: b.height || 1, color: b.color, count: 0, label: b.label || "Brick" };
      }
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [buildData]);

  const totalSteps = buildData?.steps?.length || 0;
  const currentStepData = buildData?.steps?.[currentStep];

  // ─── HOME SCREEN ───
  if (screen === "home") {
    return (
      <div style={styles.container}>
        <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <div style={styles.homeWrapper}>
          <div style={styles.heroSection}>
            <div style={styles.logoBlock}>
              <div style={styles.brickRow}>
                {["red", "yellow", "blue", "green", "orange"].map((c, i) => (
                  <div key={i} style={{
                    ...styles.miniBrick,
                    background: LEGO_COLORS[c],
                    animationDelay: `${i * 0.15}s`,
                  }} />
                ))}
              </div>
              <h1 style={styles.title}>Brick Builder</h1>
              <p style={styles.subtitle}>Describe anything and watch it come to life in LEGO bricks!</p>
            </div>
          </div>

          <div style={styles.inputSection}>
            <div style={styles.inputWrapper}>
              <input
                style={styles.mainInput}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="What do you want to build? 🧱"
                disabled={isGenerating}
              />
              <button
                style={{
                  ...styles.goButton,
                  opacity: (!input.trim() || isGenerating) ? 0.5 : 1,
                }}
                onClick={() => handleSubmit()}
                disabled={!input.trim() || isGenerating}
              >
                {isGenerating ? "⏳" : "Build! 🚀"}
              </button>
            </div>
            {isGenerating && (
              <div style={styles.loadingBar}>
                <div style={styles.loadingFill} />
                <span style={styles.loadingText}>{loadingMsg}</span>
              </div>
            )}
            {error && <div style={styles.error}>{error}</div>}
          </div>

          <div style={styles.ideasSection}>
            <p style={styles.ideasLabel}>Need ideas? Try these:</p>
            <div style={styles.ideasGrid}>
              {[
                ["🏠", "A cozy house with a chimney"],
                ["🚀", "A rocket ship"],
                ["🏰", "Medieval castle with towers"],
                ["🚗", "A race car"],
                ["🌳", "A tree with a treehouse"],
                ["🤖", "A friendly robot"],
              ].map(([emoji, idea], i) => (
                <button
                  key={i}
                  style={styles.ideaChip}
                  onClick={() => { setInput(idea); handleSubmit(idea); }}
                  disabled={isGenerating}
                >
                  <span style={{ fontSize: "20px" }}>{emoji}</span>
                  <span>{idea}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── CHAT SCREEN (clarifying questions) ───
  if (screen === "chat") {
    const messages = chatHistory.filter(m => {
      if (m.role === "assistant") {
        try { JSON.parse(m.content); return false; } catch { return true; }
      }
      return true;
    });

    return (
      <div style={styles.container}>
        <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <div style={styles.chatWrapper}>
          <div style={styles.chatHeader}>
            <button style={styles.backBtn} onClick={() => { setScreen("home"); setChatHistory([]); }}>← Back</button>
            <h2 style={styles.chatTitle}>🧱 BrickBot</h2>
          </div>
          <div style={styles.chatMessages}>
            {messages.map((m, i) => (
              <div key={i} style={m.role === "user" ? styles.userMsg : styles.botMsg}>
                {m.role === "assistant" && <span style={styles.botAvatar}>🤖</span>}
                <div style={m.role === "user" ? styles.userBubble : styles.botBubble}>
                  {m.content}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div style={styles.botMsg}>
                <span style={styles.botAvatar}>🤖</span>
                <div style={styles.botBubble}>{loadingMsg}</div>
              </div>
            )}
          </div>
          <div style={styles.chatInputRow}>
            <input
              style={styles.chatInput}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder="Type your answer..."
              disabled={isGenerating}
            />
            <button
              style={styles.chatSend}
              onClick={() => handleSubmit()}
              disabled={!input.trim() || isGenerating}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── BUILD SCREEN ───
  return (
    <div style={styles.container}>
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <div style={styles.buildWrapper}>
        {/* Header */}
        <div style={styles.buildHeader}>
          <button style={styles.backBtn} onClick={() => { setScreen("home"); setBuildData(null); setChatHistory([]); setShowPieces(false); }}>
            ← New Build
          </button>
          <div style={{ textAlign: "center", flex: 1 }}>
            <h2 style={styles.buildTitle}>{buildData?.name || "Your Build"}</h2>
            <p style={styles.buildDesc}>{buildData?.description}</p>
          </div>
          <button
            style={{
              ...styles.piecesToggle,
              background: showPieces ? LEGO_COLORS.red : "rgba(255,255,255,0.1)",
            }}
            onClick={() => setShowPieces(!showPieces)}
          >
            📦 Pieces
          </button>
        </div>

        {/* 3D View + Pieces Panel */}
        <div style={styles.buildBody}>
          <div style={styles.canvasArea}>
            <LegoCanvas
              bricks={buildData?.bricks || []}
              highlightStep={currentStep === -1 ? undefined : currentStep + 1}
              rotateAuto={true}
            />
            <div style={styles.canvasHint}>🖱️ Drag to rotate</div>
          </div>

          {showPieces && (
            <div style={styles.piecesPanel}>
              <h3 style={styles.piecesPanelTitle}>📦 Pieces Needed</h3>
              <div style={styles.piecesCount}>
                {buildData?.bricks?.length || 0} bricks total • {pieces.length} types
              </div>
              <div style={styles.piecesList}>
                {pieces.map((p, i) => <PieceCard key={i} piece={p} />)}
              </div>
            </div>
          )}
        </div>

        {/* Step Instructions */}
        <div style={styles.stepsBar}>
          <div style={styles.stepProgress}>
            <button
              onClick={() => setCurrentStep(-1)}
              style={{
                ...styles.stepDot,
                background: currentStep === -1 ? LEGO_COLORS.yellow : "rgba(255,255,255,0.15)",
                transform: currentStep === -1 ? "scale(1.3)" : "scale(1)",
                color: currentStep === -1 ? "#1B2A34" : "rgba(255,255,255,0.5)",
                fontSize: "11px",
                width: "32px",
              }}
            >
              ★
            </button>
            {buildData?.steps?.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                style={{
                  ...styles.stepDot,
                  background: i === currentStep ? LEGO_COLORS.yellow : (currentStep > -1 && i < currentStep) ? LEGO_COLORS.green : "rgba(255,255,255,0.15)",
                  transform: i === currentStep ? "scale(1.3)" : "scale(1)",
                  color: (i === currentStep || (currentStep > -1 && i < currentStep)) ? "#1B2A34" : "rgba(255,255,255,0.5)",
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {currentStep === -1 ? (
            <div style={styles.stepCard}>
              <div style={styles.stepHeader}>
                <span style={{...styles.stepBadge, background: "rgba(168,255,120,0.2)", color: "#a8ff78"}}>★ Finished Build</span>
                <h3 style={styles.stepTitle}>This is what you're building!</h3>
              </div>
              <p style={styles.stepDesc}>
                Take a good look at the finished model — spin it around to see every angle! When you're ready, hit "Start Building" to begin the step-by-step instructions.
              </p>
              <div style={styles.stepBricks}>
                <span style={{
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.5)",
                  fontWeight: 600,
                }}>
                  {buildData?.bricks?.length || 0} bricks • {totalSteps} steps
                </span>
              </div>
            </div>
          ) : (
            <div style={styles.stepCard}>
              <div style={styles.stepHeader}>
                <span style={styles.stepBadge}>Step {currentStep + 1} of {totalSteps}</span>
                <h3 style={styles.stepTitle}>{currentStepData?.title}</h3>
              </div>
              <p style={styles.stepDesc}>{currentStepData?.description}</p>
              <div style={styles.stepBricks}>
                {currentStepData?.brickIds?.map(id => {
                  const brick = buildData.bricks.find(b => b.id === id);
                  if (!brick) return null;
                  return (
                    <span key={id} style={{
                      ...styles.stepBrickChip,
                      borderColor: LEGO_COLORS[brick.color] || "#fff",
                      color: LEGO_COLORS[brick.color] || "#fff",
                    }}>
                      {brick.width}×{brick.depth} {brick.color}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div style={styles.stepNav}>
            {currentStep === -1 ? (
              <button
                style={{ ...styles.navBtn, ...styles.navBtnPrimary, padding: "12px 32px", fontSize: "16px" }}
                onClick={() => setCurrentStep(0)}
              >
                🧱 Start Building →
              </button>
            ) : (
              <>
                <button
                  style={{ ...styles.navBtn, opacity: currentStep === 0 ? 0.5 : 1 }}
                  onClick={() => setCurrentStep(currentStep === 0 ? -1 : currentStep - 1)}
                >
                  {currentStep === 0 ? "← Preview" : "← Previous"}
                </button>
                <button
                  style={{ ...styles.navBtn, ...styles.navBtnPrimary, opacity: currentStep >= totalSteps - 1 ? 0.3 : 1 }}
                  onClick={() => setCurrentStep(Math.min(totalSteps - 1, currentStep + 1))}
                  disabled={currentStep >= totalSteps - 1}
                >
                  Next Step →
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── STYLES ───
const styles = {
  container: {
    width: "100%",
    minHeight: "100vh",
    background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)",
    fontFamily: "'Nunito', sans-serif",
    color: "#f0f0f0",
    overflow: "hidden",
    "--text": "#f0f0f0",
    "--textDim": "rgba(255,255,255,0.55)",
  },

  // Home
  homeWrapper: {
    maxWidth: "720px",
    margin: "0 auto",
    padding: "40px 20px 60px",
    display: "flex",
    flexDirection: "column",
    gap: "32px",
  },
  heroSection: { textAlign: "center", paddingTop: "20px" },
  logoBlock: { display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" },
  brickRow: { display: "flex", gap: "6px", marginBottom: "8px" },
  miniBrick: {
    width: "36px",
    height: "22px",
    borderRadius: "4px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
    animation: "brickBounce 1.5s ease-in-out infinite",
  },
  title: {
    fontFamily: "'Fredoka', sans-serif",
    fontSize: "clamp(36px, 8vw, 56px)",
    fontWeight: 700,
    background: "linear-gradient(135deg, #F5CD2F, #FE8A18, #C4281B)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: 0,
    lineHeight: 1.1,
  },
  subtitle: {
    fontSize: "16px",
    color: "rgba(255,255,255,0.6)",
    margin: 0,
    maxWidth: "400px",
  },
  inputSection: { display: "flex", flexDirection: "column", gap: "12px" },
  inputWrapper: {
    display: "flex",
    gap: "10px",
    background: "rgba(255,255,255,0.07)",
    borderRadius: "16px",
    padding: "6px",
    border: "2px solid rgba(255,255,255,0.1)",
    transition: "border-color 0.2s",
  },
  mainInput: {
    flex: 1,
    padding: "14px 18px",
    fontSize: "16px",
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#fff",
    fontFamily: "'Nunito', sans-serif",
    fontWeight: 600,
  },
  goButton: {
    padding: "12px 24px",
    fontSize: "15px",
    fontWeight: 700,
    background: "linear-gradient(135deg, #C4281B, #FE8A18)",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontFamily: "'Fredoka', sans-serif",
    whiteSpace: "nowrap",
    transition: "transform 0.15s, opacity 0.2s",
  },
  loadingBar: {
    position: "relative",
    height: "36px",
    background: "rgba(255,255,255,0.06)",
    borderRadius: "10px",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingFill: {
    position: "absolute",
    left: 0,
    top: 0,
    height: "100%",
    width: "100%",
    background: "linear-gradient(90deg, transparent, rgba(245,205,47,0.15), transparent)",
    animation: "shimmer 2s ease-in-out infinite",
  },
  loadingText: {
    position: "relative",
    fontSize: "13px",
    fontWeight: 600,
    color: "rgba(255,255,255,0.7)",
  },
  error: {
    padding: "10px 16px",
    background: "rgba(196,40,27,0.2)",
    borderRadius: "10px",
    fontSize: "14px",
    color: "#ff8a80",
    fontWeight: 600,
  },
  ideasSection: { marginTop: "8px" },
  ideasLabel: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.4)",
    marginBottom: "12px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  ideasGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "8px",
  },
  ideaChip: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    cursor: "pointer",
    color: "rgba(255,255,255,0.8)",
    fontSize: "14px",
    fontWeight: 600,
    fontFamily: "'Nunito', sans-serif",
    textAlign: "left",
    transition: "background 0.2s, border-color 0.2s",
  },

  // Chat
  chatWrapper: {
    maxWidth: "600px",
    margin: "0 auto",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  chatTitle: {
    fontFamily: "'Fredoka', sans-serif",
    fontSize: "20px",
    fontWeight: 600,
    margin: 0,
    color: "#F5CD2F",
  },
  chatMessages: {
    flex: 1,
    overflow: "auto",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  userMsg: { display: "flex", justifyContent: "flex-end" },
  botMsg: { display: "flex", alignItems: "flex-start", gap: "8px" },
  botAvatar: { fontSize: "24px", marginTop: "4px" },
  userBubble: {
    background: "linear-gradient(135deg, #0055BF, #068BC9)",
    padding: "10px 16px",
    borderRadius: "16px 16px 4px 16px",
    maxWidth: "80%",
    fontSize: "15px",
    fontWeight: 600,
  },
  botBubble: {
    background: "rgba(255,255,255,0.08)",
    padding: "10px 16px",
    borderRadius: "16px 16px 16px 4px",
    maxWidth: "80%",
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: 1.5,
  },
  chatInputRow: {
    display: "flex",
    gap: "8px",
    padding: "12px 20px 24px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  chatInput: {
    flex: 1,
    padding: "12px 16px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    color: "#fff",
    fontSize: "15px",
    fontFamily: "'Nunito', sans-serif",
    fontWeight: 600,
    outline: "none",
  },
  chatSend: {
    padding: "12px 20px",
    background: LEGO_COLORS.blue,
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Fredoka', sans-serif",
    fontSize: "14px",
  },

  // Build
  buildWrapper: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  buildHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  backBtn: {
    padding: "8px 14px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Nunito', sans-serif",
    whiteSpace: "nowrap",
  },
  buildTitle: {
    fontFamily: "'Fredoka', sans-serif",
    fontSize: "18px",
    fontWeight: 600,
    margin: 0,
    color: "#F5CD2F",
  },
  buildDesc: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.5)",
    margin: 0,
  },
  piecesToggle: {
    padding: "8px 14px",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "10px",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Nunito', sans-serif",
    whiteSpace: "nowrap",
    transition: "background 0.2s",
  },
  buildBody: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
    position: "relative",
    minHeight: 0,
  },
  canvasArea: {
    flex: 1,
    position: "relative",
    minWidth: 0,
  },
  canvasHint: {
    position: "absolute",
    bottom: "12px",
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: "11px",
    color: "rgba(255,255,255,0.3)",
    fontWeight: 600,
    pointerEvents: "none",
  },
  piecesPanel: {
    width: "280px",
    flexShrink: 0,
    background: "rgba(0,0,0,0.3)",
    borderLeft: "1px solid rgba(255,255,255,0.08)",
    padding: "16px",
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  piecesPanelTitle: {
    fontFamily: "'Fredoka', sans-serif",
    fontSize: "16px",
    fontWeight: 600,
    margin: 0,
    color: "#F5CD2F",
  },
  piecesCount: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.4)",
    fontWeight: 600,
    marginBottom: "4px",
  },
  piecesList: { display: "flex", flexDirection: "column", gap: "6px" },

  // Steps
  stepsBar: {
    flexShrink: 0,
    borderTop: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(0,0,0,0.25)",
    padding: "12px 16px 16px",
  },
  stepProgress: {
    display: "flex",
    justifyContent: "center",
    gap: "6px",
    marginBottom: "12px",
  },
  stepDot: {
    width: "28px",
    height: "28px",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
    fontFamily: "'Fredoka', sans-serif",
    fontSize: "13px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
  },
  stepCard: {
    background: "rgba(255,255,255,0.05)",
    borderRadius: "14px",
    padding: "14px 18px",
    marginBottom: "10px",
  },
  stepHeader: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" },
  stepBadge: {
    fontSize: "11px",
    fontWeight: 700,
    background: "rgba(245,205,47,0.2)",
    color: "#F5CD2F",
    padding: "3px 8px",
    borderRadius: "6px",
    whiteSpace: "nowrap",
  },
  stepTitle: {
    fontFamily: "'Fredoka', sans-serif",
    fontSize: "16px",
    fontWeight: 600,
    margin: 0,
  },
  stepDesc: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.65)",
    margin: 0,
    lineHeight: 1.5,
  },
  stepBricks: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "8px",
  },
  stepBrickChip: {
    fontSize: "11px",
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: "6px",
    border: "1px solid",
    textTransform: "capitalize",
  },
  stepNav: {
    display: "flex",
    gap: "8px",
    justifyContent: "center",
  },
  navBtn: {
    padding: "10px 20px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Nunito', sans-serif",
    transition: "opacity 0.2s",
  },
  navBtnPrimary: {
    background: "linear-gradient(135deg, #0055BF, #068BC9)",
    borderColor: "transparent",
  },
};

// Inject keyframes
if (typeof document !== "undefined") {
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    @keyframes brickBounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    input::placeholder { color: rgba(255,255,255,0.3) !important; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
  `;
  document.head.appendChild(styleEl);
}
