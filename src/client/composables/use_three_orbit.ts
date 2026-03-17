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
const CAMERA_Y_MIN = 2.5;
const CAMERA_Y_MAX = 6;
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

  // (atmosphere glow uses Fresnel shader on a second sphere — no sprite textures needed)

  // ---------------------------------------------------------------------------
  // Central star/nebula
  // ---------------------------------------------------------------------------

  function createCentralStar(): void {
    if (!scene) return;

    // Textured star core — moon texture with bright emissive for a 3D sun shape
    const loader = new THREE.TextureLoader();
    const sunTex = loader.load('/textures/2k_moon.jpg');
    disposables.push(sunTex);
    const coreGeo = new THREE.SphereGeometry(0.08, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      map: sunTex,
    });
    disposables.push(coreGeo, coreMat);
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    if (!prefersReduced) {
      // Slow self-rotation for the star
      coreMesh.userData['isStar'] = true;
    }
    scene.add(coreMesh);
    meshes.push(coreMesh);

    // Helper: create a canvas radial glow texture
    function makeGlowCanvas(): HTMLCanvasElement {
      const size = 128;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx2 = c.getContext('2d')!;
      const half = size / 2;
      const g = ctx2.createRadialGradient(half, half, 0, half, half, half);
      g.addColorStop(0, 'rgba(220, 240, 255, 1)');
      g.addColorStop(0.06, 'rgba(180, 220, 255, 0.7)');
      g.addColorStop(0.2, 'rgba(0, 180, 255, 0.2)');
      g.addColorStop(0.45, 'rgba(0, 100, 200, 0.05)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, size, size);
      return c;
    }

    const glowCanvas = makeGlowCanvas();
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    disposables.push(glowTex);

    // Main round glow
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(glowMat);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(3, 3, 1);
    scene.add(glow);

    // Horizontal flare streak
    const hFlareMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.3,
    });
    disposables.push(hFlareMat);
    const hFlare = new THREE.Sprite(hFlareMat);
    hFlare.scale.set(7, 0.35, 1);
    scene.add(hFlare);

    // Vertical flare streak
    const vFlareMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.2,
    });
    disposables.push(vFlareMat);
    const vFlare = new THREE.Sprite(vFlareMat);
    vFlare.scale.set(0.3, 5.5, 1);
    scene.add(vFlare);

    // Point light
    const pointLight = new THREE.PointLight(0xccddff, 1.2, 12);
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
    camera.position.set(0, 4, CAMERA_Z);
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

      // Atmosphere — slightly larger sphere with Fresnel rim glow shader
      const atmoGeo = new THREE.SphereGeometry(planet.size * 1.15, 32, 32);
      disposables.push(atmoGeo);

      const r = planet.haloColor.r;
      const g = planet.haloColor.g;
      const b = planet.haloColor.b;

      const atmoMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          glowColor: { value: new THREE.Vector3(r, g, b) },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPositionW;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vPositionW = (modelViewMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 glowColor;
          varying vec3 vNormal;
          varying vec3 vPositionW;
          void main() {
            vec3 viewDir = normalize(-vPositionW);
            float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
            rim = pow(rim, 2.5);
            gl_FragColor = vec4(glowColor, rim * 0.45);
          }
        `,
      });
      disposables.push(atmoMat);

      const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
      mesh.add(atmoMesh);

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
    camera.lookAt(0, 0, 0);
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
    // Scale camera distance so the orbit fills the viewport proportionally.
    // Reference: 800px wide = CAMERA_Z distance. Wider = pull back, narrower = move in.
    const scaleFactor = Math.max(w, 600) / 800;
    camera.position.z = CAMERA_Z / scaleFactor;
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
