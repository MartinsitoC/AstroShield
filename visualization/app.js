/**
 * AstroShield 3D — Constellation Monitor & Orbital Viewer
 * Renderizador interactivo en Three.js para la constelación satelital LEO.
 */

// ==============================================================================
// CONSTANTES GLOBALES Y ESCALAS 3D
// ==============================================================================
const EARTH_RADIUS = 5.0;
const SAT_ORBIT_RADIUS = 5.95;
const R_EARTH_KM = 6371.0;
const OBSERVATION_RADIUS_KM = 300.0;
// Radio angular del footprint de observación en grados: (300 / 6371) * (180 / PI) ≈ 2.698°
const FOOTPRINT_RADIUS_DEG = (OBSERVATION_RADIUS_KM / R_EARTH_KM) * (180.0 / Math.PI);

// ==============================================================================
// ESTADO DE LA APLICACIÓN
// ==============================================================================
let appData = null;
let currentStateKey = 'final'; // 'initial' | 'final'

let scene, camera, renderer, controls;
let earthGroup, debrisGroup, occupiedGroup, regionsGroup, satellitesGroup;
let targetRegionMeshes = new Map();
let satelliteObjects = [];

// ==============================================================================
// FUNCIÓN MATEMÁTICA: LATITUD/LONGITUD A VECTOR3 (ESFERA 3D)
// ==============================================================================
/**
 * Convierte latitud y longitud en grados sexagesimales a coordenadas cartesianas (X, Y, Z).
 * Orienta el Polo Norte hacia +Y, el Meridiano de Greenwich hacia +Z y 90° Este hacia +X.
 *
 * @param {number} lat - Latitud en grados [-90.0, 90.0].
 * @param {number} lon - Longitud en grados [-180.0, 180.0].
 * @param {number} radius - Radio de la esfera.
 * @returns {THREE.Vector3}
 */
function latLonToVector3(lat, lon, radius) {
  const phi = (lat * Math.PI) / 180.0;
  const theta = (lon * Math.PI) / 180.0;

  const x = radius * Math.cos(phi) * Math.sin(theta);
  const y = radius * Math.sin(phi);
  const z = radius * Math.cos(phi) * Math.cos(theta);

  return new THREE.Vector3(x, y, z);
}

// ==============================================================================
// GENERACIÓN GEOMÉTRICA DE CÚPULAS ESFÉRICAS (ZONAS CIRCULARES SOBRE ESFERA)
// ==============================================================================
/**
 * Crea una malla y contorno circular proyectado exactamente sobre la superficie esférica.
 *
 * @param {number} centerLat - Latitud central.
 * @param {number} centerLon - Longitud central.
 * @param {number} radiusDeg - Radio angular en grados.
 * @param {number} sphereRadius - Radio base de la esfera.
 * @param {number} color - Color hexadecimal.
 * @param {number} opacity - Opacidad de la superficie.
 * @returns {THREE.Group}
 */
function createSphericalZone(centerLat, centerLon, radiusDeg, sphereRadius, color, opacity) {
  const group = new THREE.Group();
  const segments = 48;
  const radAngle = (radiusDeg * Math.PI) / 180.0;
  const centerDir = latLonToVector3(centerLat, centerLon, 1.0).normalize();

  // Hallar dos vectores ortonormales en el plano tangente a centerDir
  let arbitrary = Math.abs(centerDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u1 = new THREE.Vector3().crossVectors(centerDir, arbitrary).normalize();
  const u2 = new THREE.Vector3().crossVectors(centerDir, u1).normalize();

  const perimeterPoints = [];
  const vertices = [];

  // Vértice central del abanico de triángulos
  const rOffset = sphereRadius * 1.002;
  const centerPoint = centerDir.clone().multiplyScalar(rOffset);
  vertices.push(centerPoint.x, centerPoint.y, centerPoint.z);

  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2.0;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);

    // Dirección en el borde angular: cos(radAngle) * center + sin(radAngle) * (cos(t)*u1 + sin(t)*u2)
    const dir = new THREE.Vector3()
      .copy(centerDir)
      .multiplyScalar(Math.cos(radAngle))
      .addScaledVector(u1, Math.sin(radAngle) * cosT)
      .addScaledVector(u2, Math.sin(radAngle) * sinT)
      .normalize();

    const pt = dir.clone().multiplyScalar(rOffset);
    perimeterPoints.push(pt);
    vertices.push(pt.x, pt.y, pt.z);
  }

  // Generar índices para abanico de triángulos (Triangle Fan)
  const indices = [];
  for (let i = 1; i <= segments; i++) {
    indices.push(0, i, i + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  // Línea perimetral de contorno
  const lineGeo = new THREE.BufferGeometry().setFromPoints(perimeterPoints);
  const lineMat = new THREE.LineBasicMaterial({
    color: color,
    transparent: true,
    opacity: Math.min(1.0, opacity * 2.2),
  });
  const border = new THREE.LineLoop(lineGeo, lineMat);
  group.add(border);

  return group;
}

// ==============================================================================
// INICIALIZACIÓN DE LA ESCENA 3D (THREE.JS)
// ==============================================================================
function initScene() {
  const container = document.getElementById('webgl-container');
  const width = window.innerWidth;
  const height = window.innerHeight;

  // 1. Escena
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060814);

  // 2. Cámara
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(13, 8, 14);

  // 3. Renderizador
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  // 4. OrbitControls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 7.0;
  controls.maxDistance = 35.0;

  // 5. Iluminación
  const ambientLight = new THREE.AmbientLight(0x223355, 1.2);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
  sunLight.position.set(20, 15, 25);
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x00d4ff, 0.6);
  fillLight.position.set(-20, -10, -20);
  scene.add(fillLight);

  // 6. Campo estelar (Starfield)
  createStarfield();

  // 7. Grupos jerárquicos de la escena
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

  // 8. Construcción del Globo Terrestre con rejilla holográfica
  buildEarthGlobe();

  // 9. Redimensionamiento adaptativo
  window.addEventListener('resize', onWindowResize);
}

// ==============================================================================
// CAMPO ESTELAR Y AMBIENTACIÓN CÓSMICA
// ==============================================================================
function createStarfield() {
  const starsCount = 1800;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starsCount * 3);
  const colors = new Float32Array(starsCount * 3);

  for (let i = 0; i < starsCount; i++) {
    const r = THREE.MathUtils.randFloat(70, 250);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloat(-1, 1));

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Matiz sutil azul/blanco/ámbar
    const tint = Math.random();
    if (tint > 0.8) {
      colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 1.0;
    } else if (tint > 0.6) {
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 0.6;
    } else {
      colors[i * 3] = 0.5; colors[i * 3 + 1] = 0.7; colors[i * 3 + 2] = 0.9;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
  });

  const stars = new THREE.Points(geometry, material);
  scene.add(stars);
}

// ==============================================================================
// CONSTRUCCIÓN DEL GLOBO TERRESTRE Y RED GEODÉSICA
// ==============================================================================
function buildEarthGlobe() {
  // Esfera base oceánica (azul oscuro profundo con brillo especular)
  const sphereGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 48);
  const sphereMat = new THREE.MeshPhongMaterial({
    color: 0x071329,
    emissive: 0x020712,
    specular: 0x00d4ff,
    shininess: 30,
    transparent: true,
    opacity: 0.96,
  });
  const earthSphere = new THREE.Mesh(sphereGeo, sphereMat);
  earthGroup.add(earthSphere);

  // Atmósfera exterior translúcida (Glow)
  const atmosGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.018, 48, 36);
  const atmosMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
  });
  const atmosSphere = new THREE.Mesh(atmosGeo, atmosMat);
  earthGroup.add(atmosSphere);

  // Rejilla de paralelos (latitudes)
  const latitudes = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
  latitudes.forEach((lat) => {
    const isEquator = lat === 0;
    const rParallel = EARTH_RADIUS * Math.cos((lat * Math.PI) / 180);
    const yParallel = EARTH_RADIUS * Math.sin((lat * Math.PI) / 180);

    const circlePoints = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      circlePoints.push(new THREE.Vector3(rParallel * Math.sin(a), yParallel, rParallel * Math.cos(a)));
    }
    const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePoints);
    const circleMat = new THREE.LineBasicMaterial({
      color: isEquator ? 0x00e5ff : 0x163456,
      transparent: true,
      opacity: isEquator ? 0.75 : 0.35,
    });
    earthGroup.add(new THREE.Line(circleGeo, circleMat));
  });

  // Rejilla de meridianos (longitudes cada 30°)
  for (let lon = -180; lon < 180; lon += 30) {
    const isGreenwich = lon === 0;
    const meridianPoints = [];
    for (let i = -90; i <= 90; i += 3) {
      meridianPoints.push(latLonToVector3(i, lon, EARTH_RADIUS * 1.001));
    }
    const meridianGeo = new THREE.BufferGeometry().setFromPoints(meridianPoints);
    const meridianMat = new THREE.LineBasicMaterial({
      color: isGreenwich ? 0x00e5ff : 0x163456,
      transparent: true,
      opacity: isGreenwich ? 0.65 : 0.28,
    });
    earthGroup.add(new THREE.Line(meridianGeo, meridianMat));
  }

  // Eje de rotación polar
  const polePoints = [
    new THREE.Vector3(0, -EARTH_RADIUS * 1.3, 0),
    new THREE.Vector3(0, EARTH_RADIUS * 1.3, 0),
  ];
  const poleGeo = new THREE.BufferGeometry().setFromPoints(polePoints);
  const poleMat = new THREE.LineDashedMaterial({
    color: 0x00e5ff,
    dashSize: 0.3,
    gapSize: 0.15,
    transparent: true,
    opacity: 0.4,
  });
  const poleLine = new THREE.Line(poleGeo, poleMat);
  poleLine.computeLineDistances();
  earthGroup.add(poleLine);
}

// ==============================================================================
// RENDERIZADO DE ELEMENTOS DEL ENTORNO (ZONAS Y REGIONES)
// ==============================================================================
function populateEnvironment(env) {
  debrisGroup.clear();
  occupiedGroup.clear();
  regionsGroup.clear();
  targetRegionMeshes.clear();

  // 1. Zonas de Escombros Espaciales (DEBRIS) - Rojo translúcido
  env.debris_zones.forEach((zone) => {
    const zoneMesh = createSphericalZone(
      zone.lat,
      zone.lon,
      zone.radius_deg,
      EARTH_RADIUS,
      0xff3344,
      0.35
    );
    debrisGroup.add(zoneMesh);

    // Núcleo central de la zona
    const centerPos = latLonToVector3(zone.lat, zone.lon, EARTH_RADIUS * 1.005);
    const coreGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.copy(centerPos);
    debrisGroup.add(coreMesh);
  });

  // 2. Posiciones Ocupadas Preexistentes - Ámbar/Naranja translúcido
  env.occupied_positions.forEach((obj) => {
    const bubbleMesh = createSphericalZone(
      obj.lat,
      obj.lon,
      obj.radius_deg,
      EARTH_RADIUS,
      0xffaa00,
      0.4
    );
    occupiedGroup.add(bubbleMesh);

    const centerPos = latLonToVector3(obj.lat, obj.lon, EARTH_RADIUS * 1.006);
    const markerGeo = new THREE.OctahedronGeometry(0.12, 0);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const markerMesh = new THREE.Mesh(markerGeo, markerMat);
    markerMesh.position.copy(centerPos);
    occupiedGroup.add(markerMesh);
  });

  // 3. Regiones Objetivo Terrestres (6)
  env.target_regions.forEach((region) => {
    const pos = latLonToVector3(region.lat, region.lon, EARTH_RADIUS * 1.004);

    const regionContainer = new THREE.Group();
    regionContainer.position.copy(pos);

    // Orientar contenedor perpendicular a la superficie de la esfera
    regionContainer.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      pos.clone().normalize()
    );

    // Cilindro / Pin base
    const pinGeo = new THREE.CylinderGeometry(0.09, 0.03, 0.25, 16);
    const pinMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0x00ff88,
      emissiveIntensity: 0.4,
    });
    const pinMesh = new THREE.Mesh(pinGeo, pinMat);
    pinMesh.position.y = 0.125;
    regionContainer.add(pinMesh);

    // Anillo exterior de referencia
    const ringGeo = new THREE.RingGeometry(0.12, 0.16, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    regionContainer.add(ringMesh);

    regionsGroup.add(regionContainer);

    // Guardar referencia para actualizar color dinámicamente según estado
    targetRegionMeshes.set(region.name, {
      container: regionContainer,
      pinMat: pinMat,
      ringMat: ringMat,
      data: region,
    });
  });
}

// ==============================================================================
// CREACIÓN Y GESTIÓN DE SATÉLITES Y HUELLAS DE COBERTURA
// ==============================================================================
function createSatelliteMesh(id) {
  const satGroup = new THREE.Group();

  // Bus central del satélite (Cuerpo cúbico brillante)
  const bodyGeo = new THREE.BoxGeometry(0.18, 0.18, 0.26);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.9,
    roughness: 0.2,
    emissive: 0x00d4ff,
    emissiveIntensity: 0.5,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  satGroup.add(body);

  // Paneles solares desplegados a los lados
  const panelGeo = new THREE.BoxGeometry(0.55, 0.02, 0.2);
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x103460,
    roughness: 0.4,
    metalness: 0.6,
  });
  const panelL = new THREE.Mesh(panelGeo, panelMat);
  panelL.position.x = 0.35;
  satGroup.add(panelL);

  const panelR = new THREE.Mesh(panelGeo, panelMat);
  panelR.position.x = -0.35;
  satGroup.add(panelR);

  // Línea nadir hacia la superficie terrestre
  const linePoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)];
  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.5,
  });
  const nadirLine = new THREE.Line(lineGeo, lineMat);
  earthGroup.add(nadirLine);

  // Footprint de cobertura en la superficie terrestre (círculo 300 km)
  const footprint = createSphericalZone(0, 0, FOOTPRINT_RADIUS_DEG, EARTH_RADIUS, 0x00e5ff, 0.22);
  earthGroup.add(footprint);

  return {
    group: satGroup,
    nadirLine: nadirLine,
    footprint: footprint,
    currentPos: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    targetLat: 0,
    targetLon: 0,
  };
}

function initSatellites() {
  satellitesGroup.clear();
  satelliteObjects = [];

  for (let i = 1; i <= 8; i++) {
    const sat = createSatelliteMesh(i);
    satellitesGroup.add(sat.group);
    satelliteObjects.push(sat);
  }
}

// ==============================================================================
// ACTUALIZACIÓN DINÁMICA DEL ESTADO Y TELEMETRÍA (HUD)
// ==============================================================================
function applyState(stateKey) {
  if (!appData) return;
  currentStateKey = stateKey;

  const stateData = stateKey === 'initial' ? appData.initial_state : appData.final_state;

  // 1. Actualizar botones del HUD
  document.getElementById('btn-initial').classList.toggle('active', stateKey === 'initial');
  document.getElementById('btn-final').classList.toggle('active', stateKey === 'final');

  // 2. Actualizar tarjetas de telemetría
  const fitnessEl = document.getElementById('stat-fitness');
  fitnessEl.textContent = stateData.fitness.toFixed(2);
  fitnessEl.className = 'telemetry-value ' + (stateData.fitness >= 10 ? 'green' : stateData.fitness >= 5 ? 'cyan' : 'red');

  document.getElementById('stat-fitness-sub').textContent =
    `Gen ${stateData.generation} (${stateKey === 'initial' ? 'Población Inicial' : 'Optimizado GA'})`;

  document.getElementById('stat-coverage').textContent = `${stateData.coverage_percentage.toFixed(1)}%`;
  document.getElementById('stat-coverage-sub').textContent =
    `${stateData.coverage_score.toFixed(1)} / ${appData.environment.target_regions.reduce((a, b) => a + b.weight, 0).toFixed(1)} pts`;

  document.getElementById('stat-regions').textContent = `${stateData.covered_regions.length} / 6`;
  document.getElementById('stat-regions-sub').textContent = `${(6 - stateData.covered_regions.length)} sin cobertura`;

  const violationsEl = document.getElementById('stat-violations');
  violationsEl.textContent = stateData.violations_count.toString();
  violationsEl.className = 'telemetry-value ' + (stateData.is_valid ? 'green' : 'red');

  const validityEl = document.getElementById('stat-validity');
  validityEl.textContent = stateData.is_valid ? 'Órbita Segura (Válida)' : 'Infracción Espacial';
  validityEl.style.color = stateData.is_valid ? 'var(--neon-green)' : 'var(--neon-red)';

  // 3. Actualizar lista de regiones en el HUD y colores en la esfera 3D
  const coveredSet = new Set(stateData.covered_regions);
  const regionsContainer = document.getElementById('regions-container');
  regionsContainer.innerHTML = '';

  appData.environment.target_regions.forEach((region) => {
    const isCovered = coveredSet.has(region.name);

    // Actualizar elemento HTML en el HUD
    const item = document.createElement('div');
    item.className = 'region-item';
    item.innerHTML = `
      <div class="region-info">
        <span class="region-name">${region.name}</span>
        <span class="region-meta">${region.lat > 0 ? '+' : ''}${region.lat}°, ${region.lon > 0 ? '+' : ''}${region.lon}° &bull; Prio: ${region.priority} (${region.weight.toFixed(1)} pts)</span>
      </div>
      <span class="region-badge ${isCovered ? 'covered' : 'uncovered'}">${isCovered ? 'Cubierta' : 'Sin Cob'}</span>
    `;
    regionsContainer.appendChild(item);

    // Actualizar materiales 3D de la región
    const regionMeshObj = targetRegionMeshes.get(region.name);
    if (regionMeshObj) {
      const activeColor = isCovered ? 0x00ff88 : 0xff3344;
      regionMeshObj.pinMat.color.setHex(activeColor);
      regionMeshObj.pinMat.emissive.setHex(activeColor);
      regionMeshObj.ringMat.color.setHex(activeColor);
    }
  });

  // 4. Actualizar posiciones de los 8 satélites y sus huellas terrestres
  stateData.satellites.forEach((satData, idx) => {
    const satObj = satelliteObjects[idx];
    if (!satObj) return;

    satObj.targetLat = satData.lat;
    satObj.targetLon = satData.lon;

    const satPos = latLonToVector3(satData.lat, satData.lon, SAT_ORBIT_RADIUS);
    const nadirPos = latLonToVector3(satData.lat, satData.lon, EARTH_RADIUS * 1.002);

    satObj.group.position.copy(satPos);
    // Orientar satélite apuntando hacia el centro de la Tierra (Nadir)
    satObj.group.lookAt(0, 0, 0);

    // Actualizar línea nadir
    const positions = satObj.nadirLine.geometry.attributes.position.array;
    positions[0] = satPos.x;
    positions[1] = satPos.y;
    positions[2] = satPos.z;
    positions[3] = nadirPos.x;
    positions[4] = nadirPos.y;
    positions[5] = nadirPos.z;
    satObj.nadirLine.geometry.attributes.position.needsUpdate = true;

    // Actualizar footprint circular en la superficie
    satObj.footprint.clear();
    const newFootprint = createSphericalZone(
      satData.lat,
      satData.lon,
      FOOTPRINT_RADIUS_DEG,
      EARTH_RADIUS,
      0x00e5ff,
      0.25
    );
    satObj.footprint.add(newFootprint);
  });
}

// ==============================================================================
// GESTOR DE CARGA DE DATOS (FETCH / FILE FALLBACK)
// ==============================================================================
function initDataBindings() {
  document.getElementById('btn-initial').addEventListener('click', () => applyState('initial'));
  document.getElementById('btn-final').addEventListener('click', () => applyState('final'));

  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        onDataLoaded(parsed);
        document.getElementById('fallback-card').style.display = 'none';
      } catch (err) {
        alert('Error al analizar el archivo JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
}

function loadResultsData() {
  fetch('./data/run_results.json')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      onDataLoaded(data);
    })
    .catch((err) => {
      console.warn('Fetch automático bloqueado (protocolo local file:// o similar). Mostrando fallback:', err);
      const fallbackCard = document.getElementById('fallback-card');
      if (fallbackCard) {
        fallbackCard.style.display = 'flex';
      }
    });
}

function onDataLoaded(data) {
  appData = data;
  populateEnvironment(data.environment);
  initSatellites();
  applyState('final');
}

// ==============================================================================
// BUCLE DE ANIMACIÓN CONTINUA Y REDIMENSIONAMIENTO
// ==============================================================================
function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  // Rotación suave del globo terrestre en reposo (cuando el usuario no arrastra)
  if (earthGroup && controls.state === -1) {
    earthGroup.rotation.y += 0.0006;
  }

  // Pulsación suave de los marcadores de región
  const time = Date.now() * 0.003;
  targetRegionMeshes.forEach((meshObj) => {
    const scale = 1.0 + Math.sin(time) * 0.08;
    meshObj.container.scale.set(scale, scale, scale);
  });

  controls.update();
  renderer.render(scene, camera);
}

// ==============================================================================
// PUNTO DE ENTRADA PRINCIPAL
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  initScene();
  initDataBindings();
  loadResultsData();
  animate();
});
