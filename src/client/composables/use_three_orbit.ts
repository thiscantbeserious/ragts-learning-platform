/**
 * useThreeOrbit — Three.js planet orbit scene composable.
 *
 * 5 small textured spheres with atmospheric glow halos orbiting a central
 * nebula/star. Planets are tinted cyan or pink to match the design system.
 * Mouse Y controls camera elevation. Labels projected as HTML overlays.
 *
 * Texture credit: Solar System Scope (CC BY 4.0)
 * https://www.solarsystemscope.com/textures/
 */
import { ref } from 'vue';
import type { Ref } from 'vue';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORBIT_SPEED = 0.0015;
const SELF_ROTATE_SPEED = 0.004;
const LERP_FACTOR = 0.04;
const CAMERA_Y_MIN = 1.5;
const CAMERA_Y_MAX = 5;
const CAMERA_Z = 12;

interface PlanetConfig {
  label: string;
  texture: string;
  orbitRadius: number;
  size: number;
  angle: number;
  tint: THREE.Color;
  haloColor: THREE.Color;
}

const CYAN = new THREE.Color(0x00d4ff);
const PINK = new THREE.Color(0xff4d6a);

const PLANETS: PlanetConfig[] = [
  { label: 'RECORD',   texture: '/textures/2k_mars.jpg',          orbitRadius: 1.8, size: 0.12, angle: 0,                  tint: CYAN, haloColor: CYAN },
  { label: 'VALIDATE', texture: '/textures/2k_moon.jpg',          orbitRadius: 2.6, size: 0.10, angle: (2 * Math.PI) / 5,  tint: PINK, haloColor: PINK },
  { label: 'DETECT',   texture: '/textures/2k_jupiter.jpg',       orbitRadius: 3.4, size: 0.15, angle: (4 * Math.PI) / 5,  tint: CYAN, haloColor: CYAN },
  { label: 'REPLAY',   texture: '/textures/2k_venus_surface.jpg', orbitRadius: 4.2, size: 0.11, angle: (6 * Math.PI) / 5,  tint: CYAN, haloColor: CYAN },
  { label: 'CURATE',   texture: '/textures/2k_mars.jpg',          orbitRadius: 5.0, size: 0.13, angle: (8 * Math.PI) / 5,  tint: PINK, haloColor: PINK },
];

// ---------------------------------------------------------------------------
// Label position type
// ---------------------------------------------------------------------------

export interface LabelPosition {
  label: string;
  x: number;
  y: number;
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useThreeOrbit(externalContainerRef?: Ref<HTMLElement | null>) {
  const containerRef: Ref<HTMLElement | null> = externalContainerRef ?? ref<HTMLElement | null>(null);
  const labelPositions = ref<LabelPosition[]>([]);

  let renderer: THREE.WebGLRenderer | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let scene: THREE.Scene | null = null;
  let orbitGroup: THREE.Group | null = null;
  let animFrameId = 0;
  let resizeObserver: ResizeObserver | null = null;

  const meshes: THREE.Mesh[] = [];
  const disposables: { dispose(): void }[] = [];

  let targetCameraY = 3;
  let currentCameraY = 3;

  const prefersReduced =
    typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  // ---------------------------------------------------------------------------
  // Halo sprite texture (generated procedurally)
  // ---------------------------------------------------------------------------

  function createHaloTexture(color: THREE.Color): THREE.Texture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0, `rgba(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)}, 0.6)`);
    grad.addColorStop(0.3, `rgba(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)}, 0.15)`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    disposables.push(tex);
    return tex;
  }

  // ---------------------------------------------------------------------------
  // Central star/nebula
  // ---------------------------------------------------------------------------

  function createCentralStar(): void {
    if (!scene) return;

    // Glowing core sprite
    const coreCanvas = document.createElement('canvas');
    coreCanvas.width = 256;
    coreCanvas.height = 256;
    const ctx = coreCanvas.getContext('2d')!;
    const cx = 128;

    // Nebula-like glow — multi-layer
    const g1 = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g1.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g1.addColorStop(0.05, 'rgba(200, 240, 255, 0.8)');
    g1.addColorStop(0.15, 'rgba(0, 212, 255, 0.3)');
    g1.addColorStop(0.4, 'rgba(255, 77, 106, 0.08)');
    g1.addColorStop(0.7, 'rgba(0, 100, 200, 0.03)');
    g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, 256, 256);

    const coreTex = new THREE.CanvasTexture(coreCanvas);
    disposables.push(coreTex);

    const coreMat = new THREE.SpriteMaterial({
      map: coreTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(coreMat);

    const coreSprite = new THREE.Sprite(coreMat);
    coreSprite.scale.set(3, 3, 1);
    coreSprite.position.set(0, 0, 0);
    scene.add(coreSprite);

    // Point light at center
    const pointLight = new THREE.PointLight(0xccddff, 1.5, 15);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);
  }

  // ---------------------------------------------------------------------------
  // Build scene
  // ---------------------------------------------------------------------------

  function buildScene(container: HTMLElement): void {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 3, CAMERA_Z);
    camera.lookAt(0, 0, 0);

    // Subtle ambient + directional
    const ambient = new THREE.AmbientLight(0x334466, 0.4);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(-4, 4, 5);
    scene.add(dir);

    createCentralStar();
    buildPlanets();
  }

  function buildPlanets(): void {
    if (!scene) return;
    orbitGroup = new THREE.Group();
    const loader = new THREE.TextureLoader();

    for (const planet of PLANETS) {
      const tex = loader.load(planet.texture);
      disposables.push(tex);

      const geo = new THREE.SphereGeometry(planet.size, 32, 32);
      disposables.push(geo);

      const mat = new THREE.MeshPhongMaterial({
        map: tex,
        emissive: planet.tint,
        emissiveIntensity: 0.15,
        shininess: 20,
      });
      disposables.push(mat);

      const mesh = new THREE.Mesh(geo, mat);
      const x = Math.cos(planet.angle) * planet.orbitRadius;
      const z = Math.sin(planet.angle) * planet.orbitRadius;
      mesh.position.set(x, 0, z);
      mesh.userData['label'] = planet.label;
      mesh.userData['orbitRadius'] = planet.orbitRadius;
      mesh.userData['baseAngle'] = planet.angle;

      // Atmospheric glow halo
      const haloTex = createHaloTexture(planet.haloColor);
      const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(haloMat);
      const halo = new THREE.Sprite(haloMat);
      halo.scale.set(planet.size * 5, planet.size * 5, 1);
      mesh.add(halo);

      meshes.push(mesh);
      orbitGroup.add(mesh);
    }

    scene.add(orbitGroup);
  }

  // ---------------------------------------------------------------------------
  // Animation loop
  // ---------------------------------------------------------------------------

  function animate(): void {
    animFrameId = requestAnimationFrame(animate);
    if (!renderer || !scene || !camera || !orbitGroup) return;

    if (!prefersReduced) {
      // Rotate entire orbit group
      orbitGroup.rotation.y += ORBIT_SPEED;
      // Self-rotate each planet
      for (const mesh of meshes) {
        mesh.rotation.y += SELF_ROTATE_SPEED;
      }
    }

    smoothCamera();
    camera.lookAt(0, 0.3, 0); // look slightly above origin
    renderer.render(scene, camera);
    updateLabels();
  }

  function smoothCamera(): void {
    if (!camera) return;
    currentCameraY += (targetCameraY - currentCameraY) * LERP_FACTOR;
    camera.position.y = currentCameraY;
  }

  // ---------------------------------------------------------------------------
  // HTML label overlay
  // ---------------------------------------------------------------------------

  function updateLabels(): void {
    if (!camera || !renderer || !orbitGroup) return;
    const size = renderer.getSize(new THREE.Vector2());

    const positions: LabelPosition[] = [];
    for (const mesh of meshes) {
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);

      const projected = worldPos.clone().project(camera);
      const screenX = ((projected.x + 1) / 2) * size.x;
      const screenY = ((-projected.y + 1) / 2) * size.y;
      const visible = projected.z < 1;

      const planetSize = (mesh.userData['orbitRadius'] as number) * 0.01;
      positions.push({
        label: String(mesh.userData['label'] ?? ''),
        x: screenX,
        y: screenY + 12 + planetSize * 200,
        visible,
      });
    }
    labelPositions.value = positions;
  }

  // ---------------------------------------------------------------------------
  // Resize
  // ---------------------------------------------------------------------------

  function handleResize(container: HTMLElement): void {
    if (!renderer || !camera) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------------------
  // Mouse
  // ---------------------------------------------------------------------------

  function handleMouseMove(e: MouseEvent): void {
    const normalizedY = e.clientY / (globalThis.innerHeight || 1);
    targetCameraY = CAMERA_Y_MAX - normalizedY * (CAMERA_Y_MAX - CAMERA_Y_MIN);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function mount(): void {
    const container = containerRef.value;
    if (!container) return;
    buildScene(container);
    animate();
    resizeObserver = new ResizeObserver(() => handleResize(container));
    resizeObserver.observe(container);
    document.addEventListener('mousemove', handleMouseMove);
  }

  function unmount(): void {
    cancelAnimationFrame(animFrameId);
    document.removeEventListener('mousemove', handleMouseMove);
    resizeObserver?.disconnect();
    for (const d of disposables) d.dispose();
    renderer?.dispose();
    renderer = null;
    camera = null;
    scene = null;
    orbitGroup = null;
    meshes.length = 0;
    disposables.length = 0;
  }

  return { containerRef, labelPositions, mount, unmount };
}
