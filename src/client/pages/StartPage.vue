<script setup lang="ts">
/**
 * StartPage — the "home" view rendered in the main grid area when no session is selected.
 *
 * Shows a TRON-aesthetic animated SVG grid background with 5 pipeline nodes and
 * ambient particles over a centered upload-zone card (design system component).
 * Respects prefers-reduced-motion by disabling all CSS animations.
 * Upload flow is wired in Stage 10 — for now, upload-zone opens the file picker only.
 */
import { ref, inject, computed } from 'vue';
import { sessionListKey } from '../composables/useSessionList.js';
import { useUpload } from '../composables/useUpload.js';
import type { Session } from '../../shared/types/session.js';

const sessionList = inject(sessionListKey, null);
const hasSessions = computed(() => (sessionList?.sessions.value.length ?? 0) > 0);

const fileInputRef = ref<HTMLInputElement | null>(null);
const { uploadFileWithOptimistic } = useUpload();

/** Opens the system file picker. Upload zone, browse link, and keyboard trigger this. */
function openFilePicker(): void {
  fileInputRef.value?.click();
}

/** Handles file selection — uses optimistic upload flow for each selected file when sessionList is available. */
function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
  if (!files || files.length === 0 || !sessionList) return;
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

      <!-- Node 1: record (cyan) at grid intersection 280,120 -->
      <g>
        <circle
          class="sp-node-fill sp-node-fill--cyan sp-node-fill--n1"
          cx="280"
          cy="120"
          r="6"
        />
        <circle
          class="sp-node-ring sp-node-ring--cyan sp-node-ring--n1"
          cx="280"
          cy="120"
          r="10"
        />
        <circle
          class="sp-node-outer sp-node-outer--n1"
          cx="280"
          cy="120"
          r="16"
          stroke="#00d4ff"
          stroke-dasharray="4 4"
        />
        <text
          class="sp-node-label sp-node-label--n1"
          x="280"
          y="160"
        >record</text>
      </g>

      <!-- Node 2: validate (pink) at grid intersection 400,480 -->
      <g>
        <circle
          class="sp-node-fill sp-node-fill--pink sp-node-fill--n2"
          cx="400"
          cy="480"
          r="6"
        />
        <circle
          class="sp-node-ring sp-node-ring--pink sp-node-ring--n2"
          cx="400"
          cy="480"
          r="10"
        />
        <circle
          class="sp-node-outer sp-node-outer--n2"
          cx="400"
          cy="480"
          r="16"
          stroke="#ff4d6a"
          stroke-dasharray="4 4"
        />
        <text
          class="sp-node-label sp-node-label--n2"
          x="400"
          y="520"
        >validate</text>
      </g>

      <!-- Node 3: detect (cyan) at grid intersection 640,80 -->
      <g>
        <circle
          class="sp-node-fill sp-node-fill--cyan sp-node-fill--n3"
          cx="640"
          cy="80"
          r="6"
        />
        <circle
          class="sp-node-ring sp-node-ring--cyan sp-node-ring--n3"
          cx="640"
          cy="80"
          r="10"
        />
        <circle
          class="sp-node-outer sp-node-outer--n3"
          cx="640"
          cy="80"
          r="16"
          stroke="#00d4ff"
          stroke-dasharray="4 4"
        />
        <text
          class="sp-node-label sp-node-label--n3"
          x="640"
          y="120"
        >detect</text>
      </g>

      <!-- Node 4: replay (pink) at grid intersection 920,480 -->
      <g>
        <circle
          class="sp-node-fill sp-node-fill--pink sp-node-fill--n4"
          cx="920"
          cy="480"
          r="6"
        />
        <circle
          class="sp-node-ring sp-node-ring--pink sp-node-ring--n4"
          cx="920"
          cy="480"
          r="10"
        />
        <circle
          class="sp-node-outer sp-node-outer--n4"
          cx="920"
          cy="480"
          r="16"
          stroke="#ff4d6a"
          stroke-dasharray="4 4"
        />
        <text
          class="sp-node-label sp-node-label--n4"
          x="920"
          y="520"
        >replay</text>
      </g>

      <!-- Node 5: curate (cyan, final — stronger glow) at grid intersection 960,120 -->
      <g>
        <circle
          class="sp-node-fill sp-node-fill--final sp-node-fill--n5"
          cx="960"
          cy="120"
          r="8"
        />
        <circle
          class="sp-node-ring sp-node-ring--final sp-node-ring--n5"
          cx="960"
          cy="120"
          r="13"
        />
        <circle
          class="sp-node-outer sp-node-outer--n5"
          cx="960"
          cy="120"
          r="20"
          stroke="#00d4ff"
          stroke-dasharray="5 5"
        />
        <text
          class="sp-node-label sp-node-label--n5"
          x="960"
          y="160"
        >curate</text>
      </g>
    </svg>

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

    <!-- Blinking cursor watermark -->
    <div
      class="start-page__cursor-prompt"
      aria-hidden="true"
    >
      <span class="start-page__cursor-chevron">&gt;</span><span class="start-page__cursor-blink">_</span>
    </div>

    <!-- Content overlay (centered over SVG) -->
    <div class="start-page__content">
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
          {{ hasSessions ? 'Add another session.' : 'No sessions yet. Fix that.' }}
        </div>
        <div class="upload-zone__subtitle">
          Drop a <code>.cast</code> file here or click to browse
          — watch it unfold into something you can actually read.
        </div>
        <span
          class="upload-zone__browse"
          role="button"
          tabindex="0"
          @click.stop="openFilePicker"
          @keydown.enter.stop="openFilePicker"
          @keydown.space.prevent.stop="openFilePicker"
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
   PIPELINE NODES — TRON identity disc style
   ============================================================ */

.sp-node-ring {
  fill: none;
  stroke-width: 1;
  opacity: 0;
}

.sp-node-ring--cyan {
  stroke: #00d4ff;
  filter: drop-shadow(0 0 8px rgba(0, 212, 255, 0.4))
          drop-shadow(0 0 16px rgba(0, 212, 255, 0.2));
}

.sp-node-ring--pink {
  stroke: #ff4d6a;
  filter: drop-shadow(0 0 8px rgba(255, 77, 106, 0.35))
          drop-shadow(0 0 16px rgba(255, 77, 106, 0.2));
}

.sp-node-ring--final {
  stroke: #00d4ff;
  stroke-width: 1.5;
  filter: drop-shadow(0 0 14px rgba(0, 212, 255, 0.4))
          drop-shadow(0 0 30px rgba(0, 212, 255, 0.25));
}

.sp-node-outer {
  fill: none;
  stroke-width: 0.5;
  opacity: 0;
}

.sp-node-fill {
  opacity: 0;
}

.sp-node-fill--cyan {
  fill: rgba(0, 212, 255, 0.15);
}

.sp-node-fill--pink {
  fill: rgba(255, 77, 106, 0.12);
}

.sp-node-fill--final {
  fill: rgba(0, 212, 255, 0.25);
}

.sp-node-label {
  font-family: var(--font-mono);
  font-size: 14px;
  letter-spacing: 0.2em;
  fill: var(--text-muted);
  text-anchor: middle;
  text-transform: uppercase;
  opacity: 0;
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
  background: #00d4ff;
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.4), 0 0 16px rgba(0, 212, 255, 0.15);
}

.sp-particle--2 {
  top: 18%;
  right: 12%;
  width: 4px;
  height: 4px;
  background: #ff4d6a;
  box-shadow: 0 0 8px rgba(255, 77, 106, 0.35), 0 0 16px rgba(255, 77, 106, 0.15);
}

.sp-particle--3 {
  top: 40%;
  left: 5%;
  width: 4px;
  height: 4px;
  background: #00d4ff;
  box-shadow: 0 0 6px rgba(0, 212, 255, 0.4), 0 0 12px rgba(0, 212, 255, 0.12);
}

.sp-particle--4 {
  top: 45%;
  right: 7%;
  width: 5px;
  height: 5px;
  background: #00d4ff;
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.4), 0 0 16px rgba(0, 212, 255, 0.15);
}

.sp-particle--5 {
  bottom: 22%;
  left: 15%;
  width: 6px;
  height: 6px;
  background: #00d4ff;
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.4), 0 0 20px rgba(0, 212, 255, 0.18);
}

.sp-particle--6 {
  bottom: 18%;
  right: 18%;
  width: 4px;
  height: 4px;
  background: #00d4ff;
  box-shadow: 0 0 6px rgba(0, 212, 255, 0.4), 0 0 12px rgba(0, 212, 255, 0.12);
}

.sp-particle--7 {
  top: 25%;
  left: 30%;
  width: 4px;
  height: 4px;
  background: #ff4d6a;
  box-shadow: 0 0 6px rgba(255, 77, 106, 0.35), 0 0 12px rgba(255, 77, 106, 0.12);
}

.sp-particle--8 {
  bottom: 30%;
  right: 25%;
  width: 5px;
  height: 5px;
  background: #00d4ff;
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.4), 0 0 16px rgba(0, 212, 255, 0.15);
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
  /*text-shadow: 0 0 60px rgba(53, 89, 152, 0.3);*/
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

@keyframes spNodeAppear {
  0%   { opacity: 0; transform: scale(0.4); }
  60%  { opacity: 1; transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes spOuterRingAppear {
  0%   { opacity: 0; transform: scale(0.6); }
  100% { opacity: 0.3; transform: scale(1); }
}

@keyframes spFillAppear {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes spLabelReveal {
  from { opacity: 0; }
  to   { opacity: 0.3; }
}

@keyframes spNodePulseCyan {
  0%, 100% { transform: scale(1);
             filter: drop-shadow(0 0 6px rgba(0, 212, 255, 0.35))
                     drop-shadow(0 0 14px rgba(0, 212, 255, 0.15)); }
  50%      { transform: scale(1.3);
             filter: drop-shadow(0 0 14px rgba(0, 212, 255, 0.65))
                     drop-shadow(0 0 28px rgba(0, 212, 255, 0.25)); }
}

@keyframes spNodePulsePink {
  0%, 100% { transform: scale(1);
             filter: drop-shadow(0 0 6px rgba(255, 77, 106, 0.35))
                     drop-shadow(0 0 14px rgba(255, 77, 106, 0.15)); }
  50%      { transform: scale(1.3);
             filter: drop-shadow(0 0 14px rgba(255, 77, 106, 0.65))
                     drop-shadow(0 0 28px rgba(255, 77, 106, 0.25)); }
}

@keyframes spNodePulseFinal {
  0%, 100% {
    transform: scale(1);
    filter: drop-shadow(0 0 10px rgba(0, 212, 255, 0.4))
            drop-shadow(0 0 20px rgba(0, 212, 255, 0.15));
  }
  50% {
    transform: scale(1.4);
    filter: drop-shadow(0 0 20px rgba(0, 212, 255, 0.7))
            drop-shadow(0 0 40px rgba(0, 212, 255, 0.3));
  }
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
  .sp-node-ring { opacity: 1 !important; }
  .sp-node-outer { opacity: 0.3 !important; }
  .sp-node-fill { opacity: 1 !important; }
  .sp-node-label { opacity: 0.3 !important; }
  .start-page__cursor-blink { animation: none !important; }
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

  /* Node 1: record (cyan) — grid intersection 280, 120 */
  .sp-node-ring--n1 {
    transform-origin: 280px 120px;
    animation: spNodeAppear 0.5s ease-out 0.8s forwards,
               spNodePulseCyan 4s ease-in-out 5.0s infinite;
  }
  .sp-node-outer--n1 { animation: spOuterRingAppear 0.6s ease-out 1.0s forwards; }
  .sp-node-fill--n1  { animation: spFillAppear 0.3s ease-out 0.9s forwards; }
  .sp-node-label--n1 { animation: spLabelReveal 0.4s ease-out 1.0s forwards; }

  /* Node 2: validate (pink) — grid intersection 400, 480 */
  .sp-node-ring--n2 {
    transform-origin: 400px 480px;
    animation: spNodeAppear 0.5s ease-out 1.7s forwards,
               spNodePulsePink 4.5s ease-in-out 5.6s infinite;
  }
  .sp-node-outer--n2 { animation: spOuterRingAppear 0.6s ease-out 1.9s forwards; }
  .sp-node-fill--n2  { animation: spFillAppear 0.3s ease-out 1.8s forwards; }
  .sp-node-label--n2 { animation: spLabelReveal 0.4s ease-out 2.0s forwards; }

  /* Node 3: detect (cyan) — grid intersection 640, 80 */
  .sp-node-ring--n3 {
    transform-origin: 640px 80px;
    animation: spNodeAppear 0.5s ease-out 2.3s forwards,
               spNodePulseCyan 4.2s ease-in-out 6.0s infinite;
  }
  .sp-node-outer--n3 { animation: spOuterRingAppear 0.6s ease-out 2.5s forwards; }
  .sp-node-fill--n3  { animation: spFillAppear 0.3s ease-out 2.4s forwards; }
  .sp-node-label--n3 { animation: spLabelReveal 0.4s ease-out 2.7s forwards; }

  /* Node 4: replay (pink) — grid intersection 920, 480 */
  .sp-node-ring--n4 {
    transform-origin: 920px 480px;
    animation: spNodeAppear 0.5s ease-out 3.0s forwards,
               spNodePulsePink 4.8s ease-in-out 5.1s infinite;
  }
  .sp-node-outer--n4 { animation: spOuterRingAppear 0.6s ease-out 3.2s forwards; }
  .sp-node-fill--n4  { animation: spFillAppear 0.3s ease-out 3.1s forwards; }
  .sp-node-label--n4 { animation: spLabelReveal 0.4s ease-out 3.4s forwards; }

  /* Node 5: curate (cyan, final) — grid intersection 960, 120 */
  .sp-node-ring--n5 {
    transform-origin: 960px 120px;
    animation: spNodeAppear 0.7s ease-out 3.4s forwards,
               spNodePulseFinal 3.5s ease-in-out 5.4s infinite;
  }
  .sp-node-outer--n5 { animation: spOuterRingAppear 0.8s ease-out 3.6s forwards; }
  .sp-node-fill--n5  { animation: spFillAppear 0.4s ease-out 3.5s forwards; }
  .sp-node-label--n5 { animation: spLabelReveal 0.5s ease-out 4.2s forwards; }

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
