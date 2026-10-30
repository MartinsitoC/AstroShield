/**
 * AstroShield 3D — Mission Control Orbital Telemetry & Visualization Engine
 * Visualizador interactivo profesional en Three.js con:
 * - Morfado geométrico continuo (Mesh Unrolling: Desenrollado 3D Globo <-> 2D Mapa plano).
 * - Trazado de trayectorias orbitales completas para los 8 satélites (THREE.LineLoop LEO).
 * - Enfoque cinemático automático de cámara con Tween.js (TWEEN).
 * - Conos 3D de cobertura con verdadera orientación nadir hacia el centro terrestre.
 * - Animación dinámica de escaneo/barrido pulsante en la superficie terrestre (0.8x a 1.2x).
 * - Línea generacional evolutiva (Gen 0 a Gen 150) con scrubber y reproducción interactiva.
 */

// ==============================================================================
// 1. CONSTANTES GLOBALES Y ESCALAS FÍSICAS
// ==============================================================================
const EARTH_RADIUS = 5.0;
const SAT_ORBIT_RADIUS = 5.95;
const R_EARTH_KM = 6371.0;
const OBSERVATION_RADIUS_KM = 300.0;

// Radio angular del footprint de observación en grados: (300 / 6371) * (180 / PI) ≈ 2.698°
const FOOTPRINT_RADIUS_DEG = (OBSERVATION_RADIUS_KM / R_EARTH_KM) * (180.0 / Math.PI);
const FOOTPRINT_RADIUS_RAD = (FOOTPRINT_RADIUS_DEG * Math.PI) / 180.0;

// Dimensiones de conos 3D orientados a nadir
const CONE_HEIGHT = SAT_ORBIT_RADIUS - EARTH_RADIUS; // 0.95
const CONE_BASE_RADIUS = EARTH_RADIUS * Math.sin(FOOTPRINT_RADIUS_RAD); // ~0.235

// Dimensiones del mapa 2D plano (Proyección cilíndrica equirectangular 2:1)
const MAP_WIDTH = 2.0 * Math.PI * EARTH_RADIUS; // ~31.4159
const MAP_HEIGHT = Math.PI * EARTH_RADIUS; // ~15.7079

// Subdivisiones de la malla para desenrollado continuo
const GRID_X = 96;
const GRID_Y = 48;

// ==============================================================================
// 2. ESTADO GLOBAL DE LA APLICACIÓN
// ==============================================================================
let appData = null;
let currentGen = 150;
let maxGen = 150;
let isPlaying = false;
let playbackSpeed = 2; // generaciones por ciclo
let lastPlaybackTime = 0;

let selectedSatId = 1;
let currentViewMode = '3d'; // '3d' | '2d'
let followSatelliteMode = false;

// Variable de interpolación geométrica: 1.0 = Globo 3D, 0.0 = Mapa 2D plano
const morphProgress = { value: 1.0 };

// Variables de Three.js
let scene, camera, renderer, controls;
const clock = new THREE.Clock();

let earthGroup, debrisGroup, occupiedGroup, regionsGroup, satellitesGroup, lasersGroup;
let earthMesh, atmosphereMesh, selectedSatHalo;
let pos2DArray = null;
let pos3DArray = null;

let targetRegionMeshes = new Map();
let debrisEntities = [];
let occupiedEntities = [];
let satelliteEntities = [];
let orbitLines = [];

// Tweens activos (Tween.js)
let currentCameraTween = null;
let currentTargetTween = null;
let currentMorphTween = null;

// Capas holográficas activas
const layerStates = {
  cones: true,
  lasers: true,
  atmosphere: true,
};

// ==============================================================================
// 3. MATEMÁTICA ESFÉRICA, CARTESIANA Y PROYECCIONES
// ==============================================================================
/**
 * Convierte coordenadas geográficas (latitud, longitud) a Vector3 cartesiano en Three.js.
 * Convención: Polo Norte en +Y, Greenwich en +Z, 90° Este en +X.
 */
function latLonToVector3(lat, lon, radius) {
  const phi = (lat * Math.PI) / 180.0;
  const theta = (lon * Math.PI) / 180.0;
  const x = radius * Math.cos(phi) * Math.sin(theta);
  const y = radius * Math.sin(phi);
  const z = radius * Math.cos(phi) * Math.cos(theta);
  return new THREE.Vector3(x, y, z);
}

/**
 * Convierte coordenadas geográficas a posición plana 2D (plano XY, Z = offsetZ).
 */
function latLonTo2D(lat, lon, offsetZ = 0.0) {
  const x = (lon / 180.0) * (MAP_WIDTH / 2.0);
  const y = (lat / 90.0) * (MAP_HEIGHT / 2.0);
  return new THREE.Vector3(x, y, offsetZ);
}

/**
 * Interpola suavemente la posición de una entidad entre el mapa plano 2D y la esfera 3D.
 */
function getInterpolatedPosition(lat, lon, radius3D, offsetZ2D, t) {
  const p3D = latLonToVector3(lat, lon, radius3D);
  const p2D = latLonTo2D(lat, lon, offsetZ2D);
  return new THREE.Vector3().lerpVectors(p2D, p3D, t);
}

/**
 * Interpola el vector normal superficial entre el plano (+Z) y la esfera radial.
 */
function getInterpolatedNormal(lat, lon, t) {
  const n3D = latLonToVector3(lat, lon, 1.0).normalize();
  const n2D = new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3().lerpVectors(n2D, n3D, t).normalize();
}

/**
 * Calcula la distancia angular en grados sexagesimales entre dos pares (lat, lon)
 * utilizando la fórmula del semiverseno (Haversine) con acotamiento numérico.
 */
function angularDistanceDeg(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180.0;
  const phi2 = (lat2 * Math.PI) / 180.0;
  const dphi = ((lat2 - lat1) * Math.PI) / 180.0;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180.0;

  const sinHalfPhi = Math.sin(dphi / 2.0);
  const sinHalfLambda = Math.sin(dlambda / 2.0);

  const a = sinHalfPhi * sinHalfPhi + Math.cos(phi1) * Math.cos(phi2) * (sinHalfLambda * sinHalfLambda);
  const aClamped = Math.min(1.0, Math.max(0.0, a));
  return 2.0 * Math.asin(Math.sqrt(aClamped)) * (180.0 / Math.PI);
}

// ==============================================================================
// 4. TEXTURA PROCEDURAL CARTOGRÁFICA CYBER-ESPACIAL
// ==============================================================================
/**
 * Genera un lienzo procedural de alta resolución (2048x1024) con continentes reales,
 * rejilla de coordenadas, paralelos y meridianos con estética espacial militar.
 */
function createEarthProceduralTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // 1. Fondo oceánico profundo
  const oceanGrad = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, w / 1.5);
  oceanGrad.addColorStop(0, '#0a162b');
  oceanGrad.addColorStop(1, '#040813');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, w, h);

  // Funciones de mapeo geográfico a píxeles del canvas
  const mapX = (lon) => ((lon + 180.0) / 360.0) * w;
  const mapY = (lat) => ((90.0 - lat) / 180.0) * h;

  // 2. Rejilla de coordenadas (Paralelos y Meridianos cada 30°)
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);

  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.beginPath();
    ctx.moveTo(0, mapY(lat));
    ctx.lineTo(w, mapY(lat));
    ctx.stroke();
  }

  for (let lon = -150; lon <= 150; lon += 30) {
    ctx.beginPath();
    ctx.moveTo(mapX(lon), 0);
    ctx.lineTo(mapX(lon), h);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 3. Ecuador y Meridiano de Greenwich destacados
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, mapY(0));
  ctx.lineTo(w, mapY(0));
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(mapX(0), 0);
  ctx.lineTo(mapX(0), h);
  ctx.stroke();

  // 4. Polígonos de Masas Continentales Globales
  const continentPolys = [
    // América del Norte
    [[-168, 65], [-160, 71], [-130, 70], [-80, 72], [-60, 50], [-70, 42], [-80, 25], [-80, 8], [-85, 12], [-90, 16], [-100, 20], [-105, 23], [-117, 32], [-124, 40], [-125, 49], [-140, 60], [-168, 65]],
    // América del Sur
    [[-80, 10], [-70, 12], [-60, 8], [-50, 0], [-35, -5], [-38, -15], [-40, -22], [-50, -30], [-60, -40], [-68, -55], [-75, -50], [-72, -35], [-75, -15], [-80, -2], [-80, 10]],
    // África
    [[-17, 32], [-5, 36], [10, 37], [25, 32], [32, 31], [43, 12], [51, 11], [40, -5], [35, -25], [20, -35], [17, -34], [12, -18], [9, 4], [0, 6], [-15, 11], [-17, 21], [-17, 32]],
    // Europa
    [[-10, 36], [0, 43], [-5, 48], [5, 54], [10, 58], [25, 71], [40, 68], [60, 66], [50, 50], [35, 45], [26, 38], [15, 38], [0, 36], [-10, 36]],
    // Asia
    [[50, 50], [60, 66], [100, 76], [170, 66], [160, 52], [140, 48], [120, 38], [120, 22], [105, 10], [90, 22], [80, 10], [70, 25], [55, 25], [50, 40], [50, 50]],
    // Japón
    [[130, 32], [133, 34], [140, 42], [142, 44], [145, 44], [141, 38], [136, 34], [130, 32]],
    // Australia
    [[114, -22], [120, -15], [135, -12], [142, -11], [148, -18], [153, -28], [150, -37], [140, -38], [130, -32], [115, -34], [114, -22]],
    // Groenlandia
    [[-55, 60], [-45, 60], [-20, 70], [-25, 82], [-50, 83], [-60, 75], [-55, 60]],
    // Antártida
    [[-180, -68], [180, -68], [180, -90], [-180, -90]]
  ];

  ctx.fillStyle = '#0f243b';
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 1.5;

  continentPolys.forEach((poly) => {
    ctx.beginPath();
    poly.forEach((pt, idx) => {
      const px = mapX(pt[0]);
      const py = mapY(pt[1]);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  // 5. Etiquetas geográficas de control orbital
  ctx.fillStyle = 'rgba(0, 229, 255, 0.65)';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('EQUATOR (0°)', 24, mapY(0) - 8);
  ctx.fillText('PRIME MERIDIAN (0°)', mapX(0) + 12, 36);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

// ==============================================================================
// 5. INICIALIZACIÓN DE LA ESCENA 3D Y MALLA DE MORFADO
// ==============================================================================
function initThreeScene() {
  const container = document.getElementById('webgl-canvas-container');
  const width = window.innerWidth;
  const height = window.innerHeight;

  // 1. Escena
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050711);

  // 2. Cámara
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(13.0, 8.0, 14.0);

  // 3. Renderizador WebGL
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  // 4. OrbitControls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 6.8;
  controls.maxDistance = 35.0;

  // 5. Iluminación
  const ambientLight = new THREE.AmbientLight(0x243b5e, 1.4);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.9);
  sunLight.position.set(25, 20, 30);
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight(0x00d4ff, 0.7);
  rimLight.position.set(-25, -15, -20);
  scene.add(rimLight);

  // 6. Campo estelar procedural
  createStarfield();

  // 7. Grupos de objetos
  earthGroup = new THREE.Group();
  scene.add(earthGroup);

  debrisGroup = new THREE.Group();
  earthGroup.add(debrisGroup);

  occupiedGroup = new THREE.Group();
  earthGroup.add(occupiedGroup);

  regionsGroup = new THREE.Group();
  earthGroup.add(regionsGroup);

  satellitesGroup = new THREE.Group();
  earthGroup.add(satellitesGroup);

  lasersGroup = new THREE.Group();
  earthGroup.add(lasersGroup);

  // 8. Construcción de la Malla Terrestre con Morfado Dinámico
  buildMorphingEarthMesh();

  // 9. Construcción de las 8 Trayectorias Orbitales LEO
  setupOrbitalTrajectories();

  // 10. Halo de selección del satélite activo
  buildSelectedSatHalo();

  // 11. Eventos de redimensionamiento
  window.addEventListener('resize', onWindowResize);
}

function createStarfield() {
  const count = 1800;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = THREE.MathUtils.randFloat(75, 260);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloat(-1, 1));

    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);

    const tint = Math.random();
    if (tint > 0.8) {
      col[i * 3] = 0.85; col[i * 3 + 1] = 0.95; col[i * 3 + 2] = 1.0;
    } else if (tint > 0.6) {
      col[i * 3] = 1.0; col[i * 3 + 1] = 0.85; col[i * 3 + 2] = 0.55;
    } else {
      col[i * 3] = 0.45; col[i * 3 + 1] = 0.65; col[i * 3 + 2] = 0.9;
    }
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: 1.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
  });
  scene.add(new THREE.Points(geo, mat));
}

function buildMorphingEarthMesh() {
  const numVerts = (GRID_X + 1) * (GRID_Y + 1);
  pos2DArray = new Float32Array(numVerts * 3);
  pos3DArray = new Float32Array(numVerts * 3);
  const currentPositions = new Float32Array(numVerts * 3);
  const uvs = new Float32Array(numVerts * 2);

  let vIdx = 0;
  let uvIdx = 0;

  for (let j = 0; j <= GRID_Y; j++) {
    const v = j / GRID_Y;
    const lat = (v - 0.5) * 180.0; // [-90°, +90°]

    for (let i = 0; i <= GRID_X; i++) {
      const u = i / GRID_X;
      const lon = (u - 0.5) * 360.0; // [-180°, +180°]

      // Configuración 2D Plana (t = 0)
      const x2D = (u - 0.5) * MAP_WIDTH;
      const y2D = (v - 0.5) * MAP_HEIGHT;
      const z2D = 0.0;

      // Configuración 3D Esférica (t = 1)
      const phi = (lat * Math.PI) / 180.0;
      const theta = (lon * Math.PI) / 180.0;
      const x3D = EARTH_RADIUS * Math.cos(phi) * Math.sin(theta);
      const y3D = EARTH_RADIUS * Math.sin(phi);
      const z3D = EARTH_RADIUS * Math.cos(phi) * Math.cos(theta);

      pos2DArray[vIdx] = x2D;
      pos2DArray[vIdx + 1] = y2D;
      pos2DArray[vIdx + 2] = z2D;

      pos3DArray[vIdx] = x3D;
      pos3DArray[vIdx + 1] = y3D;
      pos3DArray[vIdx + 2] = z3D;

      // Estado inicial esférico 3D (morphProgress = 1.0)
      currentPositions[vIdx] = x3D;
      currentPositions[vIdx + 1] = y3D;
      currentPositions[vIdx + 2] = z3D;

      uvs[uvIdx] = u;
      uvs[uvIdx + 1] = v;

      vIdx += 3;
      uvIdx += 2;
    }
  }

  // Triangulación de la cuadrícula
  const indices = [];
  for (let j = 0; j < GRID_Y; j++) {
    for (let i = 0; i < GRID_X; i++) {
      const a = i + (GRID_X + 1) * j;
      const b = (i + 1) + (GRID_X + 1) * j;
      const c = i + (GRID_X + 1) * (j + 1);
      const d = (i + 1) + (GRID_X + 1) * (j + 1);

      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(currentPositions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const texture = createEarthProceduralTexture();
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.45,
    metalness: 0.35,
    emissive: 0x030814,
    side: THREE.DoubleSide,
  });

  earthMesh = new THREE.Mesh(geometry, material);
  earthGroup.add(earthMesh);

  // Atmósfera exterior (visible en modo 3D)
  const atmosGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.025, 48, 36);
  const atmosMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
  });
  atmosphereMesh = new THREE.Mesh(atmosGeo, atmosMat);
  earthGroup.add(atmosphereMesh);
}

function buildSelectedSatHalo() {
  const haloGeo = new THREE.RingGeometry(0.26, 0.34, 32);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  selectedSatHalo = new THREE.Mesh(haloGeo, haloMat);
  selectedSatHalo.visible = false;
  scene.add(selectedSatHalo);
}

// ==============================================================================
// 6. TRAZADO DE TRAYECTORIAS ORBITALES COMPLETAS (LEO LINE LOOPS)
// ==============================================================================
function setupOrbitalTrajectories() {
  orbitLines = [];
  const segments = 96;

  for (let i = 1; i <= 8; i++) {
    const points = [];
    for (let j = 0; j <= segments; j++) {
      points.push(new THREE.Vector3());
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const lineLoop = new THREE.LineLoop(geo, mat);
    earthGroup.add(lineLoop);

    orbitLines.push({
      id: i,
      line: lineLoop,
      mat: mat,
      inclinationAngle: (45.0 + (i * 5.0)) * (Math.PI / 180.0), // Inclinación orbital representativa
      ascNodeAngle: (i * 45.0) * (Math.PI / 180.0), // Longitud del nodo ascendente (RAAN)
    });
  }
}

function updateOrbitalTrajectories() {
  const segments = 96;
  const t = morphProgress.value;

  orbitLines.forEach((orbitObj, idx) => {
    const satEnt = satelliteEntities[idx];
    if (!satEnt) return;

    // Solo se actualizan y visualizan órbitas tridimensionales cuando el globo está proyectado en 3D
    const satPos3D = latLonToVector3(satEnt.lat, satEnt.lon, SAT_ORBIT_RADIUS);
    const u1 = satPos3D.clone().normalize();

    const inc = orbitObj.inclinationAngle;
    const raan = orbitObj.ascNodeAngle;
    const n0 = new THREE.Vector3(Math.sin(inc) * Math.sin(raan), Math.cos(inc), -Math.sin(inc) * Math.cos(raan));

    let nOrbit = n0.clone().sub(u1.clone().multiplyScalar(n0.dot(u1))).normalize();
    if (nOrbit.lengthSq() < 0.001) {
      nOrbit = new THREE.Vector3(0, 1, 0).cross(u1).normalize();
    }
    const u2 = new THREE.Vector3().crossVectors(nOrbit, u1).normalize();

    const posAttr = orbitObj.line.geometry.attributes.position;
    const arr = posAttr.array;

    for (let j = 0; j <= segments; j++) {
      const alpha = (j / segments) * Math.PI * 2.0;
      const pt = new THREE.Vector3()
        .copy(u1)
        .multiplyScalar(Math.cos(alpha) * SAT_ORBIT_RADIUS)
        .addScaledVector(u2, Math.sin(alpha) * SAT_ORBIT_RADIUS);

      arr[j * 3] = pt.x;
      arr[j * 3 + 1] = pt.y;
      arr[j * 3 + 2] = pt.z;
    }
    posAttr.needsUpdate = true;

    // En modo 2D (t = 0), se desvanece suavemente la opacidad de los anillos orbitales
    const isSelected = satEnt.id === selectedSatId;
    orbitObj.line.visible = t > 0.02;

    if (isSelected) {
      orbitObj.mat.color.setHex(0x00ff88);
      orbitObj.mat.opacity = (0.85 + 0.15 * Math.sin(clock.getElapsedTime() * 6.0)) * t;
    } else {
      orbitObj.mat.color.setHex(0x00e5ff);
      orbitObj.mat.opacity = 0.35 * t;
    }
  });
}

// ==============================================================================
// 7. ENTORNO, SATÉLITES Y ENTIDADES CON INTERPOLACIÓN DINÁMICA
// ==============================================================================
function setupEnvironmentObjects(env) {
  debrisGroup.clear();
  occupiedGroup.clear();
  regionsGroup.clear();
  targetRegionMeshes.clear();
  debrisEntities = [];
  occupiedEntities = [];

  // 1. Zonas de Desechos Espaciales (DEBRIS) - Cúpulas Rojas
  env.debris_zones.forEach((zone) => {
    const container = new THREE.Group();
    debrisGroup.add(container);

    const radR = EARTH_RADIUS * Math.sin((zone.radius_deg * Math.PI) / 180.0);
    const discGeo = new THREE.CircleGeometry(radR, 36);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0xff3344,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    container.add(disc);

    const ringGeo = new THREE.RingGeometry(radR * 0.96, radR * 1.04, 36);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3344, side: THREE.DoubleSide });
    container.add(new THREE.Mesh(ringGeo, ringMat));

    const coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff3344 })
    );
    coreMesh.position.z = 0.08;
    container.add(coreMesh);

    debrisEntities.push({
      data: zone,
      container: container,
      lat: zone.lat,
      lon: zone.lon,
    });
  });

  // 2. Objetos Espaciales Ocupados - Ámbar / Naranja
  env.occupied_positions.forEach((obj) => {
    const container = new THREE.Group();
    occupiedGroup.add(container);

    const radR = EARTH_RADIUS * Math.sin((obj.radius_deg * Math.PI) / 180.0);
    const bubbleGeo = new THREE.CircleGeometry(radR, 36);
    const bubbleMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    container.add(new THREE.Mesh(bubbleGeo, bubbleMat));

    const ringGeo = new THREE.RingGeometry(radR * 0.96, radR * 1.04, 36);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide });
    container.add(new THREE.Mesh(ringGeo, ringMat));

    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 0),
      new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    );
    marker.position.z = 0.08;
    container.add(marker);

    occupiedEntities.push({
      data: obj,
      container: container,
      lat: obj.lat,
      lon: obj.lon,
    });
  });

  // 3. Regiones Terrestres Objetivo (6)
  env.target_regions.forEach((region) => {
    const container = new THREE.Group();
    regionsGroup.add(container);

    const pinMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      roughness: 0.25,
      metalness: 0.8,
      emissive: 0x00ff88,
      emissiveIntensity: 0.45,
    });
    const pinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.03, 0.26, 16), pinMat);
    pinMesh.position.y = 0.13;
    container.add(pinMesh);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.18, 24), ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    container.add(ringMesh);

    targetRegionMeshes.set(region.name, {
      container: container,
      pinMat: pinMat,
      ringMat: ringMat,
      data: region,
      lat: region.lat,
      lon: region.lon,
    });
  });
}

function setupSatellites() {
  satellitesGroup.clear();
  satelliteEntities = [];

  for (let i = 1; i <= 8; i++) {
    const satGroup = new THREE.Group();

    // Cuerpo principal cúbico
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.9,
      roughness: 0.15,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.5,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.26), bodyMat);
    satGroup.add(body);

    // Paneles solares
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x0f2b4c, roughness: 0.3, metalness: 0.7 });
    const pL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.18), panelMat);
    pL.position.x = 0.34;
    satGroup.add(pL);

    const pR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.18), panelMat);
    pR.position.x = -0.34;
    satGroup.add(pR);

    satellitesGroup.add(satGroup);

    // Línea Nadir hacia la superficie terrestre
    const nadirLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const nadirLineMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.45 });
    const nadirLine = new THREE.Line(nadirLineGeo, nadirLineMat);
    earthGroup.add(nadirLine);

    // Cono 3D de cobertura orientado a nadir
    const coneGeo = new THREE.ConeGeometry(CONE_BASE_RADIUS, CONE_HEIGHT, 36, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const coneMesh = new THREE.Mesh(coneGeo, coneMat);
    earthGroup.add(coneMesh);

    // Huella circular geodésica sobre la superficie
    const footprintGeo = new THREE.CircleGeometry(CONE_BASE_RADIUS, 36);
    const footprintMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.20,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const footprint = new THREE.Mesh(footprintGeo, footprintMat);
    earthGroup.add(footprint);

    // Contenedor tangente y anillo de escaneo pulsante
    const scanContainer = new THREE.Group();
    const scanRingGeo = new THREE.RingGeometry(CONE_BASE_RADIUS * 0.94, CONE_BASE_RADIUS * 1.06, 36);
    const scanRingMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const scanRing = new THREE.Mesh(scanRingGeo, scanRingMat);
    scanRing.rotation.x = Math.PI / 2;
    scanContainer.add(scanRing);
    earthGroup.add(scanContainer);

    satelliteEntities.push({
      id: i,
      group: satGroup,
      nadirLine: nadirLine,
      coneMesh: coneMesh,
      footprint: footprint,
      scanContainer: scanContainer,
      scanRing: scanRing,
      lat: 0,
      lon: 0,
      currentPos: new THREE.Vector3(),
    });
  }
}

// ==============================================================================
// 8. ACTUALIZACIÓN DEL MORFADO GEOMÉTRICO (UPDATE PLANET MORPH)
// ==============================================================================
function updatePlanetMorph() {
  const t = morphProgress.value; // 1.0 = Globo 3D, 0.0 = Mapa 2D Plano

  // 1. Morfar vértices de la malla planetaria
  if (earthMesh && pos2DArray && pos3DArray) {
    const posAttr = earthMesh.geometry.attributes.position;
    const arr = posAttr.array;
    const count = arr.length / 3;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      arr[idx] = (1.0 - t) * pos2DArray[idx] + t * pos3DArray[idx];
      arr[idx + 1] = (1.0 - t) * pos2DArray[idx + 1] + t * pos3DArray[idx + 1];
      arr[idx + 2] = (1.0 - t) * pos2DArray[idx + 2] + t * pos3DArray[idx + 2];
    }
    posAttr.needsUpdate = true;
    earthMesh.geometry.computeVertexNormals();
  }

  // 2. Modulación de la atmósfera exterior
  if (atmosphereMesh) {
    atmosphereMesh.visible = (t > 0.15) && layerStates.atmosphere;
    if (atmosphereMesh.material) {
      atmosphereMesh.material.opacity = 0.08 * t;
    }
  }

  // 3. Morfar marcadores de regiones, debris y objetos
  updateAllEntitiesMorph(t);

  // 4. Actualizar desvanecimiento de trayectorias orbitales
  updateOrbitalTrajectories();
}

function updateAllEntitiesMorph(t) {
  // 1. Regiones objetivo
  targetRegionMeshes.forEach((meshObj) => {
    const pos = getInterpolatedPosition(meshObj.lat, meshObj.lon, EARTH_RADIUS * 1.004, 0.08, t);
    const norm = getInterpolatedNormal(meshObj.lat, meshObj.lon, t);
    meshObj.container.position.copy(pos);
    meshObj.container.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), norm);
  });

  // 2. Zonas de Desechos (DEBRIS)
  debrisEntities.forEach((zone) => {
    const pos = getInterpolatedPosition(zone.lat, zone.lon, EARTH_RADIUS * 1.002, 0.04, t);
    const norm = getInterpolatedNormal(zone.lat, zone.lon, t);
    zone.container.position.copy(pos);
    zone.container.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), norm);
  });

  // 3. Posiciones Ocupadas
  occupiedEntities.forEach((obj) => {
    const pos = getInterpolatedPosition(obj.lat, obj.lon, EARTH_RADIUS * 1.002, 0.04, t);
    const norm = getInterpolatedNormal(obj.lat, obj.lon, t);
    obj.container.position.copy(pos);
    obj.container.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), norm);
  });

  // 4. Satélites, Conos y Huellas
  satelliteEntities.forEach((sat) => {
    const satPos = getInterpolatedPosition(sat.lat, sat.lon, SAT_ORBIT_RADIUS, 1.35, t);
    const nadirPos = getInterpolatedPosition(sat.lat, sat.lon, EARTH_RADIUS * 1.002, 0.04, t);
    const norm = getInterpolatedNormal(sat.lat, sat.lon, t);

    sat.currentPos.copy(satPos);
    sat.group.position.copy(satPos);
    sat.group.lookAt(nadirPos);

    // Actualizar línea nadir
    const lineArr = sat.nadirLine.geometry.attributes.position.array;
    lineArr[0] = satPos.x; lineArr[1] = satPos.y; lineArr[2] = satPos.z;
    lineArr[3] = nadirPos.x; lineArr[4] = nadirPos.y; lineArr[5] = nadirPos.z;
    sat.nadirLine.geometry.attributes.position.needsUpdate = true;

    // Actualizar cono nadir 3D
    const dir = nadirPos.clone().sub(satPos).normalize();
    const dist = satPos.distanceTo(nadirPos);
    sat.coneMesh.position.copy(satPos.clone().addScaledVector(dir, dist / 2.0));
    sat.coneMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);

    sat.coneMesh.visible = (t > 0.05) && layerStates.cones;
    sat.coneMesh.material.opacity = 0.22 * t;

    // Actualizar huella y anillo de escaneo
    sat.footprint.position.copy(nadirPos);
    sat.footprint.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), norm);

    sat.scanContainer.position.copy(nadirPos);
    sat.scanContainer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), norm);

    sat.footprint.visible = layerStates.cones;
    sat.nadirLine.visible = layerStates.cones;
    sat.scanContainer.visible = layerStates.cones;
  });

  // 5. Halo del satélite seleccionado
  if (selectedSatHalo && selectedSatHalo.visible) {
    const activeSat = satelliteEntities[selectedSatId - 1];
    if (activeSat) {
      selectedSatHalo.position.copy(activeSat.currentPos);
      selectedSatHalo.quaternion.copy(camera.quaternion);
    }
  }
}

// ==============================================================================
// 9. LÓGICA DE REPRODUCCIÓN GENERACIONAL E INTERPOLACIÓN GEODÉSICA
// ==============================================================================
function updateSimulationForGeneration(gen) {
  if (!appData) return;
  currentGen = Math.max(0, Math.min(gen, maxGen));

  // 1. Actualizar controles visuales de la barra inferior
  document.getElementById('gen-scrubber').value = currentGen;
  document.getElementById('gen-scrubber-label').textContent = `GEN: ${currentGen.toString().padStart(3, '0')} / ${maxGen}`;

  const tGen = currentGen / maxGen;
  const initSats = appData.initial_state.satellites;
  const finalSats = appData.final_state.satellites;

  // 2. Interpolación satélite por satélite
  for (let i = 0; i < 8; i++) {
    const satEnt = satelliteEntities[i];
    const s0 = initSats[i];
    const s1 = finalSats[i];

    // Interpolación lineal de latitud
    const lat = s0.lat + tGen * (s1.lat - s0.lat);

    // Interpolación geodésica en longitud (-180° a +180°)
    let dlon = s1.lon - s0.lon;
    while (dlon > 180.0) dlon -= 360.0;
    while (dlon < -180.0) dlon += 360.0;
    let lon = ((s0.lon + tGen * dlon + 180.0) % 360.0 + 360.0) % 360.0 - 180.0;

    satEnt.lat = lat;
    satEnt.lon = lon;
  }

  // 3. Aplicar posiciones según el estado actual de morphProgress
  updatePlanetMorph();

  // 4. Evaluar cobertura instantánea de las 6 regiones y generar rayos láser
  lasersGroup.clear();
  const coveredRegionsMap = new Map();

  appData.environment.target_regions.forEach((region) => {
    coveredRegionsMap.set(region.name, { isCovered: false, observingSats: [] });
  });

  satelliteEntities.forEach((sat) => {
    appData.environment.target_regions.forEach((region) => {
      const distDeg = angularDistanceDeg(sat.lat, sat.lon, region.lat, region.lon);
      if (distDeg <= FOOTPRINT_RADIUS_DEG) {
        coveredRegionsMap.get(region.name).isCovered = true;
        coveredRegionsMap.get(region.name).observingSats.push(sat.id);

        if (layerStates.lasers) {
          const satPos = sat.currentPos;
          const regPos = getInterpolatedPosition(region.lat, region.lon, EARTH_RADIUS * 1.008, 0.1, morphProgress.value);
          const laserGeo = new THREE.BufferGeometry().setFromPoints([satPos, regPos]);
          const laserMat = new THREE.LineBasicMaterial({
            color: 0x00e5ff,
            transparent: true,
            opacity: 0.85,
            linewidth: 2,
          });
          lasersGroup.add(new THREE.Line(laserGeo, laserMat));
        }
      }
    });
  });

  // 5. Actualizar interfaz HUD
  updateRegionsHUD(coveredRegionsMap);
  updateSelectedSatelliteTelemetry();
  updateKPIsTelemetry(tGen);
}

function updateRegionsHUD(coveredMap) {
  const container = document.getElementById('regions-monitor-container');
  container.innerHTML = '';

  appData.environment.target_regions.forEach((reg) => {
    const status = coveredMap.get(reg.name) || { isCovered: false };
    const row = document.createElement('div');
    row.className = 'region-row';
    row.innerHTML = `
      <div class="region-name-box">
        <span style="font-weight: 700;">${reg.name}</span>
        <span class="region-prio-tag">Prioridad: ${reg.priority} (${reg.weight.toFixed(1)} pts)</span>
      </div>
      <span class="region-status-badge ${status.isCovered ? 'covered' : 'uncovered'}">
        ${status.isCovered ? 'CUBIERTA 100% ✓' : 'SIN COBERTURA ⚠'}
      </span>
    `;
    container.appendChild(row);

    const meshObj = targetRegionMeshes.get(reg.name);
    if (meshObj) {
      const activeColor = status.isCovered ? 0x00ff88 : 0xff3344;
      meshObj.pinMat.color.setHex(activeColor);
      meshObj.pinMat.emissive.setHex(activeColor);
      meshObj.ringMat.color.setHex(activeColor);
    }
  });
}

function updateSelectedSatelliteTelemetry() {
  const sat = satelliteEntities[selectedSatId - 1];
  if (!sat) return;

  if (selectedSatHalo) {
    selectedSatHalo.visible = true;
    selectedSatHalo.position.copy(sat.currentPos);
    selectedSatHalo.quaternion.copy(camera.quaternion);
  }

  document.getElementById('telem-sat-name').textContent = `SAT-${sat.id} (Activo)`;
  document.getElementById('telem-sat-coords').textContent = `${sat.lat >= 0 ? '+' : ''}${sat.lat.toFixed(2)}°, ${sat.lon >= 0 ? '+' : ''}${sat.lon.toFixed(2)}°`;

  let minDistanceDeg = 999.0;
  let nearestThreatName = '';
  let isThreatViolation = false;

  if (appData) {
    appData.environment.debris_zones.forEach((z) => {
      const d = angularDistanceDeg(sat.lat, sat.lon, z.lat, z.lon);
      if (d < minDistanceDeg) {
        minDistanceDeg = d;
        nearestThreatName = z.name;
        isThreatViolation = d < z.radius_deg;
      }
    });

    appData.environment.occupied_positions.forEach((o) => {
      const d = angularDistanceDeg(sat.lat, sat.lon, o.lat, o.lon);
      if (d < minDistanceDeg) {
        minDistanceDeg = d;
        nearestThreatName = o.name;
        isThreatViolation = d < o.radius_deg;
      }
    });
  }

  const proximityEl = document.getElementById('telem-sat-proximity');
  if (isThreatViolation) {
    proximityEl.textContent = `ALERTA: INVASIÓN (<${minDistanceDeg.toFixed(1)}°)`;
    proximityEl.className = 'telem-val red';
  } else if (minDistanceDeg < 15.0) {
    proximityEl.textContent = `PRECAUCIÓN (${minDistanceDeg.toFixed(1)}° a ${nearestThreatName})`;
    proximityEl.className = 'telem-val';
    proximityEl.style.color = 'var(--neon-amber)';
  } else {
    proximityEl.textContent = `SEGURA (>${minDistanceDeg.toFixed(1)}°)`;
    proximityEl.className = 'telem-val green';
  }

  const targetsInRange = [];
  if (appData) {
    appData.environment.target_regions.forEach((r) => {
      if (angularDistanceDeg(sat.lat, sat.lon, r.lat, r.lon) <= FOOTPRINT_RADIUS_DEG) {
        targetsInRange.push(r.name.split(',')[0]);
      }
    });
  }

  document.getElementById('telem-sat-targets').textContent = targetsInRange.length > 0 ? targetsInRange.join(', ') : 'Ninguno';
}

function updateKPIsTelemetry(t) {
  if (!appData || !appData.convergence_history) return;

  const history = appData.convergence_history;
  const targetIdx = Math.round(t * (history.length - 1));
  const record = history[targetIdx] || history[history.length - 1];

  const totalPossibleWeight = appData.environment.target_regions.reduce((acc, r) => acc + r.weight, 0);
  const coveragePct = totalPossibleWeight > 0 ? (record.coverage_score / totalPossibleWeight) * 100.0 : 0.0;

  document.getElementById('kpi-fitness').textContent = record.best_fitness.toFixed(2);
  document.getElementById('kpi-coverage').textContent = `${coveragePct.toFixed(1)}%`;
  document.getElementById('kpi-violations').textContent = record.violations.toString();

  const validityBadge = document.getElementById('kpi-validity');
  if (record.is_valid) {
    validityBadge.textContent = 'VÁLIDA';
    validityBadge.className = 'kpi-status-badge valid';
  } else {
    validityBadge.textContent = 'INVÁLIDA';
    validityBadge.className = 'kpi-status-badge invalid';
  }
}

// ==============================================================================
// 10. ANIMACIONES CINEMÁTICAS DE CÁMARA Y MORFADO CONTINUO
// ==============================================================================
/**
 * Anima suavemente la cámara con OrbitControls usando Tween.js.
 */
function animateCameraTo(targetPos, targetLookAt, duration = 1200, onCompleteCallback = null) {
  if (typeof TWEEN === 'undefined') {
    camera.position.copy(targetPos);
    controls.target.copy(targetLookAt);
    if (onCompleteCallback) onCompleteCallback();
    return;
  }

  if (currentCameraTween) currentCameraTween.stop();
  if (currentTargetTween) currentTargetTween.stop();

  controls.enabled = false;

  const startPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  const startTarget = { x: controls.target.x, y: controls.target.y, z: controls.target.z };

  currentCameraTween = new TWEEN.Tween(startPos)
    .to({ x: targetPos.x, y: targetPos.y, z: targetPos.z }, duration)
    .easing(TWEEN.Easing.Cubic.InOut)
    .onUpdate(() => {
      camera.position.set(startPos.x, startPos.y, startPos.z);
    })
    .onComplete(() => {
      controls.enabled = true;
      currentCameraTween = null;
      if (onCompleteCallback) onCompleteCallback();
    })
    .start();

  currentTargetTween = new TWEEN.Tween(startTarget)
    .to({ x: targetLookAt.x, y: targetLookAt.y, z: targetLookAt.z }, duration)
    .easing(TWEEN.Easing.Cubic.InOut)
    .onUpdate(() => {
      controls.target.set(startTarget.x, startTarget.y, startTarget.z);
    })
    .onComplete(() => {
      currentTargetTween = null;
    })
    .start();
}

/**
 * Enfoque cinemático automático al hacer clic en satélites [S1..S8].
 */
function focusOnSatellite(satId) {
  const sat = satelliteEntities[satId - 1];
  if (!sat) return;

  if (currentViewMode === '3d') {
    const satVector = latLonToVector3(sat.lat, sat.lon, SAT_ORBIT_RADIUS);
    const orbitalDist = SAT_ORBIT_RADIUS * 2.2;
    const targetCamPos = satVector.clone().normalize().multiplyScalar(orbitalDist);
    const targetLook = satVector.clone().multiplyScalar(0.5);
    animateCameraTo(targetCamPos, targetLook, 1200);
  } else {
    // En modo plano 2D, enfocar de frente sobre el satélite
    const satPos2D = latLonTo2D(sat.lat, sat.lon, 0);
    const targetCamPos = new THREE.Vector3(satPos2D.x, satPos2D.y, 14.0);
    const targetLook = new THREE.Vector3(satPos2D.x, satPos2D.y, 0.0);
    animateCameraTo(targetCamPos, targetLook, 1200);
  }
}

/**
 * Transición geométrica continua entre Globo 3D y Mapa 2D plano (Mesh Unrolling).
 */
function transitionViewMode(mode) {
  if (currentViewMode === mode) return;
  currentViewMode = mode;

  const btn3D = document.getElementById('view-mode-3d');
  const btn2D = document.getElementById('view-mode-2d');

  if (currentMorphTween) currentMorphTween.stop();
  if (currentCameraTween) currentCameraTween.stop();
  if (currentTargetTween) currentTargetTween.stop();

  controls.enabled = false;

  const targetMorphVal = mode === '3d' ? 1.0 : 0.0;
  const targetCam = mode === '3d'
    ? new THREE.Vector3(13.0, 8.0, 14.0)
    : new THREE.Vector3(0.0, 0.0, 22.0);
  const targetTarget = new THREE.Vector3(0, 0, 0);

  if (mode === '3d') {
    btn3D.classList.add('active');
    btn2D.classList.remove('active');
  } else {
    btn2D.classList.add('active');
    btn3D.classList.remove('active');
  }

  // 1. Animación del morfado de la malla terrestre
  currentMorphTween = new TWEEN.Tween(morphProgress)
    .to({ value: targetMorphVal }, 1500)
    .easing(TWEEN.Easing.Cubic.InOut)
    .onUpdate(() => {
      updatePlanetMorph();
    })
    .onComplete(() => {
      currentMorphTween = null;
      controls.enabled = true;

      if (mode === '2d') {
        // En modo 2D plano: restringir rotación y permitir paneo/zoom plano
        controls.enableRotate = false;
        controls.screenSpacePanning = true;
        controls.minDistance = 5.0;
        controls.maxDistance = 45.0;
      } else {
        // En modo 3D: rotación libre en 360°
        controls.enableRotate = true;
        controls.minDistance = 6.8;
        controls.maxDistance = 35.0;
      }
    })
    .start();

  // 2. Animación coordinada de la cámara
  const startPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  const startTarget = { x: controls.target.x, y: controls.target.y, z: controls.target.z };

  currentCameraTween = new TWEEN.Tween(startPos)
    .to({ x: targetCam.x, y: targetCam.y, z: targetCam.z }, 1500)
    .easing(TWEEN.Easing.Cubic.InOut)
    .onUpdate(() => {
      camera.position.set(startPos.x, startPos.y, startPos.z);
    })
    .start();

  currentTargetTween = new TWEEN.Tween(startTarget)
    .to({ x: targetTarget.x, y: targetTarget.y, z: targetTarget.z }, 1500)
    .easing(TWEEN.Easing.Cubic.InOut)
    .onUpdate(() => {
      controls.target.set(startTarget.x, startTarget.y, startTarget.z);
    })
    .start();
}

function setupCameraPresets() {
  const presets = {
    'cam-preset-global': { pos: new THREE.Vector3(13.0, 8.0, 14.0), target: new THREE.Vector3(0, 0, 0) },
    'cam-preset-arctic': { pos: new THREE.Vector3(0.1, 18.0, 0.1), target: new THREE.Vector3(0, 0, 0) },
    'cam-preset-antarctic': { pos: new THREE.Vector3(0.1, -18.0, 0.1), target: new THREE.Vector3(0, 0, 0) },
    'cam-preset-equator': { pos: new THREE.Vector3(18.0, 0.0, 0.0), target: new THREE.Vector3(0, 0, 0) },
  };

  Object.keys(presets).forEach((btnId) => {
    document.getElementById(btnId).addEventListener('click', () => {
      followSatelliteMode = false;
      document.querySelectorAll('.cam-btn').forEach((b) => b.classList.remove('active'));
      document.getElementById(btnId).classList.add('active');

      if (currentViewMode !== '3d') {
        transitionViewMode('3d');
      }

      const p = presets[btnId];
      animateCameraTo(p.pos, p.target, 1200);
    });
  });

  document.getElementById('cam-preset-follow').addEventListener('click', () => {
    followSatelliteMode = true;
    document.querySelectorAll('.cam-btn').forEach((b) => b.classList.remove('active'));
    document.getElementById('cam-preset-follow').classList.add('active');
    focusOnSatellite(selectedSatId);
  });
}

// ==============================================================================
// 11. GESTIÓN DE EVENTOS DE USUARIO E INTERACCIÓN
// ==============================================================================
let isCinemaMode = false;
let isLeftSidebarCollapsed = false;
let isRightSidebarCollapsed = false;

function triggerCanvasResize() {
  onWindowResize();
  window.dispatchEvent(new Event('resize'));
}

function enterCinemaMode() {
  isCinemaMode = true;
  document.body.classList.add('cinema-mode');
  const btnCinema = document.getElementById('btn-cinema-mode');
  if (btnCinema) btnCinema.classList.add('active');
  triggerCanvasResize();
}

function exitCinemaMode() {
  isCinemaMode = false;
  document.body.classList.remove('cinema-mode');
  const btnCinema = document.getElementById('btn-cinema-mode');
  if (btnCinema) btnCinema.classList.remove('active');
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  triggerCanvasResize();
}

function toggleCinemaMode() {
  if (!isCinemaMode) {
    enterCinemaMode();
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } else {
    exitCinemaMode();
  }
}

function setupUserInteractions() {
  // Selector de Vista: Morfado 3D Globo <-> 2D Mapa Plano
  document.getElementById('view-mode-3d').addEventListener('click', () => transitionViewMode('3d'));
  document.getElementById('view-mode-2d').addEventListener('click', () => transitionViewMode('2d'));

  // Modo Cine / Pantalla Completa
  const btnCinema = document.getElementById('btn-cinema-mode');
  if (btnCinema) {
    btnCinema.addEventListener('click', toggleCinemaMode);
  }

  const btnRestore = document.getElementById('btn-restore-hud');
  if (btnRestore) {
    btnRestore.addEventListener('click', toggleCinemaMode);
  }

  // Colapso / Despliegue de Panel Lateral Izquierdo
  const btnToggleLeft = document.getElementById('btn-toggle-left');
  const sidebarLeft = document.querySelector('.hud-sidebar-left');
  if (btnToggleLeft && sidebarLeft) {
    btnToggleLeft.addEventListener('click', () => {
      isLeftSidebarCollapsed = !isLeftSidebarCollapsed;
      sidebarLeft.classList.toggle('collapsed', isLeftSidebarCollapsed);
      const icon = btnToggleLeft.querySelector('.toggle-icon');
      if (icon) icon.textContent = isLeftSidebarCollapsed ? '▶' : '◀';
      btnToggleLeft.title = isLeftSidebarCollapsed ? 'Desplegar panel izquierdo' : 'Colapsar panel izquierdo';
      triggerCanvasResize();
    });
  }

  // Colapso / Despliegue de Panel Lateral Derecho
  const btnToggleRight = document.getElementById('btn-toggle-right');
  const sidebarRight = document.querySelector('.hud-sidebar-right');
  if (btnToggleRight && sidebarRight) {
    btnToggleRight.addEventListener('click', () => {
      isRightSidebarCollapsed = !isRightSidebarCollapsed;
      sidebarRight.classList.toggle('collapsed', isRightSidebarCollapsed);
      const icon = btnToggleRight.querySelector('.toggle-icon');
      if (icon) icon.textContent = isRightSidebarCollapsed ? '◀' : '▶';
      btnToggleRight.title = isRightSidebarCollapsed ? 'Desplegar panel derecho' : 'Colapsar panel derecho';
      triggerCanvasResize();
    });
  }

  // Atajos de Teclado: 'F' para Modo Cine / Pantalla Completa, 'Escape' para salir
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleCinemaMode();
    } else if (e.key === 'Escape' && isCinemaMode) {
      exitCinemaMode();
    }
  });

  // Detección de salida de pantalla completa nativa
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isCinemaMode) {
      exitCinemaMode();
    }
  });

  // Matriz de Satélites S1 a S8
  document.querySelectorAll('.sat-matrix-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sat-matrix-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSatId = parseInt(btn.getAttribute('data-sat-id'), 10);
      document.getElementById('follow-sat-tag').textContent = `[S${selectedSatId}]`;
      updateSelectedSatelliteTelemetry();
      updateOrbitalTrajectories();
      focusOnSatellite(selectedSatId);
    });
  });

  // Toggles de Capas Holográficas
  document.getElementById('toggle-cones').addEventListener('change', (e) => {
    layerStates.cones = e.target.checked;
    satelliteEntities.forEach((sat) => {
      sat.coneMesh.visible = (morphProgress.value > 0.05) && layerStates.cones;
      sat.footprint.visible = layerStates.cones;
      sat.nadirLine.visible = layerStates.cones;
      sat.scanContainer.visible = layerStates.cones;
    });
  });

  document.getElementById('toggle-lasers').addEventListener('change', (e) => {
    layerStates.lasers = e.target.checked;
    lasersGroup.visible = layerStates.lasers;
    updateSimulationForGeneration(currentGen);
  });

  document.getElementById('toggle-atmosphere').addEventListener('change', (e) => {
    layerStates.atmosphere = e.target.checked;
    if (atmosphereMesh) atmosphereMesh.visible = (morphProgress.value > 0.15) && layerStates.atmosphere;
  });

  // Scrubber / Slider Generacional
  const scrubber = document.getElementById('gen-scrubber');
  scrubber.addEventListener('input', (e) => {
    if (isPlaying) togglePlayPause();
    updateSimulationForGeneration(parseInt(e.target.value, 10));
  });

  // Controles de Reproducción
  document.getElementById('btn-prev-gen').addEventListener('click', () => {
    if (isPlaying) togglePlayPause();
    updateSimulationForGeneration(currentGen - 1);
  });

  document.getElementById('btn-next-gen').addEventListener('click', () => {
    if (isPlaying) togglePlayPause();
    updateSimulationForGeneration(currentGen + 1);
  });

  document.getElementById('btn-play-pause').addEventListener('click', togglePlayPause);

  document.getElementById('speed-selector').addEventListener('change', (e) => {
    playbackSpeed = parseInt(e.target.value, 10);
  });

  // Input de archivo de respaldo para protocolo file://
  document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        onDataReady(parsed);
        document.getElementById('fallback-alert').style.display = 'none';
      } catch (err) {
        alert('Error al procesar JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
}

function togglePlayPause() {
  isPlaying = !isPlaying;
  const btn = document.getElementById('btn-play-pause');
  if (isPlaying) {
    btn.textContent = '⏸ Pausa';
    btn.classList.add('active');
    if (currentGen >= maxGen) currentGen = 0;
  } else {
    btn.textContent = '▶ Play';
    btn.classList.remove('active');
  }
}

// ==============================================================================
// 12. CARGA DE DATOS DE TELEMETRÍA (FETCH / FALLBACK)
// ==============================================================================
function loadTelemetryData() {
  fetch('./data/run_results.json')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      return res.json();
    })
    .then((data) => {
      onDataReady(data);
    })
    .catch((err) => {
      console.warn('Fetch automático bloqueado (protocolo file://). Activando fallback:', err);
      const alertBox = document.getElementById('fallback-alert');
      if (alertBox) alertBox.style.display = 'flex';
    });
}

function onDataReady(data) {
  appData = data;
  if (data.metadata && data.metadata.parameters && data.metadata.parameters.generations) {
    maxGen = data.metadata.parameters.generations;
  } else if (data.convergence_history) {
    maxGen = data.convergence_history.length - 1;
  }

  document.getElementById('gen-scrubber').max = maxGen;

  setupEnvironmentObjects(data.environment);
  setupSatellites();
  updateSimulationForGeneration(maxGen);
}

// ==============================================================================
// 13. BUCLE PRINCIPAL DE ANIMACIÓN Y RENDERIZADO
// ==============================================================================
function onWindowResize() {
  if (camera && renderer) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

function animate(timestamp) {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();

  // Actualización de animaciones cinemáticas Tween.js
  if (typeof TWEEN !== 'undefined') {
    TWEEN.update();
  }

  // Reproducción generacional automática
  if (isPlaying && appData) {
    if (timestamp - lastPlaybackTime > 120 / playbackSpeed) {
      if (currentGen < maxGen) {
        updateSimulationForGeneration(currentGen + 1);
      } else {
        togglePlayPause();
      }
      lastPlaybackTime = timestamp;
    }
  }

  // Rotación lenta ambiental del globo en 3D libre si el usuario no arrastra la cámara
  if (earthGroup && controls.state === -1 && !followSatelliteMode && currentViewMode === '3d' && morphProgress.value > 0.95) {
    earthGroup.rotation.y += 0.0006;
  }

  // Animación dinámica de escaneo/barrido en la superficie terrestre (0.8x a 1.2x)
  if (layerStates.cones) {
    satelliteEntities.forEach((sat, idx) => {
      if (sat.scanRing && sat.scanContainer) {
        const phase = elapsedTime * 3.0 + idx * 0.785;
        const scaleVal = 1.0 + 0.2 * Math.sin(phase);
        sat.scanRing.scale.set(scaleVal, scaleVal, scaleVal);

        const isSelected = sat.id === selectedSatId;
        const baseOpacity = isSelected ? 0.85 : 0.45;
        const opacityVal = baseOpacity + 0.25 * Math.sin(phase);
        sat.scanRing.material.opacity = Math.max(0.1, Math.min(1.0, opacityVal));
      }
    });
  }

  // Resaltado dinámico del anillo orbital del satélite seleccionado
  if (morphProgress.value > 0.02) {
    orbitLines.forEach((orbitObj) => {
      if (orbitObj.id === selectedSatId) {
        orbitObj.mat.opacity = (0.80 + 0.20 * Math.sin(elapsedTime * 5.0)) * morphProgress.value;
      }
    });
  }

  // Pulsación suave de los pines de las regiones terrestres
  const pulse = 1.0 + Math.sin(elapsedTime * 4.0) * 0.08;
  targetRegionMeshes.forEach((meshObj) => {
    meshObj.container.scale.set(pulse, pulse, pulse);
  });

  // Halo del satélite seleccionado
  if (selectedSatHalo && selectedSatHalo.visible) {
    selectedSatHalo.quaternion.copy(camera.quaternion);
  }

  // Modo seguimiento continuo de satélite foco
  if (followSatelliteMode) {
    const sat = satelliteEntities[selectedSatId - 1];
    if (sat) {
      const satPos = sat.currentPos;
      controls.target.lerp(satPos, 0.08);
      const targetCam = satPos.clone().multiplyScalar(1.95);
      camera.position.lerp(targetCam, 0.08);
    }
  }

  // Controles Three.js y renderizado WebGL
  controls.update();
  renderer.render(scene, camera);
}

// ==============================================================================
// 14. PUNTO DE ENTRADA
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  initThreeScene();
  setupCameraPresets();
  setupUserInteractions();
  loadTelemetryData();
  requestAnimationFrame(animate);
});
