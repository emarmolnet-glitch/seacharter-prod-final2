/**
 * vessel-3d-viewer.js - Visor 3D / CAD Naval para SeaCharter Core PRO (H18)
 *
 * Renderizador WebGL diurno a 60 FPS con THREE.InstancedMesh para apilamiento por capas (tiers),
 * casco naval realista (ExtrudeGeometry, popa de espejo redondeada, costados paralelos, proa afilada,
 * castillo sobreelevado y bulbo de proa), puente escalonado de 3-4 niveles con alas y chimenea inclinada,
 * grúas navales en babor (+X = halfB - 1.6) o crujía en azul acero (0x0284c7), y función "Abrir / Cerrar Escotillas"
 * con casco semitransparente (opacity: 0.24) y tapas al 0.06 sobre fondo diurno claro.
 */

export class Vessel3DViewer {
  constructor(containerElement, options = {}) {
    this.container = typeof containerElement === 'string'
      ? document.querySelector(containerElement)
      : containerElement;
    this.options = options;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.animationFrameId = null;

    // Materiales del buque y carga
    this.vivaMat = null;
    this.muertaMat = null;
    this.deckMat = null;
    this.hatchMat = null;
    this.cargoMat = null;
    this.craneMat = null;
    this.superstructureMat = null;
    this.seaMesh = null;
    this.seaMat = null;

    // Colecciones de mallas
    this.hatchMeshes = [];
    this.cargoInstancedMesh = null;
    this.projectCargoGroup = null;
    this.cranesGroup = null;
    this.hullGroup = null;

    // Estado del visor
    this.hatchesOpen = false;
    this.stowageResult = null;
    this.vesselDimensions = { length: 180, beam: 28, depth: 15 };

    // Enlazar manejadores de redimensión
    this.onWindowResize = this.onWindowResize.bind(this);
  }

  /**
   * Carga dinámica de Three.js y OrbitControls si no están presentes globalmente
   */
  async ensureThreeLibraries() {
    if (window.THREE && window.THREE.WebGLRenderer) {
      return window.THREE;
    }

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    if (!window.THREE.OrbitControls) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    return window.THREE;
  }

  /**
   * Inicializa la escena 3D, cámara diurna, luces y controles orbitales
   */
  async init() {
    if (!this.container) return;
    const THREE = await this.ensureThreeLibraries();

    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 550;

    // Escena diurna en modo claro (#cbd5e1)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#cbd5e1');

    // Cámara de perspectiva
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 2000);
    this.camera.position.set(120, 85, 140);

    // Renderizador WebGL
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Limpiar contenedor e insertar canvas
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Controles orbitales
    if (THREE.OrbitControls) {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxPolarAngle = Math.PI / 2 + 0.08;
      this.controls.minDistance = 20;
      this.controls.maxDistance = 600;
      this.controls.target.set(0, 5, 0);
    }

    // Iluminación diurna realista
    this.setupLighting(THREE);

    // Superficie del mar diurna celeste claro y rejilla técnica sutil
    this.setupSeaSurface(THREE);

    // Escuchar cambios de tamaño
    window.addEventListener('resize', this.onWindowResize);

    // Bucle de renderizado
    this.animate();
  }

  setupLighting(THREE) {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x64748b, 0.50);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.78);
    sunLight.position.set(110, 160, 90);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 400;
    sunLight.shadow.camera.left = -120;
    sunLight.shadow.camera.right = 120;
    sunLight.shadow.camera.top = 120;
    sunLight.shadow.camera.bottom = -120;
    this.scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.25);
    fillLight.position.set(-90, 50, -70);
    this.scene.add(fillLight);
  }

  setupSeaSurface(THREE) {
    const seaGeo = new THREE.PlaneGeometry(1200, 1200, 16, 16);
    this.seaMat = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      roughness: 0.65,
      metalness: 0.0,
      transparent: true,
      opacity: 0.55,
    });
    this.seaMesh = new THREE.Mesh(seaGeo, this.seaMat);
    this.seaMesh.rotation.x = -Math.PI / 2;
    this.seaMesh.position.y = 0; // Línea de flotación a Y = 0
    this.seaMesh.receiveShadow = true;
    this.scene.add(this.seaMesh);

    // Rejilla técnica sutil diurna
    const gridHelper = new THREE.GridHelper(500, 50, 0x94a3b8, 0xcbd5e1);
    gridHelper.position.y = -0.05;
    this.scene.add(gridHelper);
  }

  /**
   * Carga los datos de estiba simulados y construye el buque y paquetes
   */
  loadStowageData(stowageResult) {
    const THREE = window.THREE;
    if (!THREE || !this.scene) return;

    this.stowageResult = stowageResult;

    // Limpiar modelos anteriores
    if (this.hullGroup) this.scene.remove(this.hullGroup);
    if (this.cargoInstancedMesh) this.scene.remove(this.cargoInstancedMesh);
    if (this.projectCargoGroup) this.scene.remove(this.projectCargoGroup);
    if (this.cranesGroup) this.scene.remove(this.cranesGroup);

    this.projectCargoGroup = null;
    this.cargoInstancedMesh = null;
    this.hatchMeshes = [];
    this.hatchesOpen = false;
    if (this.seaMesh) this.seaMesh.position.y = 0;
    if (this.seaMat) {
      this.seaMat.opacity = 0.55;
      this.seaMat.depthWrite = true;
    }

    const v = stowageResult?.vessel || stowageResult?.vesselSpecs || {};
    const geom = stowageResult?.geometry || {};
    const holds = Array.isArray(stowageResult?.holds) ? stowageResult.holds : [];

    const L = Number(v.loa || v.loa_meters || geom.loa || 180);
    const B = Number(v.beam || v.beam_meters || geom.beam || 28);
    const D = Number(v.depth || geom.depth || 15);
    const draft = Number(v.draft || v.draft_meters || geom.draft || 9.5);
    this.vesselDimensions = { length: L, beam: B, depth: D, draft };

    // Materiales navales realistas
    this.vivaMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626, // Obra viva: Rojo naval vivo
      roughness: 0.5,
      metalness: 0.1,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    this.muertaMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Obra muerta: Pizarra naval oscura
      roughness: 0.45,
      metalness: 0.2,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    this.deckMat = new THREE.MeshStandardMaterial({
      color: 0x64748b, // Cubierta: Gris técnico naval
      roughness: 0.6,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });

    this.hatchMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.4,
      metalness: 0.3,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
    });

    this.craneMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Grúas: Azul acero naval
      roughness: 0.35,
      metalness: 0.35,
    });

    this.superstructureMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0, // Blanco roto técnico
      roughness: 0.55,
      metalness: 0.05,
    });

    this.cargoMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, // Base blanca para asignación con setColorAt por tier
      roughness: 0.55,
      metalness: 0.1,
    });

    // Grupo de casco
    this.hullGroup = new THREE.Group();
    this.buildHullStructure(THREE, L, B, D, draft, holds);
    this.scene.add(this.hullGroup);

    // Grúas navales
    const holdsCount = Number(v.holds_count || v.holdsCount || geom.holdsCount || holds.length || 4);
    const craneCount = v.hasGears ? (geom.craneCount || holdsCount) : 0;
    this.cranesGroup = new THREE.Group();
    if (craneCount > 0) {
      this.buildDeckCranes(THREE, L, B, D, draft, holdsCount, craneCount);
    }
    this.scene.add(this.cranesGroup);

    // Carga en bodegas: InstancedMesh para homogéneo o ProjectCargoGroup para project_cargo
    if (stowageResult?.mode === 'project_cargo') {
      this.buildProjectCargo(THREE, stowageResult, L, B, D, draft);
    } else {
      this.buildInstancedCargo(THREE, stowageResult, L, B, D, draft);
    }

    // Encuadre inicial en 3/4 Proa proporcional a L
    this.setViewPreset('threeQuarter');
  }

  /**
   * Construye el casco naval realista con THREE.ExtrudeGeometry, popa de espejo redondeada,
   * costados paralelos, proa afilada, castillo de proa sobreelevado y bulbo de proa.
   */
  buildHullStructure(THREE, L, B, D, draft, holds) {
    const halfL = L / 2;
    const halfB = B / 2;
    const keelY = -draft;
    const deckY = D - draft;
    const vivaHeight = draft;
    const muertaHeight = deckY;

    // Perfilado naval realista (Shape en el plano horizontal X-Z)
    const hullShape = new THREE.Shape();
    hullShape.moveTo(0, halfL); // Proa afilada (+Z)
    hullShape.quadraticCurveTo(halfB, halfL - L * 0.12, halfB, halfL - L * 0.24); // Roda y curvatura babor
    hullShape.lineTo(halfB, -halfL + L * 0.16); // Costado paralelo babor
    hullShape.quadraticCurveTo(halfB, -halfL, halfB * 0.72, -halfL); // Espejo redondeado babor
    hullShape.lineTo(-halfB * 0.72, -halfL); // Espejo de popa
    hullShape.quadraticCurveTo(-halfB, -halfL, -halfB, -halfL + L * 0.16); // Espejo redondeado estribor
    hullShape.lineTo(-halfB, halfL - L * 0.24); // Costado paralelo estribor
    hullShape.quadraticCurveTo(-halfB, halfL - L * 0.12, 0, halfL); // Roda y curvatura estribor

    // 1. Obra Viva: THREE.ExtrudeGeometry desde la quilla (keelY) hasta flotación (Y=0)
    const vivaExtrudeSettings = { depth: vivaHeight, bevelEnabled: false };
    const vivaGeo = new THREE.ExtrudeGeometry(hullShape, vivaExtrudeSettings);
    const vivaMesh = new THREE.Mesh(vivaGeo, this.vivaMat);
    vivaMesh.rotation.x = Math.PI / 2;
    vivaMesh.position.set(0, 0, 0);
    vivaMesh.castShadow = true;
    vivaMesh.receiveShadow = true;
    this.hullGroup.add(vivaMesh);

    // Bulbo de proa sutil integrado en la roda bajo la línea de flotación
    const bulbGeo = new THREE.SphereGeometry(halfB * 0.32, 16, 12);
    bulbGeo.scale(0.55, 0.65, 1.15);
    const bulbMesh = new THREE.Mesh(bulbGeo, this.vivaMat);
    bulbMesh.position.set(0, keelY + vivaHeight * 0.38, halfL - halfB * 0.15);
    bulbMesh.castShadow = true;
    this.hullGroup.add(bulbMesh);

    // 2. Obra Muerta: THREE.ExtrudeGeometry desde flotación (Y=0) hasta cubierta (deckY)
    const muertaExtrudeSettings = { depth: muertaHeight, bevelEnabled: false };
    const muertaGeo = new THREE.ExtrudeGeometry(hullShape, muertaExtrudeSettings);
    const muertaMesh = new THREE.Mesh(muertaGeo, this.muertaMat);
    muertaMesh.rotation.x = Math.PI / 2;
    muertaMesh.position.set(0, deckY, 0);
    muertaMesh.castShadow = true;
    muertaMesh.receiveShadow = true;
    this.hullGroup.add(muertaMesh);

    // 3. Cubierta principal (Deck plate)
    const deckGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 0.15, bevelEnabled: false });
    const deckMesh = new THREE.Mesh(deckGeo, this.deckMat);
    deckMesh.rotation.x = Math.PI / 2;
    deckMesh.position.set(0, deckY + 0.15, 0);
    deckMesh.receiveShadow = true;
    this.hullGroup.add(deckMesh);

    // 4. Castillo de proa sobreelevado (Forecastle) adaptado a la curva afilada en +Z
    const fZCut = halfL - L * 0.14;
    const fT = 0.14 / 0.24;
    const fXCut = (2 * fT - fT * fT) * halfB;

    const forecastleShape = new THREE.Shape();
    forecastleShape.moveTo(0, halfL);
    forecastleShape.quadraticCurveTo(halfB * 0.75, halfL - L * 0.08, fXCut, fZCut);
    forecastleShape.lineTo(-fXCut, fZCut);
    forecastleShape.quadraticCurveTo(-halfB * 0.75, halfL - L * 0.08, 0, halfL);

    const forecastleGeo = new THREE.ExtrudeGeometry(forecastleShape, { depth: 1.8, bevelEnabled: false });
    const forecastleMesh = new THREE.Mesh(forecastleGeo, this.muertaMat);
    forecastleMesh.rotation.x = Math.PI / 2;
    forecastleMesh.position.set(0, deckY + 1.8, 0);
    forecastleMesh.castShadow = true;
    this.hullGroup.add(forecastleMesh);

    // Plancha/borde de cubierta superior gris acero para volumen técnico en niveles del puente
    const deckTrimMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.5,
      metalness: 0.2,
    });

    // 5. Puente de gobierno a popa escalonado (3–4 niveles blancos, alas, ventanas, chimenea inclinada)
    const bridgeStartZ = -halfL + L * 0.08;

    // Nivel 1: Acomodación base
    const tier1W = B * 0.76;
    const tier1L = L * 0.11;
    const tier1H = D * 0.26;
    const tier1Geo = new THREE.BoxGeometry(tier1W, tier1H, tier1L);
    const tier1Mesh = new THREE.Mesh(tier1Geo, this.superstructureMat);
    tier1Mesh.position.set(0, deckY + tier1H / 2, bridgeStartZ);
    tier1Mesh.castShadow = true;
    this.hullGroup.add(tier1Mesh);

    // Plancha superior Nivel 1
    const tier1PlateGeo = new THREE.BoxGeometry(tier1W + 0.6, 0.3, tier1L + 0.6);
    const tier1PlateMesh = new THREE.Mesh(tier1PlateGeo, deckTrimMat);
    tier1PlateMesh.position.set(0, deckY + tier1H + 0.15, bridgeStartZ);
    this.hullGroup.add(tier1PlateMesh);

    // Nivel 2: Alojamientos y oficinas
    const tier2W = B * 0.68;
    const tier2L = L * 0.09;
    const tier2H = D * 0.22;
    const tier2Geo = new THREE.BoxGeometry(tier2W, tier2H, tier2L);
    const tier2Mesh = new THREE.Mesh(tier2Geo, this.superstructureMat);
    tier2Mesh.position.set(0, deckY + tier1H + tier2H / 2, bridgeStartZ);
    tier2Mesh.castShadow = true;
    this.hullGroup.add(tier2Mesh);

    // Plancha superior Nivel 2
    const tier2PlateGeo = new THREE.BoxGeometry(tier2W + 0.5, 0.3, tier2L + 0.5);
    const tier2PlateMesh = new THREE.Mesh(tier2PlateGeo, deckTrimMat);
    tier2PlateMesh.position.set(0, deckY + tier1H + tier2H + 0.15, bridgeStartZ);
    this.hullGroup.add(tier2PlateMesh);

    // Nivel 3: Puente de navegación
    const tier3W = B * 0.60;
    const tier3L = L * 0.075;
    const tier3H = D * 0.22;
    const tier3Geo = new THREE.BoxGeometry(tier3W, tier3H, tier3L);
    const tier3Mesh = new THREE.Mesh(tier3Geo, this.superstructureMat);
    const bridgeY = deckY + tier1H + tier2H + tier3H / 2;
    tier3Mesh.position.set(0, bridgeY, bridgeStartZ + 0.5);
    tier3Mesh.castShadow = true;
    this.hullGroup.add(tier3Mesh);

    // Techo superior del puente
    const tier3RoofGeo = new THREE.BoxGeometry(tier3W + 0.6, 0.35, tier3L + 0.6);
    const tier3RoofMesh = new THREE.Mesh(tier3RoofGeo, deckTrimMat);
    tier3RoofMesh.position.set(0, deckY + tier1H + tier2H + tier3H + 0.175, bridgeStartZ + 0.5);
    this.hullGroup.add(tier3RoofMesh);

    // Alas de puente (Bridge wings)
    const wingsGeo = new THREE.BoxGeometry(B * 0.88, 1.4, 3.6);
    const wingsMesh = new THREE.Mesh(wingsGeo, this.superstructureMat);
    wingsMesh.position.set(0, bridgeY - 0.2, bridgeStartZ + 0.5);
    wingsMesh.castShadow = true;
    this.hullGroup.add(wingsMesh);

    // Remate superior de las alas
    const wingsTrimGeo = new THREE.BoxGeometry(B * 0.88 + 0.3, 0.25, 3.8);
    const wingsTrimMesh = new THREE.Mesh(wingsTrimGeo, deckTrimMat);
    wingsTrimMesh.position.set(0, bridgeY + 0.5 + 0.125, bridgeStartZ + 0.5);
    this.hullGroup.add(wingsTrimMesh);

    // Franja de ventanas de cristal azul
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.1,
      metalness: 0.8,
    });
    const glassGeo = new THREE.BoxGeometry(tier3W * 0.92, 1.2, 0.3);
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.set(0, bridgeY + 0.5, bridgeStartZ + tier3L / 2 + 0.6);
    this.hullGroup.add(glassMesh);

    // Chimenea naval inclinada hacia popa
    const funnelGeo = new THREE.CylinderGeometry(2.0, 2.6, 9, 16);
    const funnelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
    const funnelMesh = new THREE.Mesh(funnelGeo, funnelMat);
    funnelMesh.rotation.x = -Math.PI * 0.08;
    funnelMesh.position.set(0, deckY + tier1H + tier2H + 4, bridgeStartZ - tier1L / 2 + 3);
    funnelMesh.castShadow = true;
    this.hullGroup.add(funnelMesh);

    // Banda naranja corporativa en la chimenea
    const bandGeo = new THREE.CylinderGeometry(2.25, 2.35, 1.8, 16);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4 });
    const bandMesh = new THREE.Mesh(bandGeo, bandMat);
    bandMesh.rotation.x = -Math.PI * 0.08;
    bandMesh.position.set(0, deckY + tier1H + tier2H + 5.5, bridgeStartZ - tier1L / 2 + 3.4);
    this.hullGroup.add(bandMesh);

    // Mástil radar
    const mastGeo = new THREE.CylinderGeometry(0.25, 0.35, 7, 8);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
    const mastMesh = new THREE.Mesh(mastGeo, mastMat);
    mastMesh.position.set(0, deckY + tier1H + tier2H + tier3H + 3.5, bridgeStartZ);
    this.hullGroup.add(mastMesh);

    const radarBarGeo = new THREE.BoxGeometry(3.6, 0.4, 0.4);
    const radarBarMesh = new THREE.Mesh(radarBarGeo, this.superstructureMat);
    radarBarMesh.position.set(0, deckY + tier1H + tier2H + tier3H + 6.5, bridgeStartZ);
    this.hullGroup.add(radarBarMesh);

    // 6. Escotillas sobre cubierta
    const holdsCount = holds.length || 4;
    const cargoAreaL = L * 0.68;
    const holdL = cargoAreaL / holdsCount;
    const hatchW = B * 0.65;
    const hatchL = holdL * 0.72;
    const cargoStartZ = -cargoAreaL / 2 + 10;
    const wallThick = 0.35;
    const coamingH = 1.2;

    for (let i = 0; i < holdsCount; i++) {
      const holdNum = holdsCount - i;
      const hz = cargoStartZ + i * holdL + holdL / 2;

      // Brazolas huecas (4 paredes perimetrales finas sin taponar la boca)
      const foreWall = new THREE.Mesh(new THREE.BoxGeometry(hatchW + wallThick * 2, coamingH, wallThick), this.deckMat);
      foreWall.position.set(0, deckY + coamingH / 2, hz + hatchL / 2);
      this.hullGroup.add(foreWall);

      const aftWall = new THREE.Mesh(new THREE.BoxGeometry(hatchW + wallThick * 2, coamingH, wallThick), this.deckMat);
      aftWall.position.set(0, deckY + coamingH / 2, hz - hatchL / 2);
      this.hullGroup.add(aftWall);

      const portWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, coamingH, hatchL), this.deckMat);
      portWall.position.set(hatchW / 2, deckY + coamingH / 2, hz);
      this.hullGroup.add(portWall);

      const stbdWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, coamingH, hatchL), this.deckMat);
      stbdWall.position.set(-hatchW / 2, deckY + coamingH / 2, hz);
      this.hullGroup.add(stbdWall);

      // Tapa de escotilla
      const hatchCoverGeo = new THREE.BoxGeometry(hatchW, 0.8, hatchL);
      const hatchMesh = new THREE.Mesh(hatchCoverGeo, this.hatchMat);
      hatchMesh.position.set(0, deckY + 1.2, hz);
      hatchMesh.castShadow = true;
      hatchMesh.userData = { holdNumber: holdNum, defaultY: deckY + 1.2 };
      this.hatchMeshes.push(hatchMesh);
      this.hullGroup.add(hatchMesh);
    }
  }

  /**
   * Construye las grúas navales en azul acero (0x0284c7) situadas en babor o crujía
   * con las plumas orientadas ~40° hacia proa (+Z) y sin inclinación lateral (rotation.z = 0).
   */
  buildDeckCranes(THREE, L, B, D, draft, holdsCount, craneCount) {
    const halfB = B / 2;
    const deckY = D - draft;
    const cargoAreaL = L * 0.68;
    const holdL = cargoAreaL / holdsCount;
    const cargoStartZ = -cargoAreaL / 2 + 10;

    // Banda de babor (Port side = +X) si craneCount >= holdsCount, de lo contrario crujía (X = 0)
    const craneX = craneCount >= holdsCount ? halfB - 1.6 : 0;
    const craneSpacing = cargoAreaL / Math.max(1, craneCount);

    for (let c = 0; c < craneCount; c++) {
      const cz = cargoStartZ + (c + 0.5) * craneSpacing;

      // Pedestal cilíndrico
      const pedestalGeo = new THREE.CylinderGeometry(1.4, 1.6, 6, 16);
      const pedestalMesh = new THREE.Mesh(pedestalGeo, this.craneMat);
      pedestalMesh.position.set(craneX, deckY + 3, cz);
      pedestalMesh.castShadow = true;
      this.cranesGroup.add(pedestalMesh);

      // Cabina de maniobra
      const cabGeo = new THREE.BoxGeometry(2.4, 2.5, 3.2);
      const cabMesh = new THREE.Mesh(cabGeo, this.craneMat);
      cabMesh.position.set(craneX, deckY + 6.5, cz);
      cabMesh.castShadow = true;
      this.cranesGroup.add(cabMesh);

      // Pluma de la grúa orientada ~40° hacia proa (+Z) y rotation.z = 0
      const boomLength = 19;
      const boomGeo = new THREE.CylinderGeometry(0.32, 0.48, boomLength, 8);
      const boomMesh = new THREE.Mesh(boomGeo, this.craneMat);
      boomMesh.rotation.x = Math.PI * 0.22; // ~40° hacia proa
      boomMesh.rotation.z = 0; // Sin inclinación lateral
      const boomOffsetZ = Math.sin(Math.PI * 0.22) * (boomLength / 2);
      const boomOffsetY = Math.cos(Math.PI * 0.22) * (boomLength / 2);
      boomMesh.position.set(craneX, deckY + 6.5 + boomOffsetY, cz + boomOffsetZ);
      boomMesh.castShadow = true;
      this.cranesGroup.add(boomMesh);
    }
  }

  /**
   * Genera los bultos apilados en las bodegas con THREE.InstancedMesh para 60 FPS,
   * asignando count = instanceIndex para eliminar fantasmas en (0,0,0) y tope a 15000 instancias.
   * Aplica plancha de fondo de bodega (Tank Top) y colores alternos contrastados por tier.
   */
  buildInstancedCargo(THREE, stowageResult, L, B, D, draft) {
    const pkg = stowageResult?.package || {};
    const lengthM = pkg.lengthM || 1.0;
    const widthM = pkg.widthM || 1.0;
    const heightM = pkg.heightM || 1.3;

    const holds = Array.isArray(stowageResult?.holds) ? stowageResult.holds : [];
    const holdsCount = holds.length || 4;
    const cargoAreaL = L * 0.68;
    const holdL = cargoAreaL / holdsCount;
    const deckY = D - draft;
    const tankTopY = -draft + 2.0;
    const cargoStartZ = -cargoAreaL / 2 + 10;

    let totalInstances = 0;
    holds.forEach((h) => {
      totalInstances += (h.realisticUnits || h.theoreticalUnits || 0);
    });

    if (totalInstances <= 0) return;

    // Plancha oscura de fondo de bodega (Tank Top) en hullGroup para dar base visual sólida
    const tankTopGeo = new THREE.BoxGeometry(B * 0.76, 0.3, cargoAreaL);
    const tankTopMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Pizarra naval oscura
      roughness: 0.7,
      metalness: 0.2,
    });
    const tankTopMesh = new THREE.Mesh(tankTopGeo, tankTopMat);
    tankTopMesh.position.set(0, tankTopY - 0.15, cargoStartZ + cargoAreaL / 2);
    tankTopMesh.receiveShadow = true;
    this.hullGroup.add(tankTopMesh);

    // Tope de instancias visuales para garantizar 60 FPS
    const MAX_VISUAL_INSTANCES = 15000;
    const stride = totalInstances > MAX_VISUAL_INSTANCES
      ? Math.ceil(totalInstances / MAX_VISUAL_INSTANCES)
      : 1;

    // Colores contrastados y alternados por capa (tier)
    const cargoNameLower = String(stowageResult?.cargoName || '').toLowerCase();
    let colorEvenHex = 0xf59e0b; // Ámbar vivo (capas pares)
    let colorOddHex = 0xb45309;  // Ámbar quemado (capas impares)

    if (cargoNameLower.includes('bobina') || cargoNameLower.includes('acero') || cargoNameLower.includes('coil')) {
      colorEvenHex = 0x475569; // Acero medio
      colorOddHex = 0x1e293b;  // Acero oscuro
    } else if (cargoNameLower.includes('personalizado') || cargoNameLower.includes('caja') || cargoNameLower.includes('box')) {
      colorEvenHex = 0x0d9488; // Teal vivo
      colorOddHex = 0x115e59;  // Teal profundo
    }
    const colorEven = new THREE.Color(colorEvenHex);
    const colorOdd = new THREE.Color(colorOddHex);

    const allocatedInstances = Math.min(totalInstances, MAX_VISUAL_INSTANCES + 500);
    // Bulto unitario con ligera separación (0.90) para distinguir tiers
    const packageGeo = new THREE.BoxGeometry(widthM * 0.90, heightM * 0.90, lengthM * 0.90);
    this.cargoInstancedMesh = new THREE.InstancedMesh(packageGeo, this.cargoMat, allocatedInstances);
    this.cargoInstancedMesh.castShadow = true;
    this.cargoInstancedMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let instanceIndex = 0;

    holds.forEach((hold) => {
      const holdZCenter = cargoStartZ + (holdsCount - hold.holdNumber) * holdL + holdL / 2;
      const holdUnits = hold.realisticUnits || hold.theoreticalUnits || 0;
      const tiers = hold.tiers || 1;
      const isH1 = hold.isBowHold;

      const unitsAlongL = Math.max(1, Math.floor(holdL * 0.85 / lengthM));
      let unitsAlongB = Math.max(1, Math.floor(B * 0.75 / widthM));
      if (isH1) unitsAlongB = Math.max(1, Math.floor(unitsAlongB * 0.8));

      let unitsPlacedInHold = 0;

      for (let t = 0; t < tiers && unitsPlacedInHold < holdUnits && instanceIndex < allocatedInstances; t++) {
        const py = tankTopY + t * heightM + heightM / 2;
        const tierColor = (t % 2 === 0) ? colorEven : colorOdd;

        for (let row = 0; row < unitsAlongB && unitsPlacedInHold < holdUnits && instanceIndex < allocatedInstances; row++) {
          const px = -((unitsAlongB - 1) * widthM) / 2 + row * widthM;

          for (let col = 0; col < unitsAlongL && unitsPlacedInHold < holdUnits && instanceIndex < allocatedInstances; col += stride) {
            // En H1, afinamiento progresivo en proa (reducir esquinas delanteras)
            if (isH1 && col > unitsAlongL * 0.65 && (row === 0 || row === unitsAlongB - 1)) {
              unitsPlacedInHold += stride;
              continue;
            }

            const pz = holdZCenter - ((unitsAlongL - 1) * lengthM) / 2 + col * lengthM;
            dummy.position.set(px, py, pz);
            dummy.updateMatrix();
            this.cargoInstancedMesh.setMatrixAt(instanceIndex, dummy.matrix);
            this.cargoInstancedMesh.setColorAt(instanceIndex, tierColor);
            instanceIndex++;
            unitsPlacedInHold += stride;
          }
        }
      }
    });

    // Asignación obligatoria de count = instanceIndex para eliminar fantasmas en (0,0,0)
    this.cargoInstancedMesh.count = instanceIndex;
    this.cargoInstancedMesh.instanceMatrix.needsUpdate = true;
    if (this.cargoInstancedMesh.instanceColor) {
      this.cargoInstancedMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.cargoInstancedMesh);
  }

  /**
   * Construye el cargamento para modo Project Cargo / Vehículos:
   * piezas individuales con dimensiones reales (length_m, width_m, height_m),
   * soporte para zonas under_deck, tweendeck y on_deck,
   * y colores por categoría: heavy_lift (#ea580c), vehicle (#2563eb), crate (#0d9488), steel (#475569).
   */
  buildProjectCargo(THREE, stowageResult, L, B, D, draft) {
    this.projectCargoGroup = new THREE.Group();

    const placedItems = Array.isArray(stowageResult?.placed_items) ? stowageResult.placed_items : [];
    const v = stowageResult?.vessel || stowageResult?.vesselSpecs || {};
    const holds = Array.isArray(stowageResult?.holds) ? stowageResult.holds : [];
    const geom = stowageResult?.geometry || {};
    const holdsCount = Number(v.holds_count || v.holdsCount || geom.holdsCount || holds.length || 4);
    const cargoAreaL = L * 0.68;
    const holdL = cargoAreaL / holdsCount;
    const deckY = D - draft;
    const tankTopY = -draft + 2.0;
    const cargoStartZ = -cargoAreaL / 2 + 10;

    // Plancha oscura de fondo de bodega (Tank Top)
    const tankTopGeo = new THREE.BoxGeometry(B * 0.76, 0.3, cargoAreaL);
    const tankTopMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.7,
      metalness: 0.2,
    });
    const tankTopMesh = new THREE.Mesh(tankTopGeo, tankTopMat);
    tankTopMesh.position.set(0, tankTopY - 0.15, cargoStartZ + cargoAreaL / 2);
    tankTopMesh.receiveShadow = true;
    this.hullGroup.add(tankTopMesh);

    if (placedItems.length === 0) {
      this.scene.add(this.projectCargoGroup);
      return;
    }

    // Planchas translúcidas sutiles de entrepuente si hay carga en tweendeck
    const hasTweendeckCargo = placedItems.some((it) => (it.zone || '').toLowerCase() === 'tweendeck');
    const tweendeckY = tankTopY + (deckY - tankTopY) * 0.52;
    if (hasTweendeckCargo) {
      const tweendeckGeo = new THREE.BoxGeometry(B * 0.74, 0.2, cargoAreaL);
      const tweendeckMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.42,
        roughness: 0.6,
        metalness: 0.15,
      });
      const tweendeckMesh = new THREE.Mesh(tweendeckGeo, tweendeckMat);
      tweendeckMesh.position.set(0, tweendeckY - 0.1, cargoStartZ + cargoAreaL / 2);
      tweendeckMesh.receiveShadow = true;
      this.projectCargoGroup.add(tweendeckMesh);
    }

    // Materiales por categoría
    const heavyLiftMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.45, metalness: 0.2 });
    const vehicleMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4, metalness: 0.3 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x0d9488, roughness: 0.55, metalness: 0.1 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.35, metalness: 0.5 });
    const dunnageMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.8 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 });

    placedItems.forEach((item) => {
      const cat = (item.category || 'crate').toLowerCase();
      const zone = (item.zone || 'under_deck').toLowerCase();
      const holdNum = item.hold_number || 1;

      // Dimensiones reales
      const len = Math.max(1.0, Number(item.length_m || item.length || 2.0));
      const wid = Math.max(1.0, Number(item.width_m || item.width || 2.0));
      const hgt = Math.max(1.0, Number(item.height_m || item.height || 2.0));

      const holdZCenter = cargoStartZ + (holdsCount - holdNum) * holdL + holdL / 2;
      const usableL = holdL * 0.82;
      const usableB = B * 0.72;

      const x_pct = Number(item.x_pct ?? 0.1);
      const y_pct = Number(item.y_pct ?? 0.1);

      // Eje +Z longitudinal de su bodega y eje X transversal en manga
      const pz = holdZCenter - usableL / 2 + Math.min(x_pct * usableL, Math.max(0, usableL - len)) + len / 2;
      const px = -usableB / 2 + Math.min(y_pct * usableB, Math.max(0, usableB - wid)) + wid / 2;

      let py = tankTopY + hgt / 2;
      if (zone === 'on_deck') {
        py = (deckY + 1.65) + hgt / 2;
      } else if (zone === 'tweendeck') {
        py = (tankTopY + (deckY - tankTopY) * 0.52) + hgt / 2;
      } else {
        py = tankTopY + hgt / 2;
      }

      if (cat === 'vehicle') {
        // Vehículo: carrocería + cabina simplificada + ruedas
        const vehGroup = new THREE.Group();
        const trailerH = hgt * 0.65;
        const bodyGeo = new THREE.BoxGeometry(wid, trailerH, len);
        const bodyMesh = new THREE.Mesh(bodyGeo, vehicleMat);
        bodyMesh.position.set(0, -hgt / 2 + trailerH / 2, 0);
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        vehGroup.add(bodyMesh);

        // Cabina
        const cabL = Math.max(1.2, len * 0.28);
        const cabH = hgt * 0.35;
        const cabGeo = new THREE.BoxGeometry(wid * 0.95, cabH, cabL);
        const cabMesh = new THREE.Mesh(cabGeo, vehicleMat);
        cabMesh.position.set(0, -hgt / 2 + trailerH + cabH / 2, len / 2 - cabL / 2);
        cabMesh.castShadow = true;
        vehGroup.add(cabMesh);

        // Parabrisas
        const windshieldGeo = new THREE.BoxGeometry(wid * 0.88, cabH * 0.65, 0.15);
        const windshieldMesh = new THREE.Mesh(windshieldGeo, glassMat);
        windshieldMesh.position.set(0, -hgt / 2 + trailerH + cabH * 0.6, len / 2 + 0.08);
        vehGroup.add(windshieldMesh);

        // Ruedas simplificadas
        const wheelR = Math.min(0.7, hgt * 0.22);
        const wheelW = 0.4;
        const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 12);
        wheelGeo.rotateZ(Math.PI / 2);

        [-len * 0.35, 0, len * 0.35].forEach((wz) => {
          const wLeft = new THREE.Mesh(wheelGeo, tireMat);
          wLeft.position.set(-wid / 2, -hgt / 2 + wheelR * 0.6, wz);
          vehGroup.add(wLeft);

          const wRight = new THREE.Mesh(wheelGeo, tireMat);
          wRight.position.set(wid / 2, -hgt / 2 + wheelR * 0.6, wz);
          vehGroup.add(wRight);
        });

        vehGroup.position.set(px, py, pz);
        this.projectCargoGroup.add(vehGroup);
      } else if (cat === 'heavy_lift') {
        // Heavy Lift: base de madera (dunnage) + cuerpo naranja sólido
        const hlGroup = new THREE.Group();

        // Base de madera dunnage
        const dunnageH = 0.35;
        const dunnageGeo = new THREE.BoxGeometry(wid + 0.5, dunnageH, len + 0.5);
        const dunnageMesh = new THREE.Mesh(dunnageGeo, dunnageMat);
        dunnageMesh.position.set(0, -hgt / 2 + dunnageH / 2, 0);
        dunnageMesh.receiveShadow = true;
        hlGroup.add(dunnageMesh);

        // Cuerpo naranja
        const bodyH = hgt - dunnageH;
        const bodyGeo = new THREE.BoxGeometry(wid, bodyH, len);
        const bodyMesh = new THREE.Mesh(bodyGeo, heavyLiftMat);
        bodyMesh.position.set(0, -hgt / 2 + dunnageH + bodyH / 2, 0);
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        hlGroup.add(bodyMesh);

        hlGroup.position.set(px, py, pz);
        this.projectCargoGroup.add(hlGroup);
      } else if (cat === 'steel') {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(wid, hgt, len), steelMat);
        mesh.position.set(px, py, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.projectCargoGroup.add(mesh);
      } else {
        // crate
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(wid, hgt, len), crateMat);
        mesh.position.set(px, py, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.projectCargoGroup.add(mesh);
      }
    });

    this.scene.add(this.projectCargoGroup);
  }

  /**
   * Alterna entre escotillas abiertas (casco translúcido) y cerradas (sólido)
   * - Abiertas: Tapas al 0.04 (opacity: 0.04, depthWrite: false). Deck al 0.08, Casco al 0.22.
   *   Despeja el plano del mar (baja a -draft - 1.5 y opacidad 0.15) para que no tape la carga sumergida.
   * - Cerradas: Tapas, deck y casco a opacidad 1.0 (sólido). Restaura el mar a Y=0 y opacidad 0.55.
   */
  toggleHatches() {
    this.hatchesOpen = !this.hatchesOpen;

    if (this.hatchesOpen) {
      this.hatchMeshes.forEach((mesh) => {
        mesh.material.transparent = true;
        mesh.material.opacity = 0.04;
        mesh.material.depthWrite = false;
        mesh.material.needsUpdate = true;
      });

      if (this.deckMat) {
        this.deckMat.transparent = true;
        this.deckMat.opacity = 0.08;
        this.deckMat.depthWrite = false;
        this.deckMat.needsUpdate = true;
      }
      if (this.vivaMat) {
        this.vivaMat.transparent = true;
        this.vivaMat.opacity = 0.22;
        this.vivaMat.depthWrite = false;
        this.vivaMat.needsUpdate = true;
      }
      if (this.muertaMat) {
        this.muertaMat.transparent = true;
        this.muertaMat.opacity = 0.22;
        this.muertaMat.depthWrite = false;
        this.muertaMat.needsUpdate = true;
      }

      // Quitar el velo del mar sobre las bodegas
      if (this.seaMesh) {
        this.seaMesh.position.y = -(this.vesselDimensions?.draft || 9.5) - 1.5;
      }
      if (this.seaMat) {
        this.seaMat.opacity = 0.15;
        this.seaMat.depthWrite = false;
        this.seaMat.needsUpdate = true;
      }
    } else {
      this.hatchMeshes.forEach((mesh) => {
        mesh.material.transparent = false;
        mesh.material.opacity = 1.0;
        mesh.material.depthWrite = true;
        mesh.material.needsUpdate = true;
      });

      if (this.deckMat) {
        this.deckMat.transparent = false;
        this.deckMat.opacity = 1.0;
        this.deckMat.depthWrite = true;
        this.deckMat.needsUpdate = true;
      }
      if (this.vivaMat) {
        this.vivaMat.transparent = false;
        this.vivaMat.opacity = 1.0;
        this.vivaMat.depthWrite = true;
        this.vivaMat.needsUpdate = true;
      }
      if (this.muertaMat) {
        this.muertaMat.transparent = false;
        this.muertaMat.opacity = 1.0;
        this.muertaMat.depthWrite = true;
        this.muertaMat.needsUpdate = true;
      }

      // Restaurar superficie del mar
      if (this.seaMesh) {
        this.seaMesh.position.y = 0;
      }
      if (this.seaMat) {
        this.seaMat.opacity = 0.55;
        this.seaMat.depthWrite = true;
        this.seaMat.needsUpdate = true;
      }
    }

    return this.hatchesOpen;
  }

  /**
   * Ajusta la posición de cámara según el ángulo seleccionado
   * @param {'profile'|'threeQuarter'|'top'|'stern'|'bow'} preset
   */
  setViewPreset(preset = 'threeQuarter') {
    if (!this.camera || !this.controls) return;
    const L = this.vesselDimensions.length;

    switch (preset) {
      case 'profile':
        this.camera.position.set(L * 0.95, 12, 0);
        this.controls.target.set(0, 5, 0);
        break;
      case 'threeQuarter':
        this.camera.position.set(L * 0.65, L * 0.45, L * 0.65);
        this.controls.target.set(0, 5, 0);
        break;
      case 'top':
        this.camera.position.set(0.01, L * 1.1, 0);
        this.controls.target.set(0, 0, 0);
        break;
      case 'stern':
        this.camera.position.set(0, L * 0.25, -L * 0.95);
        this.controls.target.set(0, 5, 0);
        break;
      case 'bow':
        this.camera.position.set(0, L * 0.25, L * 0.95);
        this.controls.target.set(0, 5, 0);
        break;
    }
    this.controls.update();
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  destroy() {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.onWindowResize);

    if (this.projectCargoGroup && this.scene) {
      this.scene.remove(this.projectCargoGroup);
      this.projectCargoGroup = null;
    }

    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.remove();
      this.renderer.dispose();
    }
    this.scene = null;
    this.camera = null;
    this.controls = null;
  }
}

if (typeof window !== 'undefined') {
  window.Vessel3DViewer = Vessel3DViewer;
}
