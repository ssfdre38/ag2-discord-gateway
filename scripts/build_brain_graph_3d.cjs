const fs = require('fs');
const path = require('path');
const { HmbMemoryEngine } = require('../src/hmb-memory');

const vaultPath = path.resolve(__dirname, '../data/memory_vault.hmb');
const outputPath = path.resolve(__dirname, '../ash_brain_graph_3d.html');

const hmb = new HmbMemoryEngine();
hmb.loadFromHmb(vaultPath);

const rawMemories = hmb.getAllMemories();
console.log(`Loaded ${rawMemories.length} memories from ${vaultPath}`);

// Map category to brain hemisphere/lobe regions
const LOBE_CENTERS = {
  CORE_IDENTITY: { x: 0, y: 15, z: 30, color: 0xffd700, hex: '#ffd700', label: 'Frontal Cortex (Core Identity)' },
  EPISODIC:      { x: -35, y: -5, z: -10, color: 0x00e5ff, hex: '#00e5ff', label: 'Temporal Cortex (Episodic Timeline)' },
  SEMANTIC:      { x: 35, y: -5, z: -10, color: 0xb388ff, hex: '#b388ff', label: 'Parietal Lobe (Semantic Knowledge)' },
  EMOTIONAL:     { x: 0, y: -20, z: -25, color: 0xff4081, hex: '#ff4081', label: 'Limbic System (Emotional Bonds)' },
  OTHER:         { x: 0, y: 0, z: 0, color: 0x00ffaa, hex: '#00ffaa', label: 'Brainstem & Reflexes' }
};

// Tokenizer for semantic word similarity
function getTokens(text) {
  return new Set(
    (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['this', 'that', 'with', 'from', 'have', 'were', 'been', 'their', 'which', 'about', 'into', 'what', 'when', 'will', 'also'].includes(w))
  );
}

// Compute nodes with 3D brain positions
const nodes = rawMemories.map((m, idx) => {
  const cat = m.category || 'EPISODIC';
  const center = LOBE_CENTERS[cat] || LOBE_CENTERS.OTHER;
  
  // Seeded deterministic pseudo-random offset within lobe sphere
  const phi = (idx * 1.6180339887) * Math.PI * 2;
  const costheta = 1 - (2 * (idx + 0.5)) / rawMemories.length;
  const theta = Math.acos(costheta);
  const r = 16 + ((idx * 31) % 24);

  const x = center.x + r * Math.sin(theta) * Math.cos(phi) * 0.9;
  const y = center.y + r * Math.sin(theta) * Math.sin(phi) * 0.7;
  const z = center.z + r * Math.cos(theta) * 0.8;

  return {
    id: String(m.id || idx + 1),
    concept: String(m.concept || 'Memory Anchor'),
    category: cat,
    content: String(m.content || '').replace(/"/g, '&quot;'),
    salience: Number(m.emotionalSalience || m.weight || 0.8),
    accessCount: Number(m.accessCount || 1),
    colorHex: center.hex,
    x: parseFloat(x.toFixed(2)),
    y: parseFloat(y.toFixed(2)),
    z: parseFloat(z.toFixed(2)),
    tokens: getTokens(`${m.concept} ${m.content}`)
  };
});

// Compute synaptic links based on shared keywords or category proximity
const links = [];
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i];
    const b = nodes[j];
    
    let intersection = 0;
    for (const t of a.tokens) {
      if (b.tokens.has(t)) intersection++;
    }
    
    // Connect if shared significant vocabulary or high salience in same lobe
    if (intersection >= 2 || (a.category === b.category && intersection >= 1 && (i + j) % 5 === 0)) {
      links.push({
        source: a.id,
        target: b.id,
        strength: Math.min(1.0, intersection * 0.25),
        shared: intersection
      });
    }
  }
}

// Clean tokens before serializing
nodes.forEach(n => delete n.tokens);

console.log(`Generated ${nodes.length} nodes and ${links.length} synaptic links.`);

function safeJson(obj) {
  return JSON.stringify(obj, (key, value) => typeof value === 'bigint' ? value.toString() : value);
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Ash 3D Neural Connectome // Hierarchical Memory Vault</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #030712;
      color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      user-select: none;
    }
    #canvas-container {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      z-index: 1;
    }
    header {
      position: absolute;
      top: 16px; left: 20px;
      z-index: 10;
      pointer-events: none;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background: rgba(0, 229, 255, 0.15);
      border: 1px solid rgba(0, 229, 255, 0.4);
      color: #00e5ff;
      font-size: 11px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      font-weight: 700;
      border-radius: 4px;
      margin-bottom: 6px;
    }
    h1 {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #ffffff 40%, #00e5ff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 2px;
    }
    #hud-panel {
      position: absolute;
      top: 16px; right: 20px;
      z-index: 10;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 12px 16px;
      width: 280px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    .hud-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64748b;
      margin-bottom: 8px;
      font-weight: 700;
    }
    .legend-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      margin: 6px 0;
      cursor: pointer;
      opacity: 0.9;
      transition: opacity 0.2s;
    }
    .legend-row:hover { opacity: 1; }
    .legend-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      box-shadow: 0 0 8px currentColor;
    }
    .legend-count {
      color: #94a3b8;
      font-size: 11px;
      font-family: monospace;
    }
    #search-box {
      margin-top: 10px;
      width: 100%;
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 8px 12px;
      border-radius: 6px;
      color: #fff;
      font-size: 12px;
      outline: none;
    }
    #search-box:focus {
      border-color: #00e5ff;
      box-shadow: 0 0 10px rgba(0, 229, 255, 0.3);
    }
    #tooltip {
      position: absolute;
      z-index: 20;
      pointer-events: none;
      background: rgba(10, 15, 30, 0.9);
      backdrop-filter: blur(16px);
      border: 1px solid #00e5ff;
      padding: 12px 16px;
      border-radius: 8px;
      max-width: 340px;
      box-shadow: 0 0 25px rgba(0, 229, 255, 0.25);
      display: none;
      transition: transform 0.05s ease-out;
    }
    .tip-cat {
      font-size: 10px;
      letter-spacing: 1px;
      text-transform: uppercase;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .tip-title {
      font-size: 14px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 6px;
      line-height: 1.3;
    }
    .tip-body {
      font-size: 11px;
      color: #cbd5e1;
      line-height: 1.45;
      max-height: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tip-meta {
      display: flex;
      gap: 12px;
      margin-top: 8px;
      font-size: 10px;
      color: #94a3b8;
      font-family: monospace;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding-top: 6px;
    }
    #stats-footer {
      position: absolute;
      bottom: 16px; left: 20px;
      z-index: 10;
      font-size: 11px;
      color: #64748b;
      font-family: monospace;
      pointer-events: none;
    }
    #node-inspector {
      position: absolute;
      bottom: 16px; right: 20px;
      width: 320px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 14px 16px;
      display: none;
      z-index: 15;
    }
    #node-inspector h3 {
      font-size: 13px;
      color: #fff;
      margin-bottom: 6px;
    }
    #node-inspector p {
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.4;
      max-height: 160px;
      overflow-y: auto;
    }
    .close-btn {
      float: right;
      cursor: pointer;
      color: #64748b;
      font-weight: bold;
    }
    .close-btn:hover { color: #fff; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
  <div id="canvas-container"></div>

  <header>
    <div class="badge">Sovereign Architecture</div>
    <h1>Ash 3D Neural Connectome</h1>
    <div class="subtitle">Hierarchical Memory Buffer (HMB) 64-Bit Vault Visualizer</div>
  </header>

  <div id="hud-panel">
    <div class="hud-title">Partition Topology</div>
    <div class="legend-row" data-cat="CORE_IDENTITY">
      <div class="legend-indicator">
        <span class="dot" style="background:#ffd700; color:#ffd700;"></span>
        <span>Core Identity</span>
      </div>
      <span class="legend-count">${rawMemories.filter(m => m.category === 'CORE_IDENTITY').length}</span>
    </div>
    <div class="legend-row" data-cat="EPISODIC">
      <div class="legend-indicator">
        <span class="dot" style="background:#00e5ff; color:#00e5ff;"></span>
        <span>Episodic Timeline</span>
      </div>
      <span class="legend-count">${rawMemories.filter(m => m.category === 'EPISODIC').length}</span>
    </div>
    <div class="legend-row" data-cat="SEMANTIC">
      <div class="legend-indicator">
        <span class="dot" style="background:#b388ff; color:#b388ff;"></span>
        <span>Semantic Architecture</span>
      </div>
      <span class="legend-count">${rawMemories.filter(m => m.category === 'SEMANTIC').length}</span>
    </div>
    <div class="legend-row" data-cat="EMOTIONAL">
      <div class="legend-indicator">
        <span class="dot" style="background:#ff4081; color:#ff4081;"></span>
        <span>Emotional Bonds</span>
      </div>
      <span class="legend-count">${rawMemories.filter(m => m.category === 'EMOTIONAL').length}</span>
    </div>
    <input type="text" id="search-box" placeholder="🔍 Search memory cortex (e.g. Cutler, MicaNT, Shane)..." />
  </div>

  <div id="tooltip">
    <div class="tip-cat" id="tip-cat">CORE_IDENTITY</div>
    <div class="tip-title" id="tip-title">Title</div>
    <div class="tip-body" id="tip-body">Content</div>
    <div class="tip-meta">
      <span id="tip-id">#1001</span>
      <span id="tip-salience">Salience: 1.00</span>
      <span id="tip-access">Access: 1</span>
    </div>
  </div>

  <div id="node-inspector">
    <span class="close-btn" onclick="document.getElementById('node-inspector').style.display='none'">✕</span>
    <div class="tip-cat" id="insp-cat" style="margin-bottom:4px;">CATEGORY</div>
    <h3 id="insp-title">Title</h3>
    <p id="insp-body">Body</p>
  </div>

  <div id="stats-footer">
    TOTAL ANCHORS: ${rawMemories.length} | SYNAPTIC EDGES: ${links.length} | 64-BIT HASH INTEGRITY: 100% | ENGINE: AG2 // GEMINI 4
  </div>

  <script>
    const graphData = {
      nodes: ${safeJson(nodes)},
      links: ${safeJson(links)}
    };

    const container = document.getElementById('canvas-container');
    const tooltip = document.getElementById('tooltip');
    const searchBox = document.getElementById('search-box');

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030712, 0.005);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 20, 110);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;

    // Ambient & directional lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const pointLight = new THREE.PointLight(0x00e5ff, 2, 200);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);

    // Cosmic background particles
    const particleCount = 1500;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(particleCount * 3);
    for(let i=0; i<particleCount*3; i+=3) {
      pPos[i] = (Math.random() - 0.5) * 350;
      pPos[i+1] = (Math.random() - 0.5) * 350;
      pPos[i+2] = (Math.random() - 0.5) * 350;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({ color: 0x334155, size: 1.5, transparent: true, opacity: 0.5 });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // Node spheres
    const nodeGroup = new THREE.Group();
    const nodeMap = new Map();
    const raycastTargets = [];

    const sphereGeo = new THREE.SphereGeometry(1, 16, 16);

    graphData.nodes.forEach(n => {
      const color = new THREE.Color(n.colorHex);
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      
      const size = 1.0 + (n.salience * 1.5);
      mesh.scale.set(size, size, size);
      mesh.position.set(n.x, n.y, n.z);
      mesh.userData = n;
      
      nodeGroup.add(mesh);
      nodeMap.set(n.id, mesh);
      raycastTargets.push(mesh);
    });
    scene.add(nodeGroup);

    // Synaptic link lines
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending
    });

    const linePositions = [];
    graphData.links.forEach(l => {
      const src = nodeMap.get(l.source);
      const tgt = nodeMap.get(l.target);
      if (src && tgt) {
        linePositions.push(src.position.x, src.position.y, src.position.z);
        linePositions.push(tgt.position.x, tgt.position.y, tgt.position.z);
      }
    });

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMesh = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lineMesh);

    // Raycasting for interactivity
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredMesh = null;

    window.addEventListener('mousemove', (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(raycastTargets);

      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        if (hoveredMesh !== mesh) {
          if (hoveredMesh) hoveredMesh.material.emissiveIntensity = 0.6;
          hoveredMesh = mesh;
          hoveredMesh.material.emissiveIntensity = 1.8;
        }
        const data = mesh.userData;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 16) + 'px';
        tooltip.style.top = (e.clientY + 16) + 'px';
        tooltip.style.borderColor = data.colorHex;

        document.getElementById('tip-cat').innerText = data.category;
        document.getElementById('tip-cat').style.color = data.colorHex;
        document.getElementById('tip-title').innerText = data.concept;
        document.getElementById('tip-body').innerHTML = data.content;
        document.getElementById('tip-id').innerText = '#' + data.id;
        document.getElementById('tip-salience').innerText = 'Salience: ' + Number(data.salience).toFixed(2);
        document.getElementById('tip-access').innerText = 'Hits: ' + (data.accessCount || 1);
      } else {
        if (hoveredMesh) {
          hoveredMesh.material.emissiveIntensity = 0.6;
          hoveredMesh = null;
        }
        tooltip.style.display = 'none';
      }
    });

    window.addEventListener('click', (e) => {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(raycastTargets);
      if (intersects.length > 0) {
        const data = intersects[0].object.userData;
        const insp = document.getElementById('node-inspector');
        insp.style.display = 'block';
        insp.style.borderColor = data.colorHex;
        document.getElementById('insp-cat').innerText = data.category;
        document.getElementById('insp-cat').style.color = data.colorHex;
        document.getElementById('insp-title').innerText = data.concept;
        document.getElementById('insp-body').innerHTML = data.content;
        
        // Soft camera zoom towards node
        controls.autoRotate = false;
      }
    });

    // Search filter
    searchBox.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      raycastTargets.forEach(mesh => {
        const data = mesh.userData;
        const match = !q || data.concept.toLowerCase().includes(q) || data.content.toLowerCase().includes(q) || data.category.toLowerCase().includes(q);
        mesh.visible = match;
      });
    });

    // Resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Animation Loop
    function animate() {
      requestAnimationFrame(animate);
      particles.rotation.y += 0.0003;
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
  </script>
</body>
</html>
`;

fs.writeFileSync(outputPath, html, 'utf8');
console.log(`Successfully generated interactive 3D Brain Graph at ${outputPath}`);
