<script setup lang="ts">
/**
 * StartPage — the "home" view rendered in the main grid area when no session is selected.
 *
 * Shows a TRON-aesthetic animated SVG grid background with 5 pipeline nodes and
 * ambient particles over a centered upload-zone card (design system component).
 * Respects prefers-reduced-motion by disabling all CSS animations.
 * Upload flow is wired in Stage 10 — for now, upload-zone opens the file picker only.
 */
import { ref, inject, computed, onMounted, onUnmounted } from 'vue';
import { sessionListKey } from '../composables/useSessionList.js';
import { useUpload } from '../composables/useUpload.js';
import type { Session } from '../../shared/types/session.js';

const sessionList = inject(sessionListKey, null);
const isLoading = computed(() => sessionList?.loading.value ?? true);
const hasSessions = computed(() => (sessionList?.sessions.value.length ?? 0) > 0);

const fileInputRef = ref<HTMLInputElement | null>(null);
const { uploadFileWithOptimistic } = useUpload();

// ---------------------------------------------------------------------------
// 3D orbit canvas — 5 lit spheres orbiting with perspective projection
// ---------------------------------------------------------------------------

const orbitCanvasRef = ref<HTMLCanvasElement | null>(null);
let animFrameId = 0;

interface OrbitalNode {
  label: string;
  angle: number;
  color: [number, number, number];
  ambient: [number, number, number]; // colored shadow fill (not black)
}

const NODES: OrbitalNode[] = [
  { label: 'record',   angle: 0,                  color: [0, 212, 255], ambient: [26, 26, 90] },
  { label: 'validate', angle: (2 * Math.PI) / 5,  color: [255, 77, 106], ambient: [90, 26, 58] },
  { label: 'detect',   angle: (4 * Math.PI) / 5,  color: [0, 212, 255], ambient: [26, 26, 90] },
  { label: 'replay',   angle: (6 * Math.PI) / 5,  color: [0, 212, 255], ambient: [26, 26, 90] },
  { label: 'curate',   angle: (8 * Math.PI) / 5,  color: [255, 77, 106], ambient: [90, 26, 58] },
];

const ORBIT_TILT = 75 * (Math.PI / 180); // 75° — nearly top-down, horizontal ring like viewing Earth's equator from above
const ORBIT_SPEED = (2 * Math.PI) / 25;  // full rotation in 25s
const PERSPECTIVE = 600;
const BASE_SPHERE_RADIUS = 14; // base radius in px at z=0

function drawOrbit(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, time: number): void {
  const dpr = globalThis.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const orbitRadius = Math.min(w, h) * 0.3;
  const sphereRadius = Math.max(10, Math.min(w, h) * 0.025);
  const rotation = time * 0.001 * ORBIT_SPEED;

  // Project each node into 2D with depth
  const projected: { x: number; y: number; z: number; scale: number; node: OrbitalNode }[] = [];

  for (const node of NODES) {
    const a = rotation + node.angle;
    // 3D position on tilted orbit ring
    const x3 = Math.cos(a) * orbitRadius;
    const y3 = Math.sin(a) * orbitRadius * Math.cos(ORBIT_TILT);
    const z3 = Math.sin(a) * orbitRadius * Math.sin(ORBIT_TILT);

    // Perspective projection
    const scale = PERSPECTIVE / (PERSPECTIVE + z3);
    const sx = cx + x3 * scale;
    const sy = cy + y3 * scale;

    projected.push({ x: sx, y: sy, z: z3, scale, node });
  }

  // Sort back-to-front (far first)
  projected.sort((a, b) => b.z - a.z);

  for (const { x, y, scale, node } of projected) {
    const r = sphereRadius * scale;
    const [cr, cg, cb] = node.color;
    const [ar, ag, ab] = node.ambient;
    const depthAlpha = 0.4 + 0.6 * scale;

    // --- Layer 1: Atmosphere glow ---
    ctx.save();
    ctx.globalAlpha = depthAlpha * 0.3;
    const atmo = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2);
    atmo.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.2)`);
    atmo.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, 0.06)`);
    atmo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = atmo;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();

    // --- Layer 2: Core diffuse (white highlight → color → colored ambient shadow) ---
    ctx.save();
    ctx.globalAlpha = depthAlpha;
    const core = ctx.createRadialGradient(
      x - r * 0.35, y - r * 0.35, 0,
      x, y, r * 1.1
    );
    core.addColorStop(0, 'rgba(255, 255, 255, 1)');
    core.addColorStop(0.2, `rgba(${cr}, ${cg}, ${cb}, 1)`);
    core.addColorStop(0.6, `rgba(${cr}, ${cg}, ${cb}, 1)`);
    core.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 1)`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();

    // --- Layer 3: Specular highlight (soft, wide — screen blend) ---
    ctx.save();
    ctx.globalAlpha = depthAlpha * 0.6;
    ctx.globalCompositeOperation = 'screen';
    const hlX = x - r * 0.4;
    const hlY = y - r * 0.4;
    const spec = ctx.createRadialGradient(hlX, hlY, r * 0.1, hlX, hlY, r * 0.6);
    spec.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
    spec.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // --- Layer 4: Ambient occlusion (multiply — darkens rim subtly) ---
    ctx.save();
    ctx.globalAlpha = depthAlpha * 0.3;
    ctx.globalCompositeOperation = 'multiply';
    const ao = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 1.05);
    ao.addColorStop(0, 'rgba(255, 255, 255, 1)');
    ao.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 1)`);
    ctx.fillStyle = ao;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // --- Layer 5: Subsurface scattering hint (screen — glow on shadow side) ---
    ctx.save();
    ctx.globalAlpha = depthAlpha * 0.15;
    ctx.globalCompositeOperation = 'screen';
    const sss = ctx.createRadialGradient(
      x + r * 0.4, y + r * 0.4, 0,
      x + r * 0.4, y + r * 0.4, r * 0.8
    );
    sss.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.3)`);
    sss.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sss;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // --- Label — always 2D, HUD style ---
    ctx.save();
    ctx.globalAlpha = depthAlpha * 0.7;
    const fontSize = Math.max(9, 11 * scale);
    ctx.font = `500 ${fontSize}px "Geist Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaaab0';
    ctx.fillText(node.label.toUpperCase(), x, y + r + 14 * scale);
    ctx.restore();
  }
}

function startOrbitAnimation(): void {
  const canvas = orbitCanvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Check reduced motion preference
  const prefersReduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function loop(time: number): void {
    drawOrbit(canvas!, ctx!, prefersReduced ? 0 : time);
    animFrameId = requestAnimationFrame(loop);
  }
  animFrameId = requestAnimationFrame(loop);
}

onMounted(() => {
  startOrbitAnimation();
});

onUnmounted(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId);
});

/** Opens the system file picker. Upload zone, browse link, and keyboard trigger this. */
function openFilePicker(): void {
  fileInputRef.value?.click();
}

/** Handles file selection — uses optimistic upload flow for each selected file when sessionList is available. */
function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length === 0 || !sessionList) return;
  for (const file of files) {
    uploadFileWithOptimistic(file, {
      onOptimisticInsert: (tempSession: Session) => {
        sessionList.sessions.value = [tempSession, ...sessionList.sessions.value];
      },
      onUploadComplete: async (tempId: string) => {
        sessionList.sessions.value = sessionList.sessions.value.filter(s => s.id !== tempId);
        await sessionList.fetchSessions();
      },
    });
  }
}

/** Keyboard handler for upload zone: Enter and Space open file picker. */
function handleDropZoneKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openFilePicker();
  }
}
</script>

<template>
  <div class="start-page">
    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".cast"
      multiple
      class="start-page__file-input"
      tabindex="-1"
      aria-hidden="true"
      @change="handleFileChange"
    />

    <!-- SVG Grid Backdrop with pipeline nodes -->
    <svg
      class="start-page__pipeline"
      viewBox="0 0 1280 600"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="spTronGrid"
          x="0"
          y="0"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <line
            x1="0"
            y1="0"
            x2="40"
            y2="0"
            stroke="#00d4ff"
            stroke-width="0.4"
            opacity="0.22"
          />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="40"
            stroke="#00d4ff"
            stroke-width="0.4"
            opacity="0.22"
          />
          <circle
            cx="0"
            cy="0"
            r="0.8"
            fill="#00d4ff"
            opacity="0.3"
          />
        </pattern>
      </defs>

      <!-- TRON fine grid -->
      <rect
        class="sp-grid-dots"
        width="100%"
        height="100%"
        fill="url(#spTronGrid)"
      />

      <!-- Decorative secondary paths -->
      <path
        class="sp-deco-path"
        d="M 60,80 C 140,60 200,100 280,80 S 420,40 520,75"
        stroke="#00d4ff"
      />
      <path
        class="sp-deco-path"
        d="M 760,480 C 840,460 900,500 980,480 S 1100,440 1200,470"
        stroke="#ff4d6a"
      />

    </svg>

    <!-- 3D orbiting pipeline nodes — Canvas with real projected spheres -->
    <canvas
      ref="orbitCanvasRef"
      class="sp-orbit-canvas"
      aria-hidden="true"
    />

    <!-- Ambient particles (8 total — 6 cyan, 2 pink) -->
    <div
      class="sp-particle sp-particle--1"
      aria-hidden="true"
    />
    <div
      class="sp-particle sp-particle--2"
      aria-hidden="true"
    />
    <div
      class="sp-particle sp-particle--3"
      aria-hidden="true"
    />
    <div
      class="sp-particle sp-particle--4"
      aria-hidden="true"
    />
    <div
      class="sp-particle sp-particle--5"
      aria-hidden="true"
    />
    <div
      class="sp-particle sp-particle--6"
      aria-hidden="true"
    />
    <div
      class="sp-particle sp-particle--7"
      aria-hidden="true"
    />
    <div
      class="sp-particle sp-particle--8"
      aria-hidden="true"
    />

    <!-- Blinking cursor watermark — hidden when sessions already exist -->
    <div
      v-if="!isLoading && !hasSessions"
      class="start-page__cursor-prompt"
      aria-hidden="true"
    >
      <span class="start-page__cursor-chevron">&gt;</span><span class="start-page__cursor-blink">_</span>
    </div>

    <!-- Content overlay (centered over SVG) — hidden when sessions exist -->
    <div
      v-if="!isLoading && !hasSessions"
      class="start-page__content"
    >
      <!-- Upload zone — design system component -->
      <div
        class="upload-zone"
        role="button"
        tabindex="0"
        aria-label="Upload session files"
        aria-dropeffect="copy"
        @click="openFilePicker"
        @keydown="handleDropZoneKeydown"
      >
        <div class="upload-zone__icon">
          <div
            class="upload-zone__disc-ring"
            aria-hidden="true"
          />
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M14 30V36H34V30" />
            <path d="M24 12V30" />
            <path d="M16 20L24 12L32 20" />
          </svg>
        </div>
        <div class="upload-zone__title">
          No sessions yet. Fix that.
        </div>
        <div class="upload-zone__subtitle">
          Drop a <code>.cast</code> file here or click to browse
          — watch it unfold into something you can actually read.
        </div>
        <span
          class="upload-zone__browse"
          aria-hidden="true"
        >Browse Files</span>
      </div>

      <!-- AGR hint -->
      <p class="start-page__hint">
        Recording sessions? Use <a
          href="https://github.com/thiscantbeserious/agent-session-recorder"
          target="_blank"
          rel="noopener noreferrer"
        >AGR</a> to capture them.
      </p>
    </div>
  </div>
</template>

<style scoped>
/* ============================================================
   START PAGE — fills main grid area
   ============================================================ */

.start-page {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Hidden file input */
.start-page__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

/* ============================================================
   SVG GRID BACKDROP
   ============================================================ */

.start-page__pipeline {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
  opacity: 0.4;
}

/* TRON grid — starts at low opacity, animates in */
.sp-grid-dots {
  opacity: 0;
}

/* ============================================================
   DECORATIVE SECONDARY PATHS
   ============================================================ */

.sp-deco-path {
  fill: none;
  stroke-width: 0.5;
  stroke-dasharray: 3 8;
  opacity: 0;
  visibility: hidden;
}

/* ============================================================
   3D ORBIT CANVAS — real projected spheres with shading
   ============================================================ */

.sp-orbit-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

/* ============================================================
   AMBIENT PARTICLES
   ============================================================ */

.sp-particle {
  position: absolute;
  border-radius: var(--radius-full);
  pointer-events: none;
  opacity: 0;
  z-index: 1;
}

.sp-particle--1 {
  top: 12%;
  left: 8%;
  width: 4px;
  height: 4px;
  background: var(--accent-primary);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent-primary) 40%, transparent), 0 0 16px color-mix(in srgb, var(--accent-primary) 15%, transparent);
}

.sp-particle--2 {
  top: 18%;
  right: 12%;
  width: 4px;
  height: 4px;
  background: var(--accent-secondary);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent-secondary) 35%, transparent), 0 0 16px color-mix(in srgb, var(--accent-secondary) 15%, transparent);
}

.sp-particle--3 {
  top: 40%;
  left: 5%;
  width: 4px;
  height: 4px;
  background: var(--accent-primary);
  box-shadow: 0 0 6px color-mix(in srgb, var(--accent-primary) 40%, transparent), 0 0 12px color-mix(in srgb, var(--accent-primary) 12%, transparent);
}

.sp-particle--4 {
  top: 45%;
  right: 7%;
  width: 5px;
  height: 5px;
  background: var(--accent-primary);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent-primary) 40%, transparent), 0 0 16px color-mix(in srgb, var(--accent-primary) 15%, transparent);
}

.sp-particle--5 {
  bottom: 22%;
  left: 15%;
  width: 6px;
  height: 6px;
  background: var(--accent-primary);
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent-primary) 40%, transparent), 0 0 20px color-mix(in srgb, var(--accent-primary) 18%, transparent);
}

.sp-particle--6 {
  bottom: 18%;
  right: 18%;
  width: 4px;
  height: 4px;
  background: var(--accent-primary);
  box-shadow: 0 0 6px color-mix(in srgb, var(--accent-primary) 40%, transparent), 0 0 12px color-mix(in srgb, var(--accent-primary) 12%, transparent);
}

.sp-particle--7 {
  top: 25%;
  left: 30%;
  width: 4px;
  height: 4px;
  background: var(--accent-secondary);
  box-shadow: 0 0 6px color-mix(in srgb, var(--accent-secondary) 35%, transparent), 0 0 12px color-mix(in srgb, var(--accent-secondary) 12%, transparent);
}

.sp-particle--8 {
  bottom: 30%;
  right: 25%;
  width: 5px;
  height: 5px;
  background: var(--accent-primary);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent-primary) 40%, transparent), 0 0 16px color-mix(in srgb, var(--accent-primary) 15%, transparent);
}

/* ============================================================
   CURSOR WATERMARK
   ============================================================ */

.start-page__cursor-prompt {
  position: absolute;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: var(--font-mono);
  font-size: 35rem;
  font-weight: 800;
  color: #355998;
  pointer-events: none;
  user-select: none;
  z-index: 0;
  line-height: 1;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
}

.start-page__cursor-blink {
  animation: cursorBlink 1s step-end infinite;
}

/* ============================================================
   CONTENT OVERLAY
   ============================================================ */

.start-page__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--space-6) var(--space-8);
  max-width: 560px;
  width: 100%;
}

/* ============================================================
   AGR HINT
   ============================================================ */

.start-page__hint {
  margin-top: var(--space-5);
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.start-page__hint a {
  color: var(--accent-secondary);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color var(--duration-fast) var(--easing-default);
}

.start-page__hint a:hover {
  border-bottom-color: var(--accent-secondary);
}

/* ============================================================
   KEYFRAMES
   ============================================================ */



@keyframes spGridFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes cursorBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

@keyframes spDecoFadeIn {
  from { visibility: visible; opacity: 0; }
  to   { visibility: visible; }
}

@keyframes spParticleDrift1 {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.6; }
  25%  { transform: translate(25px, -35px) scale(1.3); opacity: 0.8; }
  50%  { transform: translate(-15px, -70px) scale(0.7); opacity: 0.5; }
  75%  { transform: translate(35px, -25px) scale(1.1); opacity: 0.7; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
}

@keyframes spParticleDrift2 {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.5; }
  25%  { transform: translate(-35px, 18px) scale(1.2); opacity: 0.7; }
  50%  { transform: translate(8px, 45px) scale(0.6); opacity: 0.4; }
  75%  { transform: translate(-25px, -8px) scale(1.4); opacity: 0.6; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
}

@keyframes spParticleDrift3 {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.4; }
  25%  { transform: translate(45px, 25px) scale(1.4); opacity: 0.7; }
  50%  { transform: translate(18px, -35px) scale(0.8); opacity: 0.5; }
  75%  { transform: translate(-18px, 18px) scale(1); opacity: 0.6; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.4; }
}

@keyframes spParticleDrift4 {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.5; }
  25%  { transform: translate(-25px, -45px) scale(0.7); opacity: 0.4; }
  50%  { transform: translate(35px, -18px) scale(1.3); opacity: 0.6; }
  75%  { transform: translate(8px, 25px) scale(0.9); opacity: 0.5; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
}

@keyframes spParticleDrift5 {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.6; }
  25%  { transform: translate(18px, 35px) scale(0.6); opacity: 0.4; }
  50%  { transform: translate(-35px, 8px) scale(1.2); opacity: 0.7; }
  75%  { transform: translate(25px, -18px) scale(1.4); opacity: 0.5; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
}

@keyframes spParticleDrift6 {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.4; }
  25%  { transform: translate(-18px, -25px) scale(1.2); opacity: 0.6; }
  50%  { transform: translate(25px, 35px) scale(0.7); opacity: 0.5; }
  75%  { transform: translate(-35px, 8px) scale(1); opacity: 0.4; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.4; }
}

@keyframes spParticleDrift7 {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.5; }
  25%  { transform: translate(35px, -18px) scale(1.4); opacity: 0.7; }
  50%  { transform: translate(-8px, 45px) scale(0.8); opacity: 0.4; }
  75%  { transform: translate(18px, -35px) scale(1.1); opacity: 0.6; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
}

@keyframes spParticleDrift8 {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.4; }
  25%  { transform: translate(-45px, 18px) scale(0.6); opacity: 0.5; }
  50%  { transform: translate(18px, -25px) scale(1.3); opacity: 0.6; }
  75%  { transform: translate(-8px, 35px) scale(1); opacity: 0.4; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.4; }
}

/* ============================================================
   REDUCED MOTION — show final state, no animation
   ============================================================ */

@media (prefers-reduced-motion: reduce) {
  .sp-grid-dots { opacity: 1 !important; }
  .sp-particle { display: none !important; }
  .sp-deco-path { opacity: 0.06 !important; visibility: visible !important; }
  .start-page__cursor-blink { animation: none !important; }
  .sp-orbit__ring { animation-play-state: paused !important; }
  .sp-orbit__node-inner { animation-play-state: paused !important; }
}

/* ============================================================
   MOTION-ALLOWED ANIMATIONS
   ============================================================ */

@media (prefers-reduced-motion: no-preference) {
  /* Grid fade in */
  .sp-grid-dots {
    animation: spGridFadeIn 1.5s ease-out 0.2s forwards;
  }

  /* Deco paths fade in */
  .sp-deco-path {
    animation: spDecoFadeIn 1s ease-out 0.5s forwards;
  }

  /* Ambient particles */
  .sp-particle--1 { animation: spParticleDrift1 12s ease-in-out -3s infinite; }
  .sp-particle--2 { animation: spParticleDrift2 15s ease-in-out -7s infinite; }
  .sp-particle--3 { animation: spParticleDrift3 10s ease-in-out -1s infinite; }
  .sp-particle--4 { animation: spParticleDrift4 13s ease-in-out -5s infinite; }
  .sp-particle--5 { animation: spParticleDrift5 16s ease-in-out -9s infinite; }
  .sp-particle--6 { animation: spParticleDrift6 9s ease-in-out -2s infinite; }
  .sp-particle--7 { animation: spParticleDrift7 14s ease-in-out -6s infinite; }
  .sp-particle--8 { animation: spParticleDrift8 17s ease-in-out -11s infinite; }
}
</style>
