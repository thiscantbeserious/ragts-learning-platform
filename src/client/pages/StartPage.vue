<script setup lang="ts">
/**
 * StartPage — the "home" view rendered in the main grid area when no session is selected.
 *
 * Shows a TRON-aesthetic animated SVG pipeline background (S-curve with 5 labeled nodes)
 * over a centered drop zone card with a Browse Files CTA.
 * Respects prefers-reduced-motion by disabling all CSS animations.
 * Upload flow is wired in Stage 10 — for now, CTA and drop zone open the file picker only.
 */
import { ref } from 'vue';

const fileInputRef = ref<HTMLInputElement | null>(null);

/** Opens the system file picker. Drop zone, Browse Files button, and keyboard trigger this. */
function openFilePicker(): void {
  fileInputRef.value?.click();
}

/** Reset the file input after selection (upload flow wired in Stage 10). */
function handleFileChange(): void {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

/** Keyboard handler for drop zone: Enter and Space open file picker. */
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
      class="start-page__file-input"
      tabindex="-1"
      aria-hidden="true"
      @change="handleFileChange"
    />

    <!-- SVG Pipeline Backdrop -->
    <svg
      class="start-page__pipeline"
      viewBox="0 0 1280 600"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern id="spTronGrid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="40" y2="0" stroke="#00d4ff" stroke-width="0.4" opacity="0.22" />
          <line x1="0" y1="0" x2="0" y2="40" stroke="#00d4ff" stroke-width="0.4" opacity="0.22" />
          <circle cx="0" cy="0" r="0.8" fill="#00d4ff" opacity="0.3" />
        </pattern>
      </defs>

      <!-- TRON fine grid -->
      <rect class="sp-grid-dots" width="100%" height="100%" fill="url(#spTronGrid)" />

      <!-- Decorative secondary paths -->
      <path class="sp-deco-path" d="M 100,90 C 180,70 240,110 320,90 S 460,50 560,85" stroke="#00d4ff" />
      <path class="sp-deco-path" d="M 700,470 C 780,450 840,490 920,470 S 1040,430 1140,460" stroke="#ff4d6a" />

      <!-- Main S-curve pipeline path: record -> validate -> detect -> replay -> curate -->
      <path
        class="sp-path-full"
        d="M 160,160 C 220,160 320,400 400,400 C 480,400 560,160 640,160 C 720,160 800,400 880,400 C 960,400 1040,160 1120,160"
      />

      <!-- Energy flow segment (loops along the path) -->
      <path
        class="sp-energy-flow"
        d="M 160,160 C 220,160 320,400 400,400 C 480,400 560,160 640,160 C 720,160 800,400 880,400 C 960,400 1040,160 1120,160"
      />

      <!-- Node 1: record (cyan) -->
      <g>
        <circle class="sp-node-fill sp-node-fill--cyan" cx="12.5%" cy="26.67%" r="6" />
        <circle class="sp-node-ring sp-node-ring--cyan sp-node-ring--n1" cx="12.5%" cy="26.67%" r="10" />
        <circle class="sp-node-outer sp-node-outer--n1" cx="12.5%" cy="26.67%" r="16" stroke="#00d4ff" stroke-dasharray="4 4" />
        <text class="sp-node-label sp-node-label--n1" x="12.5%" y="33.5%">record</text>
      </g>

      <!-- Node 2: validate (pink) -->
      <g>
        <circle class="sp-node-fill sp-node-fill--pink" cx="31.25%" cy="73.33%" r="6" />
        <circle class="sp-node-ring sp-node-ring--pink sp-node-ring--n2" cx="31.25%" cy="73.33%" r="10" />
        <circle class="sp-node-outer sp-node-outer--n2" cx="31.25%" cy="73.33%" r="16" stroke="#ff4d6a" stroke-dasharray="4 4" />
        <text class="sp-node-label sp-node-label--n2" x="31.25%" y="80.5%">validate</text>
      </g>

      <!-- Node 3: detect (cyan) -->
      <g>
        <circle class="sp-node-fill sp-node-fill--cyan" cx="50%" cy="26.67%" r="6" />
        <circle class="sp-node-ring sp-node-ring--cyan sp-node-ring--n3" cx="50%" cy="26.67%" r="10" />
        <circle class="sp-node-outer sp-node-outer--n3" cx="50%" cy="26.67%" r="16" stroke="#00d4ff" stroke-dasharray="4 4" />
        <text class="sp-node-label sp-node-label--n3" x="50%" y="33.5%">detect</text>
      </g>

      <!-- Node 4: replay (pink) -->
      <g>
        <circle class="sp-node-fill sp-node-fill--pink" cx="68.75%" cy="73.33%" r="6" />
        <circle class="sp-node-ring sp-node-ring--pink sp-node-ring--n4" cx="68.75%" cy="73.33%" r="10" />
        <circle class="sp-node-outer sp-node-outer--n4" cx="68.75%" cy="73.33%" r="16" stroke="#ff4d6a" stroke-dasharray="4 4" />
        <text class="sp-node-label sp-node-label--n4" x="68.75%" y="80.5%">replay</text>
      </g>

      <!-- Node 5: curate (cyan, final — stronger glow) -->
      <g>
        <circle class="sp-node-fill sp-node-fill--final" cx="87.5%" cy="26.67%" r="8" />
        <circle class="sp-node-ring sp-node-ring--final sp-node-ring--n5" cx="87.5%" cy="26.67%" r="13" />
        <circle class="sp-node-outer sp-node-outer--n5" cx="87.5%" cy="26.67%" r="20" stroke="#00d4ff" stroke-dasharray="5 5" />
        <text class="sp-node-label sp-node-label--n5" x="87.5%" y="34.5%">curate</text>
      </g>
    </svg>

    <!-- Ambient particles -->
    <div class="sp-particle sp-particle--1" aria-hidden="true" />
    <div class="sp-particle sp-particle--2" aria-hidden="true" />
    <div class="sp-particle sp-particle--3" aria-hidden="true" />
    <div class="sp-particle sp-particle--4" aria-hidden="true" />

    <!-- Content overlay (centered over SVG) -->
    <div class="start-page__content">
      <div
        class="start-page__drop-zone"
        role="button"
        tabindex="0"
        aria-label="Upload session files"
        aria-dropeffect="copy"
        @click="openFilePicker"
        @keydown="handleDropZoneKeydown"
      >
        <!-- Corner brackets (TRON targeting reticle) -->
        <span class="start-page__corner start-page__corner--tl" aria-hidden="true" />
        <span class="start-page__corner start-page__corner--tr" aria-hidden="true" />
        <span class="start-page__corner start-page__corner--bl" aria-hidden="true" />
        <span class="start-page__corner start-page__corner--br" aria-hidden="true" />

        <!-- Upload icon -->
        <div class="start-page__upload-icon" aria-hidden="true">
          <div class="start-page__disc-ring" />
          <svg
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            width="44"
            height="44"
          >
            <path d="M12 30v6h24v-6" />
            <path d="M24 10v18" />
            <path d="M16 18l8-8 8 8" />
          </svg>
        </div>

        <!-- Heading -->
        <h1 class="start-page__heading">Drop a .cast file to begin</h1>

        <!-- Subtitle -->
        <p class="start-page__subtitle">
          Browse your files or drag and drop a <code>.cast</code> recording
          — watch it unfold into something you can read.
        </p>

        <!-- CTA button -->
        <button
          type="button"
          class="start-page__cta btn btn--primary"
          @click.stop="openFilePicker"
        >
          Browse Files
        </button>
      </div>

      <!-- AGR hint -->
      <p class="start-page__hint">
        Recording sessions? Use
        <a
          href="https://github.com/thiscantbeserious/agent-session-recorder"
          target="_blank"
          rel="noopener noreferrer"
        >AGR</a>
        to capture them.
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
   SVG PIPELINE BACKDROP
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

/* Decorative secondary paths */
.sp-deco-path {
  fill: none;
  stroke-width: 0.5;
  stroke-dasharray: 3 8;
  opacity: 0;
  visibility: hidden;
}

/* Full pipeline path */
.sp-path-full {
  fill: none;
  stroke: #00d4ff;
  stroke-width: 1;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 6px rgba(0, 212, 255, 0.4))
          drop-shadow(0 0 14px rgba(0, 212, 255, 0.2));
  stroke-dasharray: 1470;
  stroke-dashoffset: 1470;
  opacity: 0;
  visibility: hidden;
}

/* Energy flow overlay (small bright segment looping the path) */
.sp-energy-flow {
  fill: none;
  stroke: #00d4ff;
  stroke-width: 2;
  stroke-linecap: round;
  filter: drop-shadow(0 0 8px rgba(0, 212, 255, 0.7))
          drop-shadow(0 0 20px rgba(0, 212, 255, 0.4));
  stroke-dasharray: 20 1450;
  stroke-dashoffset: 1470;
  opacity: 0;
  visibility: hidden;
}

/* Node rings */
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

/* Node outer dashed ring */
.sp-node-outer {
  fill: none;
  stroke-width: 0.5;
  opacity: 0;
}

/* Node fill dots */
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

/* Node labels */
.sp-node-label {
  font-family: var(--font-mono);
  font-size: 11px;
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
  bottom: 22%;
  left: 15%;
  width: 5px;
  height: 5px;
  background: #00d4ff;
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.4), 0 0 20px rgba(0, 212, 255, 0.18);
}

.sp-particle--4 {
  bottom: 30%;
  right: 25%;
  width: 4px;
  height: 4px;
  background: #00d4ff;
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.4), 0 0 16px rgba(0, 212, 255, 0.15);
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
  max-width: 480px;
  width: 100%;
}

/* ============================================================
   DROP ZONE CARD
   ============================================================ */

.start-page__drop-zone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-8);
  border-radius: var(--radius-lg);
  cursor: pointer;
  width: 100%;
  background: rgba(10, 10, 25, 0.79);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid rgba(0, 212, 255, 0.25);
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.6),
              0 0 8px rgba(0, 212, 255, 0.15),
              inset 0 0 8px rgba(0, 212, 255, 0.05);
  transition: transform var(--duration-normal) var(--easing-default),
              box-shadow var(--duration-normal) var(--easing-default),
              border-color var(--duration-normal) var(--easing-default);
}

.start-page__drop-zone:hover {
  transform: translateY(-2px);
  border-color: rgba(0, 212, 255, 0.4);
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.7),
              0 0 14px rgba(0, 212, 255, 0.25),
              inset 0 0 12px rgba(0, 212, 255, 0.08);
}

.start-page__drop-zone:focus-visible {
  outline: 1px solid var(--accent-primary);
  outline-offset: 4px;
}

/* ============================================================
   CORNER BRACKETS — TRON targeting reticle
   ============================================================ */

.start-page__corner {
  position: absolute;
  pointer-events: none;
}

.start-page__corner::before,
.start-page__corner::after {
  content: '';
  position: absolute;
  background: var(--accent-primary);
  opacity: 0.4;
  box-shadow: 0 0 6px var(--accent-primary-glow);
}

/* Horizontal bars: 18px x 1px */
.start-page__corner::before {
  width: 18px;
  height: 1px;
}

/* Vertical bars: 1px x 18px */
.start-page__corner::after {
  width: 1px;
  height: 18px;
}

.start-page__corner--tl { top: 6px; left: 6px; }
.start-page__corner--tl::before { top: 0; left: 0; }
.start-page__corner--tl::after  { top: 0; left: 0; }

.start-page__corner--tr { top: 6px; right: 6px; }
.start-page__corner--tr::before { top: 0; right: 0; }
.start-page__corner--tr::after  { top: 0; right: 0; }

.start-page__corner--bl { bottom: 6px; left: 6px; }
.start-page__corner--bl::before { bottom: 0; left: 0; }
.start-page__corner--bl::after  { bottom: 0; left: 0; }

.start-page__corner--br { bottom: 6px; right: 6px; }
.start-page__corner--br::before { bottom: 0; right: 0; }
.start-page__corner--br::after  { bottom: 0; right: 0; }

/* ============================================================
   UPLOAD ICON
   ============================================================ */

.start-page__upload-icon {
  position: relative;
  width: 44px;
  height: 44px;
  color: var(--accent-primary);
  filter: drop-shadow(0 0 8px var(--accent-primary-glow));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.start-page__disc-ring {
  position: absolute;
  border: 1px solid rgba(0, 212, 255, 0.15);
  border-radius: 50%;
  width: 72px;
  height: 72px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

/* ============================================================
   HEADING & SUBTITLE
   ============================================================ */

.start-page__heading {
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
  line-height: var(--lh-xl);
  position: relative;
  z-index: 2;
  margin: 0;
}

.start-page__subtitle {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--leading-normal);
  max-width: 360px;
  position: relative;
  z-index: 2;
  margin: 0;
}

.start-page__subtitle code {
  color: var(--accent-primary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--accent-primary-subtle);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}

/* ============================================================
   CTA BUTTON — reuses .btn .btn--primary from components.css
   Local overrides for letter-spacing and font
   ============================================================ */

.start-page__cta {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: var(--space-2) var(--space-6);
  position: relative;
  z-index: 2;
  cursor: pointer;
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

@keyframes spPathDraw {
  from { stroke-dashoffset: 1470; opacity: 1; visibility: visible; }
  to   { stroke-dashoffset: 0;    opacity: 1; visibility: visible; }
}

@keyframes spPathGlow {
  0%, 100% {
    filter: drop-shadow(0 0 6px rgba(0, 212, 255, 0.4))
            drop-shadow(0 0 14px rgba(0, 212, 255, 0.2));
    stroke-opacity: 1;
  }
  50% {
    filter: drop-shadow(0 0 3px rgba(0, 212, 255, 0.25))
            drop-shadow(0 0 8px rgba(0, 212, 255, 0.1));
    stroke-opacity: 0.6;
  }
}

@keyframes spEnergyFlow {
  from { stroke-dashoffset: 1470; }
  to   { stroke-dashoffset: 0; }
}

@keyframes spEnergyFadeIn {
  from { visibility: visible; opacity: 0; }
  to   { visibility: visible; opacity: 0.6; }
}

@keyframes spDecoFadeIn {
  from { visibility: visible; opacity: 0; }
  to   { visibility: visible; opacity: 0.07; }
}

@keyframes spNodeAppear {
  0%   { opacity: 0; transform: scale(0.4); }
  60%  { opacity: 1; transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes spOuterRingAppear {
  from { opacity: 0; transform: scale(0.6); }
  to   { opacity: 0.3; transform: scale(1); }
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
  0%, 100% { transform: scale(1);
             filter: drop-shadow(0 0 10px rgba(0, 212, 255, 0.4))
                     drop-shadow(0 0 20px rgba(0, 212, 255, 0.15)); }
  50%      { transform: scale(1.4);
             filter: drop-shadow(0 0 20px rgba(0, 212, 255, 0.7))
                     drop-shadow(0 0 40px rgba(0, 212, 255, 0.3)); }
}

@keyframes spIconBob {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-2px); }
}

@keyframes spParticleDrift1 {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.5; }
  25%  { transform: translate(25px, -35px) scale(1.3); opacity: 0.7; }
  50%  { transform: translate(-15px, -70px) scale(0.7); opacity: 0.4; }
  75%  { transform: translate(35px, -25px) scale(1.1); opacity: 0.6; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
}

@keyframes spParticleDrift2 {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.4; }
  25%  { transform: translate(-35px, 18px) scale(1.2); opacity: 0.6; }
  50%  { transform: translate(8px, 45px) scale(0.6); opacity: 0.35; }
  75%  { transform: translate(-25px, -8px) scale(1.4); opacity: 0.5; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.4; }
}

@keyframes spParticleDrift3 {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.5; }
  25%  { transform: translate(18px, 35px) scale(0.6); opacity: 0.4; }
  50%  { transform: translate(-35px, 8px) scale(1.2); opacity: 0.6; }
  75%  { transform: translate(25px, -18px) scale(1.4); opacity: 0.5; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
}

@keyframes spParticleDrift4 {
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
  .sp-deco-path { opacity: 0.06 !important; visibility: visible !important; }
  .sp-path-full {
    stroke-dashoffset: 0 !important;
    opacity: 1 !important;
    visibility: visible !important;
  }
  .sp-energy-flow { display: none !important; }
  .sp-node-ring { opacity: 1 !important; }
  .sp-node-outer { opacity: 0.3 !important; }
  .sp-node-fill { opacity: 1 !important; }
  .sp-node-label { opacity: 0.3 !important; }
  .sp-particle { display: none !important; }
  .start-page__upload-icon { animation: none !important; }
}

/* ============================================================
   MOTION-ALLOWED ANIMATIONS
   ============================================================ */

@media (prefers-reduced-motion: no-preference) {
  /* Grid fade in */
  .sp-grid-dots {
    animation: spGridFadeIn 1.5s ease-out 0.2s forwards;
  }

  /* Deco paths */
  .sp-deco-path {
    animation: spDecoFadeIn 1s ease-out 0.5s forwards;
  }

  /* Pipeline path draw then glow pulse */
  .sp-path-full {
    animation: spPathDraw 2.2s ease-out 0.8s forwards,
               spPathGlow 5s ease-in-out 5s infinite;
  }

  /* Energy flow loops after path draw */
  .sp-energy-flow {
    animation: spEnergyFadeIn 0.8s ease-out 3.5s forwards,
               spEnergyFlow 3.5s linear 3.5s infinite;
  }

  /* Node 1: record (cyan) */
  .sp-node-ring--n1 {
    transform-origin: 160px 160px;
    animation: spNodeAppear 0.5s ease-out 1.2s forwards,
               spNodePulseCyan 4s ease-in-out 5.5s infinite;
  }
  .sp-node-outer--n1 {
    transform-origin: 160px 160px;
    animation: spOuterRingAppear 0.6s ease-out 1.4s forwards;
  }
  .sp-node-fill--cyan:nth-of-type(1) { animation: spFillAppear 0.3s ease-out 1.3s forwards; }
  .sp-node-label--n1 { animation: spLabelReveal 0.4s ease-out 1.5s forwards; }

  /* Node 2: validate (pink) */
  .sp-node-ring--n2 {
    transform-origin: 400px 440px;
    animation: spNodeAppear 0.5s ease-out 1.9s forwards,
               spNodePulsePink 4.5s ease-in-out 6s infinite;
  }
  .sp-node-outer--n2 {
    transform-origin: 400px 440px;
    animation: spOuterRingAppear 0.6s ease-out 2.1s forwards;
  }
  .sp-node-label--n2 { animation: spLabelReveal 0.4s ease-out 2.2s forwards; }

  /* Node 3: detect (cyan) */
  .sp-node-ring--n3 {
    transform-origin: 640px 160px;
    animation: spNodeAppear 0.5s ease-out 2.5s forwards,
               spNodePulseCyan 4.2s ease-in-out 6.2s infinite;
  }
  .sp-node-outer--n3 {
    transform-origin: 640px 160px;
    animation: spOuterRingAppear 0.6s ease-out 2.7s forwards;
  }
  .sp-node-label--n3 { animation: spLabelReveal 0.4s ease-out 2.9s forwards; }

  /* Node 4: replay (pink) */
  .sp-node-ring--n4 {
    transform-origin: 880px 440px;
    animation: spNodeAppear 0.5s ease-out 3.1s forwards,
               spNodePulsePink 4.8s ease-in-out 5.5s infinite;
  }
  .sp-node-outer--n4 {
    transform-origin: 880px 440px;
    animation: spOuterRingAppear 0.6s ease-out 3.3s forwards;
  }
  .sp-node-label--n4 { animation: spLabelReveal 0.4s ease-out 3.5s forwards; }

  /* Node 5: curate (cyan, final) */
  .sp-node-ring--n5 {
    transform-origin: 1120px 160px;
    animation: spNodeAppear 0.7s ease-out 3.6s forwards,
               spNodePulseFinal 3.5s ease-in-out 5.8s infinite;
  }
  .sp-node-outer--n5 {
    transform-origin: 1120px 160px;
    animation: spOuterRingAppear 0.8s ease-out 3.8s forwards;
  }
  .sp-node-label--n5 { animation: spLabelReveal 0.5s ease-out 4.2s forwards; }

  /* Upload icon gentle bob */
  .start-page__upload-icon {
    animation: spIconBob 4s ease-in-out 3s infinite;
  }

  /* Ambient particles */
  .sp-particle--1 { animation: spParticleDrift1 12s ease-in-out -3s infinite; }
  .sp-particle--2 { animation: spParticleDrift2 15s ease-in-out -7s infinite; }
  .sp-particle--3 { animation: spParticleDrift3 16s ease-in-out -9s infinite; }
  .sp-particle--4 { animation: spParticleDrift4 17s ease-in-out -11s infinite; }
}
</style>
