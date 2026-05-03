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

// ─── 3D LEGO BRICK RENDERER ───
function LegoCanvas({ bricks, highlightStep, rotateAuto }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const frameRef = useRef(null);
  const mouseRef = useRef({ isDown: false, lastX: 0, lastY: 0 });
  const rotRef = useRef({ x: -0.5, y: 0.5 });
  const [ready, setReady] = useState(false);

  // Wait for container to have real dimensions
  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    if (mount.clientWidth > 0 && mount.clientHeight > 0) {
      setReady(true);
      return;
    }
    const ro = new ResizeObserver(() => {
      if (mount.clientWidth > 0 && mount.clientHeight > 0) {
        setReady(true);
        ro.disconnect();
      }
    });
    ro.observe(mount);
    return () => ro.disconnect();
  }, []);

  // Initialize Three.js once container is ready
  useEffect(() => {
    if (!ready || !mountRef.current) return;
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
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
      if (ww === 0 || hh === 0) return;
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
  }, [ready]);

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
        color, roughness: 0.35, metalness: 0.0, clearcoat: 0.4, clearcoatRoughness: 0.25,
        transparent: isGhosted, opacity: isGhosted ? 0.3 : 1,
      });
      if (isHighlighted) mat.emissive = color.clone().multiplyScalar(0.2);

      const brickGeo = new THREE.BoxGeometry(unitW - 0.04, unitH - 0.02, unitD - 0.04);
      const brickMesh = new THREE.Mesh(brickGeo, mat);
      const px = (brick.x || 0) * 0.8;
      const py = (brick.y || 0) * 0.32;
      const pz = (brick.z || 0) * 0.8;
      brickMesh.position.set(px, py + unitH / 2, pz);
      brickMesh.castShadow = true;
      brickMesh.receiveShadow = true;
      group.add(brickMesh);

      const studGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16);
      for (let sx = 0; sx < bw; sx++) {
        for (let sz = 0; sz < bd; sz++) {
          const stud = new THREE.Mesh(studGeo, mat);
          stud.position.set(px - (unitW / 2) + 0.4 + sx * 0.8, py + unitH + 0.06, pz - (unitD / 2) + 0.4 + sz * 0.8);
          stud.castShadow = true;
          group.add(stud);
        }
      }

      minX = Math.min(minX, px - unitW / 2); maxX = Math.max(maxX, px + unitW / 2);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py + unitH);
      minZ = Math.min(minZ, pz - unitD / 2); maxZ = Math.max(maxZ, pz + unitD / 2);
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
      if (rotateAuto && !mouseRef.current.isDown) rotRef.current.y += 0.004;
      camera.position.x = cx + dist * Math.sin(rotRef.current.y) * Math.cos(rotRef.current.x);
      camera.position.y = cy + dist * Math.sin(-rotRef.current.x) + size * 0.5;
      camera.position.z = cz + dist * Math.cos(rotRef.current.y) * Math.cos(rotRef.current.x);
      camera.lookAt(cx, cy, cz);
      renderer.render(scene, camera);
    };
    animate();
  }, [bricks, highlightStep, rotateAuto, ready]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%", cursor: "grab", borderRadius: "16px", overflow: "hidden" }} />;
}

// ─── PIECE CARD ───
function PieceCard({ piece }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const color = LEGO_COLORS[piece.color] || piece.color || "#C4281B";
    const bw = piece.width || 1, bd = piece.depth || 1;
    const scale = Math.min((w - 20) / (bw * 22 + 10), (h - 20) / (bd * 22 + 18));
    const ox = (w - bw * 22 * scale) / 2;
    const oy = (h - (bd * 22 + 12) * scale) / 2 + 4;
    ctx.save();
    const topY = oy, brickW = bw * 22 * scale, brickD = bd * 22 * scale, sideH = 12 * scale;
    ctx.fillStyle = shade(color, -30); ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 1;
    ctx.fillRect(ox, topY + brickD, brickW, sideH); ctx.strokeRect(ox, topY + brickD, brickW, sideH);
    ctx.fillStyle = color; ctx.fillRect(ox, topY, brickW, brickD); ctx.strokeRect(ox, topY, brickW, brickD);
    for (let sx = 0; sx < bw; sx++) {
      for (let sz = 0; sz < bd; sz++) {
        ctx.beginPath();
        ctx.arc(ox + sx * 22 * scale + 11 * scale, topY + sz * 22 * scale + 11 * scale, 7 * scale, 0, Math.PI * 2);
        ctx.fillStyle = shade(color, 15); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.stroke();
      }
    }
    ctx.restore();
  }, [piece]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", background: "rgba(255,255,255,0.06)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)" }}>
      <canvas ref={canvasRef} width={80} height={60} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "13px", color: "#f0f0f0", textTransform: "capitalize" }}>{piece.width}×{piece.depth}{piece.height > 1 ? `×${piece.height}` : ""} {piece.color}</div>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginTop: "2px" }}>{piece.label || "Brick"}</div>
      </div>
      <div style={{ fontWeight: 800, fontSize: "20px", color: LEGO_COLORS[piece.color] || "#fff", fontFamily: "'Fredoka', sans-serif" }}>×{piece.count}</div>
    </div>
  );
}

function shade(color, pct) {
  let R = parseInt(color.substring(1, 3), 16), G = parseInt(color.substring(3, 5), 16), B = parseInt(color.substring(5, 7), 16);
  R = Math.min(255, Math.max(0, R + Math.round(R * pct / 100)));
  G = Math.min(255, Math.max(0, G + Math.round(G * pct / 100)));
  B = Math.min(255, Math.max(0, B + Math.round(B * pct / 100)));
  return `rgb(${R},${G},${B})`;
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function LegoBuilder() {
  const [screen, setScreen] = useState("home");
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [error, setError] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState("");

  // Choose screen
  const [easyBuild, setEasyBuild] = useState(null);
  const [advancedBuild, setAdvancedBuild] = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState(null);
  const [tweakInput, setTweakInput] = useState("");
  const [isTweaking, setIsTweaking] = useState(false);
  const [originalRequest, setOriginalRequest] = useState("");

  // Build screen
  const [buildData, setBuildData] = useState(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showPieces, setShowPieces] = useState(false);

  const loadingMsgs = useMemo(() => [
    "🧱 Sorting through the brick bin...", "🔍 Finding the perfect pieces...",
    "📐 Measuring stud connections...", "🎨 Picking the best colors...",
    "🏗️ Snapping bricks together...", "✨ Adding the finishing touches...",
    "🧠 Thinking like a Master Builder...", "📋 Writing the instructions...",
  ], []);

  useEffect(() => {
    if (!isGenerating && !isTweaking) return;
    let i = 0;
    setLoadingMsg(loadingMsgs[0]);
    const iv = setInterval(() => { i = (i + 1) % loadingMsgs.length; setLoadingMsg(loadingMsgs[i]); }, 2200);
    return () => clearInterval(iv);
  }, [isGenerating, isTweaking, loadingMsgs]);

  const callAI = useCallback(async (messages) => {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    return data.content?.map(c => c.text || "").join("") || "";
  }, []);

  // ─── Submit: generates Easy + Advanced ───
  const handleSubmit = useCallback(async (customInput) => {
    const val = (customInput || input).trim();
    if (!val || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    setInput("");
    setOriginalRequest(val);

    const newHistory = [...chatHistory, { role: "user", content: val }];
    setChatHistory(newHistory);

    try {
      const apiMessages = newHistory.map(m => ({ role: m.role, content: m.content }));
      const response = await callAI(apiMessages);
      let parsed;
      try {
        parsed = JSON.parse(response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
      } catch {
        setChatHistory([...newHistory, { role: "assistant", content: response }]);
        setScreen("chat");
        setIsGenerating(false);
        return;
      }

      if (parsed.type === "question") {
        setChatHistory([...newHistory, { role: "assistant", content: parsed.message }]);
        setScreen("chat");
      } else if (parsed.type === "dual_build") {
        setChatHistory([...newHistory, { role: "assistant", content: JSON.stringify(parsed) }]);
        setEasyBuild(parsed.easy);
        setAdvancedBuild(parsed.advanced);
        setSelectedDifficulty(null);
        setScreen("choose");
      } else if (parsed.type === "build") {
        // Fallback single build
        setChatHistory([...newHistory, { role: "assistant", content: JSON.stringify(parsed) }]);
        setEasyBuild(parsed);
        setAdvancedBuild(null);
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

  // ─── Tweak selected build ───
  const handleTweak = useCallback(async () => {
    const val = tweakInput.trim();
    if (!val || isTweaking || !selectedDifficulty) return;
    setIsTweaking(true);
    setError(null);
    setTweakInput("");

    const currentBuild = selectedDifficulty === "easy" ? easyBuild : advancedBuild;
    const difficulty = selectedDifficulty === "easy" ? "easy (15-30 bricks, 4-6 steps)" : "advanced (35-60 bricks, 6-10 steps)";

    try {
      const tweakMessages = [{
        role: "user",
        content: `I have this ${difficulty} LEGO build called "${currentBuild.name}": ${JSON.stringify(currentBuild)}\n\nThe user wants this change: "${val}"\n\nPlease generate an updated version with the requested change. Keep it at the same difficulty level (${difficulty}). Respond with ONLY a JSON object with type "build", name, description, bricks array, and steps array. No markdown.`
      }];

      const response = await callAI(tweakMessages);
      const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.bricks) {
        if (!parsed.type) parsed.type = "build";
        if (selectedDifficulty === "easy") setEasyBuild(parsed);
        else setAdvancedBuild(parsed);
      }
    } catch (err) {
      console.error("Tweak failed:", err);
      setError("Couldn't make that change — try describing it differently!");
    }
    setIsTweaking(false);
  }, [tweakInput, isTweaking, selectedDifficulty, easyBuild, advancedBuild, callAI]);

  const pieces = useMemo(() => {
    if (!buildData?.bricks) return [];
    const map = {};
    buildData.bricks.forEach(b => {
      const key = `${b.width}x${b.depth}x${b.height || 1}-${b.color}`;
      if (!map[key]) map[key] = { width: b.width, depth: b.depth, height: b.height || 1, color: b.color, count: 0, label: b.label || "Brick" };
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [buildData]);

  const totalSteps = buildData?.steps?.length || 0;
  const currentStepData = buildData?.steps?.[currentStep];

  const resetAll = () => {
    setScreen("home"); setBuildData(null); setEasyBuild(null); setAdvancedBuild(null);
    setSelectedDifficulty(null); setChatHistory([]); setShowPieces(false);
    setError(null); setTweakInput(""); setCurrentStep(-1);
  };

  // ═══════════════════════════════════════════
  // HOME
  // ═══════════════════════════════════════════
  if (screen === "home") {
    return (
      <div style={S.container}>
        <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <div style={S.homeWrapper}>
          <div style={{ textAlign: "center", paddingTop: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
              <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                {["red", "yellow", "blue", "green", "orange"].map((c, i) => (
                  <div key={i} style={{ width: 36, height: 22, borderRadius: 4, background: LEGO_COLORS[c], boxShadow: "0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)", animation: "brickBounce 1.5s ease-in-out infinite", animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <h1 style={S.title}>Brick Builder</h1>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", margin: 0, maxWidth: 400 }}>Describe anything and get two LEGO builds to choose from — Easy or Advanced!</p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={S.inputWrapper}>
              <input style={S.mainInput} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="What do you want to build? 🧱" disabled={isGenerating} />
              <button style={{ ...S.goButton, opacity: (!input.trim() || isGenerating) ? 0.5 : 1 }} onClick={() => handleSubmit()} disabled={!input.trim() || isGenerating}>
                {isGenerating ? "⏳" : "Build! 🚀"}
              </button>
            </div>
            {isGenerating && <div style={S.loadingBar}><div style={S.loadingFill} /><span style={S.loadingText}>{loadingMsg}</span></div>}
            {error && <div style={S.error}>{error}</div>}
          </div>

          <div style={{ marginTop: 8 }}>
            <p style={S.ideasLabel}>Need ideas? Try these:</p>
            <div style={S.ideasGrid}>
              {[["🏠", "A cozy house with a chimney"], ["🚀", "A rocket ship"], ["🏰", "Medieval castle with towers"], ["🚗", "A race car"], ["🌳", "A tree with a treehouse"], ["🤖", "A friendly robot"]].map(([emoji, idea], i) => (
                <button key={i} style={S.ideaChip} onClick={() => { setInput(idea); handleSubmit(idea); }} disabled={isGenerating}>
                  <span style={{ fontSize: 20 }}>{emoji}</span><span>{idea}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // CHAT (clarifying questions)
  // ═══════════════════════════════════════════
  if (screen === "chat") {
    const msgs = chatHistory.filter(m => { if (m.role === "assistant") { try { JSON.parse(m.content); return false; } catch { return true; } } return true; });
    return (
      <div style={S.container}>
        <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <div style={S.chatWrapper}>
          <div style={S.chatHeader}>
            <button style={S.backBtn} onClick={resetAll}>← Back</button>
            <h2 style={S.chatTitle}>🧱 BrickBot</h2>
          </div>
          <div style={S.chatMessages}>
            {msgs.map((m, i) => (
              <div key={i} style={m.role === "user" ? S.userMsg : S.botMsg}>
                {m.role === "assistant" && <span style={S.botAvatar}>🤖</span>}
                <div style={m.role === "user" ? S.userBubble : S.botBubble}>{m.content}</div>
              </div>
            ))}
            {isGenerating && <div style={S.botMsg}><span style={S.botAvatar}>🤖</span><div style={S.botBubble}>{loadingMsg}</div></div>}
          </div>
          <div style={S.chatInputRow}>
            <input style={S.chatInput} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Type your answer..." disabled={isGenerating} />
            <button style={S.chatSend} onClick={() => handleSubmit()} disabled={!input.trim() || isGenerating}>Send</button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // CHOOSE (Easy vs Advanced + Tweaks)
  // ═══════════════════════════════════════════
  if (screen === "choose") {
    return (
      <div style={S.container}>
        <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <div style={S.chooseWrapper}>
          <div style={S.chooseHeader}>
            <button style={S.backBtn} onClick={resetAll}>← Start Over</button>
            <div style={{ flex: 1, textAlign: "center" }}>
              <h2 style={{ ...S.chatTitle, fontSize: 22 }}>Pick Your Build!</h2>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>"{originalRequest}"</p>
            </div>
            <div style={{ width: 90 }} />
          </div>

          <div style={S.chooseBody}>
            {/* Easy */}
            <div style={{ ...S.chooseCard, borderColor: selectedDifficulty === "easy" ? LEGO_COLORS.green : "rgba(255,255,255,0.1)", boxShadow: selectedDifficulty === "easy" ? `0 0 20px ${LEGO_COLORS.green}40` : "none" }} onClick={() => setSelectedDifficulty("easy")}>
              <div style={S.chooseBadgeRow}>
                <span style={{ ...S.chooseBadge, background: "rgba(35,120,65,0.3)", color: LEGO_COLORS.green }}>⭐ Easy</span>
                <span style={S.chooseBrickCount}>{easyBuild?.bricks?.length || 0} bricks</span>
              </div>
              <h3 style={S.chooseCardTitle}>{easyBuild?.name || "Easy Build"}</h3>
              <p style={S.chooseCardDesc}>{easyBuild?.description}</p>
              <div style={S.chooseCanvasWrap}>{easyBuild?.bricks && <LegoCanvas bricks={easyBuild.bricks} rotateAuto={true} />}</div>
              <div style={S.chooseStepCount}>{easyBuild?.steps?.length || 0} steps</div>
            </div>

            {/* Advanced */}
            {advancedBuild && (
              <div style={{ ...S.chooseCard, borderColor: selectedDifficulty === "advanced" ? LEGO_COLORS.orange : "rgba(255,255,255,0.1)", boxShadow: selectedDifficulty === "advanced" ? `0 0 20px ${LEGO_COLORS.orange}40` : "none" }} onClick={() => setSelectedDifficulty("advanced")}>
                <div style={S.chooseBadgeRow}>
                  <span style={{ ...S.chooseBadge, background: "rgba(254,138,24,0.3)", color: LEGO_COLORS.orange }}>🔥 Advanced</span>
                  <span style={S.chooseBrickCount}>{advancedBuild?.bricks?.length || 0} bricks</span>
                </div>
                <h3 style={S.chooseCardTitle}>{advancedBuild?.name || "Advanced Build"}</h3>
                <p style={S.chooseCardDesc}>{advancedBuild?.description}</p>
                <div style={S.chooseCanvasWrap}>{advancedBuild?.bricks && <LegoCanvas bricks={advancedBuild.bricks} rotateAuto={true} />}</div>
                <div style={S.chooseStepCount}>{advancedBuild?.steps?.length || 0} steps</div>
              </div>
            )}
          </div>

          <div style={S.chooseFooter}>
            {selectedDifficulty && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={S.tweakInput} value={tweakInput} onChange={e => setTweakInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleTweak()} placeholder="Want changes? Try: make it black, make it bigger, add a flag..." disabled={isTweaking} />
                  <button style={{ ...S.tweakBtn, opacity: (!tweakInput.trim() || isTweaking) ? 0.5 : 1 }} onClick={handleTweak} disabled={!tweakInput.trim() || isTweaking}>
                    {isTweaking ? "✨ Updating..." : "✏️ Tweak"}
                  </button>
                </div>
                {isTweaking && <div style={S.loadingBar}><div style={S.loadingFill} /><span style={S.loadingText}>{loadingMsg}</span></div>}
                {error && <div style={S.error}>{error}</div>}
              </div>
            )}
            <button style={{ ...S.buildItBtn, opacity: selectedDifficulty ? 1 : 0.4 }} disabled={!selectedDifficulty} onClick={() => {
              setBuildData(selectedDifficulty === "easy" ? easyBuild : advancedBuild);
              setCurrentStep(-1);
              setScreen("build");
            }}>
              🧱 Build This One!
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // BUILD
  // ═══════════════════════════════════════════
  return (
    <div style={S.container}>
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <div style={S.buildWrapper}>
        <div style={S.buildHeader}>
          <button style={S.backBtn} onClick={() => { setScreen("choose"); setCurrentStep(-1); }}>← Back</button>
          <div style={{ textAlign: "center", flex: 1 }}>
            <h2 style={S.buildTitle}>{buildData?.name || "Your Build"}</h2>
            <p style={S.buildDesc}>{buildData?.description}</p>
          </div>
          <button style={{ ...S.piecesToggle, background: showPieces ? LEGO_COLORS.red : "rgba(255,255,255,0.1)" }} onClick={() => setShowPieces(!showPieces)}>📦 Pieces</button>
        </div>

        <div style={S.buildBody}>
          <div style={S.canvasArea}>
            <LegoCanvas bricks={buildData?.bricks || []} highlightStep={currentStep === -1 ? undefined : currentStep + 1} rotateAuto={true} />
            <div style={S.canvasHint}>🖱️ Drag to rotate</div>
          </div>
          {showPieces && (
            <div style={S.piecesPanel}>
              <h3 style={S.piecesPanelTitle}>📦 Pieces Needed</h3>
              <div style={S.piecesCount}>{buildData?.bricks?.length || 0} bricks • {pieces.length} types</div>
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
              <p style={S.stepDesc}>Take a good look — spin it around! Hit "Start Building" when you're ready.</p>
              <div style={S.stepBricks}><span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{buildData?.bricks?.length || 0} bricks • {totalSteps} steps</span></div>
            </div>
          ) : (
            <div style={S.stepCard}>
              <div style={S.stepHeader}>
                <span style={S.stepBadge}>Step {currentStep + 1} of {totalSteps}</span>
                <h3 style={S.stepTitle}>{currentStepData?.title}</h3>
              </div>
              <p style={S.stepDesc}>{currentStepData?.description}</p>
              <div style={S.stepBricks}>
                {currentStepData?.brickIds?.map(id => {
                  const brick = buildData.bricks.find(b => b.id === id);
                  if (!brick) return null;
                  return <span key={id} style={{ ...S.stepBrickChip, borderColor: LEGO_COLORS[brick.color] || "#fff", color: LEGO_COLORS[brick.color] || "#fff" }}>{brick.width}×{brick.depth} {brick.color}</span>;
                })}
              </div>
            </div>
          )}

          <div style={S.stepNav}>
            {currentStep === -1 ? (
              <button style={{ ...S.navBtn, ...S.navBtnPrimary, padding: "12px 32px", fontSize: 16 }} onClick={() => setCurrentStep(0)}>🧱 Start Building →</button>
            ) : (
              <>
                <button style={{ ...S.navBtn, opacity: currentStep === 0 ? 0.5 : 1 }} onClick={() => setCurrentStep(currentStep === 0 ? -1 : currentStep - 1)}>{currentStep === 0 ? "← Preview" : "← Previous"}</button>
                <button style={{ ...S.navBtn, ...S.navBtnPrimary, opacity: currentStep >= totalSteps - 1 ? 0.3 : 1 }} onClick={() => setCurrentStep(Math.min(totalSteps - 1, currentStep + 1))} disabled={currentStep >= totalSteps - 1}>Next Step →</button>
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
  loadingBar: { position: "relative", height: 36, background: "rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  loadingFill: { position: "absolute", left: 0, top: 0, height: "100%", width: "100%", background: "linear-gradient(90deg, transparent, rgba(245,205,47,0.15), transparent)", animation: "shimmer 2s ease-in-out infinite" },
  loadingText: { position: "relative", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)" },
  error: { padding: "10px 16px", background: "rgba(196,40,27,0.2)", borderRadius: 10, fontSize: 14, color: "#ff8a80", fontWeight: 600 },
  ideasLabel: { fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 },
  ideasGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 },
  ideaChip: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, cursor: "pointer", color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: 600, fontFamily: "'Nunito', sans-serif", textAlign: "left" },
  chatWrapper: { maxWidth: 600, margin: "0 auto", height: "100vh", display: "flex", flexDirection: "column" },
  chatHeader: { display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" },
  chatTitle: { fontFamily: "'Fredoka', sans-serif", fontSize: 20, fontWeight: 600, margin: 0, color: "#F5CD2F" },
  chatMessages: { flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 },
  userMsg: { display: "flex", justifyContent: "flex-end" },
  botMsg: { display: "flex", alignItems: "flex-start", gap: 8 },
  botAvatar: { fontSize: 24, marginTop: 4 },
  userBubble: { background: "linear-gradient(135deg, #0055BF, #068BC9)", padding: "10px 16px", borderRadius: "16px 16px 4px 16px", maxWidth: "80%", fontSize: 15, fontWeight: 600 },
  botBubble: { background: "rgba(255,255,255,0.08)", padding: "10px 16px", borderRadius: "16px 16px 16px 4px", maxWidth: "80%", fontSize: 15, fontWeight: 600, lineHeight: 1.5 },
  chatInputRow: { display: "flex", gap: 8, padding: "12px 20px 24px", borderTop: "1px solid rgba(255,255,255,0.08)" },
  chatInput: { flex: 1, padding: "12px 16px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 15, fontFamily: "'Nunito', sans-serif", fontWeight: 600, outline: "none" },
  chatSend: { padding: "12px 20px", background: LEGO_COLORS.blue, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Fredoka', sans-serif", fontSize: 14 },
  backBtn: { padding: "8px 14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", whiteSpace: "nowrap" },
  chooseWrapper: { height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  chooseHeader: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 },
  chooseBody: { flex: 1, display: "flex", gap: 16, padding: 16, overflow: "auto", minHeight: 0 },
  chooseCard: { flex: 1, minWidth: 0, background: "rgba(255,255,255,0.04)", border: "2px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 16, cursor: "pointer", transition: "all 0.25s", display: "flex", flexDirection: "column", gap: 8 },
  chooseBadgeRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  chooseBadge: { fontSize: 13, fontWeight: 700, padding: "4px 12px", borderRadius: 8, fontFamily: "'Fredoka', sans-serif" },
  chooseBrickCount: { fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600 },
  chooseCardTitle: { fontFamily: "'Fredoka', sans-serif", fontSize: 18, fontWeight: 600, margin: 0, color: "#F5CD2F" },
  chooseCardDesc: { fontSize: 13, color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.4 },
  chooseCanvasWrap: { height: 280, borderRadius: 12, overflow: "hidden", background: "rgba(0,0,0,0.2)" },
  chooseStepCount: { fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600, textAlign: "center" },
  chooseFooter: { flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)", padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 10 },
  tweakInput: { flex: 1, padding: "12px 16px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 14, fontFamily: "'Nunito', sans-serif", fontWeight: 600, outline: "none" },
  tweakBtn: { padding: "12px 20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "'Fredoka', sans-serif", fontSize: 14, whiteSpace: "nowrap" },
  buildItBtn: { padding: "14px 32px", fontSize: 18, fontWeight: 700, background: "linear-gradient(135deg, #237841, #A6CA55)", color: "#fff", border: "none", borderRadius: 14, cursor: "pointer", fontFamily: "'Fredoka', sans-serif", textAlign: "center", boxShadow: "0 4px 15px rgba(35,120,65,0.3)" },
  buildWrapper: { height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  buildHeader: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 },
  buildTitle: { fontFamily: "'Fredoka', sans-serif", fontSize: 18, fontWeight: 600, margin: 0, color: "#F5CD2F" },
  buildDesc: { fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0 },
  piecesToggle: { padding: "8px 14px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", whiteSpace: "nowrap" },
  buildBody: { flex: 1, display: "flex", overflow: "hidden", position: "relative", minHeight: 0 },
  canvasArea: { flex: 1, position: "relative", minWidth: 0 },
  canvasHint: { position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 600, pointerEvents: "none" },
  piecesPanel: { width: 280, flexShrink: 0, background: "rgba(0,0,0,0.3)", borderLeft: "1px solid rgba(255,255,255,0.08)", padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 8 },
  piecesPanelTitle: { fontFamily: "'Fredoka', sans-serif", fontSize: 16, fontWeight: 600, margin: 0, color: "#F5CD2F" },
  piecesCount: { fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600, marginBottom: 4 },
  stepsBar: { flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)", padding: "12px 16px 16px" },
  stepProgress: { display: "flex", justifyContent: "center", gap: 6, marginBottom: 12 },
  stepDot: { width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "'Fredoka', sans-serif", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" },
  stepCard: { background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "14px 18px", marginBottom: 10 },
  stepHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  stepBadge: { fontSize: 11, fontWeight: 700, background: "rgba(245,205,47,0.2)", color: "#F5CD2F", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" },
  stepTitle: { fontFamily: "'Fredoka', sans-serif", fontSize: 16, fontWeight: 600, margin: 0 },
  stepDesc: { fontSize: 14, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.5 },
  stepBricks: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  stepBrickChip: { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: "1px solid", textTransform: "capitalize" },
  stepNav: { display: "flex", gap: 8, justifyContent: "center" },
  navBtn: { padding: "10px 20px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif" },
  navBtnPrimary: { background: "linear-gradient(135deg, #0055BF, #068BC9)", borderColor: "transparent" },
};

if (typeof document !== "undefined") {
  const s = document.createElement("style");
  s.textContent = `
    @keyframes brickBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
    input::placeholder { color: rgba(255,255,255,0.3) !important; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
  `;
  document.head.appendChild(s);
}
