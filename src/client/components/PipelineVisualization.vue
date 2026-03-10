<script setup lang="ts">
/**
 * Renders the CSS-only TRON pipeline visualization backdrop: 5 pipeline nodes,
 * 4 decorative Bezier paths, 6 anchor dots, and a giant blinking cursor prompt.
 * All animation is CSS-only — no JavaScript animation.
 * Respects prefers-reduced-motion: shows all elements at final state without animation.
 */
</script>

<!-- Copied from design/drafts/theme-tron-v1.html lines 1291-1423 (HTML), 274-360 (base CSS),
     628-648 (cursor CSS), 712-736 (nodeAppear/labelFade keyframes),
     782-811 (pulse keyframes), 880-900 (cursor/anchor keyframes),
     944-1053 (per-node staggered animations), 1202-1208 (cursor animation),
     910-931 (reduced-motion), 1214-1264 (mobile responsive) -->
<template>
  <!-- aria-hidden: purely decorative backdrop, pointer-events: none -->
  <svg
    class="landing-empty__pipeline"
    viewBox="0 0 1280 600"
    preserveAspectRatio="xMidYMid slice"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible;"
  >
    <!-- Decorative secondary paths — subtle geometric background lines
         BUG FIX 1: Start with opacity: 0, visibility: hidden in CSS -->
    <!-- Copied from design/drafts/theme-tron-v1.html lines 1312-1319 -->
    <path
      class="landing-empty__deco-path"
      d="M 100,90 C 180,70 240,110 320,90 S 460,50 560,85"
      stroke="#00d4ff"
      data-target-opacity="0.07"
    />
    <path
      class="landing-empty__deco-path"
      d="M 700,470 C 780,450 840,490 920,470 S 1040,430 1140,460"
      stroke="#ff4d6a"
      data-target-opacity="0.05"
    />
    <path
      class="landing-empty__deco-path"
      d="M 240,480 C 300,460 350,500 430,475"
      stroke="#00d4ff"
      data-target-opacity="0.04"
    />
    <path
      class="landing-empty__deco-path"
      d="M 960,90 C 1020,75 1080,105 1160,85"
      stroke="#ff4d6a"
      data-target-opacity="0.04"
    />

    <!-- Decorative anchor dots — BUG FIX 1: start hidden via CSS -->
    <!-- Copied from design/drafts/theme-tron-v1.html lines 1322-1327 -->
    <circle
      class="landing-empty__anchor-dot"
      cx="100"
      cy="90"
      r="1"
      stroke="#00d4ff"
      data-target-opacity="0.08"
    />
    <circle
      class="landing-empty__anchor-dot"
      cx="320"
      cy="90"
      r="1"
      stroke="#00d4ff"
      data-target-opacity="0.08"
    />
    <circle
      class="landing-empty__anchor-dot"
      cx="560"
      cy="85"
      r="1"
      stroke="#00d4ff"
      data-target-opacity="0.08"
    />
    <circle
      class="landing-empty__anchor-dot"
      cx="700"
      cy="470"
      r="1"
      stroke="#ff4d6a"
      data-target-opacity="0.06"
    />
    <circle
      class="landing-empty__anchor-dot"
      cx="920"
      cy="470"
      r="1"
      stroke="#ff4d6a"
      data-target-opacity="0.06"
    />
    <circle
      class="landing-empty__anchor-dot"
      cx="1140"
      cy="460"
      r="1"
      stroke="#ff4d6a"
      data-target-opacity="0.06"
    />

    <!-- PIPELINE NODES — 5 stages, TRON identity disc style -->
    <!-- Copied from design/drafts/theme-tron-v1.html lines 1349-1407 -->

    <!-- Node 1: record (cyan) -->
    <g>
      <circle
        class="landing-empty__node-fill landing-empty__node-fill--cyan landing-empty__node-fill--n1"
        cx="12.5%"
        cy="13.33%"
        r="6"
      />
      <circle
        class="landing-empty__node-ring landing-empty__node-ring--cyan landing-empty__node-ring--n1"
        cx="12.5%"
        cy="13.33%"
        r="10"
      />
      <circle
        class="landing-empty__node-outer-ring landing-empty__node-outer-ring--n1"
        cx="12.5%"
        cy="13.33%"
        r="16"
        stroke="#00d4ff"
        stroke-dasharray="4 4"
      />
      <text
        class="landing-empty__node-label landing-empty__node-label--n1"
        x="12.5%"
        y="19.67%"
      >record</text>
    </g>

    <!-- Node 2: validate (pink) -->
    <g>
      <circle
        class="landing-empty__node-fill landing-empty__node-fill--pink landing-empty__node-fill--n2"
        cx="31.25%"
        cy="86.67%"
        r="6"
      />
      <circle
        class="landing-empty__node-ring landing-empty__node-ring--pink landing-empty__node-ring--n2"
        cx="31.25%"
        cy="86.67%"
        r="10"
      />
      <circle
        class="landing-empty__node-outer-ring landing-empty__node-outer-ring--n2"
        cx="31.25%"
        cy="86.67%"
        r="16"
        stroke="#ff4d6a"
        stroke-dasharray="4 4"
      />
      <text
        class="landing-empty__node-label landing-empty__node-label--n2"
        x="31.25%"
        y="93%"
      >validate</text>
    </g>

    <!-- Node 3: detect (cyan) -->
    <g>
      <circle
        class="landing-empty__node-fill landing-empty__node-fill--cyan landing-empty__node-fill--n3"
        cx="50%"
        cy="13.33%"
        r="6"
      />
      <circle
        class="landing-empty__node-ring landing-empty__node-ring--cyan landing-empty__node-ring--n3"
        cx="50%"
        cy="13.33%"
        r="10"
      />
      <circle
        class="landing-empty__node-outer-ring landing-empty__node-outer-ring--n3"
        cx="50%"
        cy="13.33%"
        r="16"
        stroke="#00d4ff"
        stroke-dasharray="4 4"
      />
      <text
        class="landing-empty__node-label landing-empty__node-label--n3"
        x="50%"
        y="19.67%"
      >detect</text>
    </g>

    <!-- Node 4: replay (pink) -->
    <g>
      <circle
        class="landing-empty__node-fill landing-empty__node-fill--pink landing-empty__node-fill--n4"
        cx="68.75%"
        cy="86.67%"
        r="6"
      />
      <circle
        class="landing-empty__node-ring landing-empty__node-ring--pink landing-empty__node-ring--n4"
        cx="68.75%"
        cy="86.67%"
        r="10"
      />
      <circle
        class="landing-empty__node-outer-ring landing-empty__node-outer-ring--n4"
        cx="68.75%"
        cy="86.67%"
        r="16"
        stroke="#ff4d6a"
        stroke-dasharray="4 4"
      />
      <text
        class="landing-empty__node-label landing-empty__node-label--n4"
        x="68.75%"
        y="93%"
      >replay</text>
    </g>

    <!-- Node 5: curate (cyan, final — stronger glow) -->
    <g>
      <circle
        class="landing-empty__node-fill landing-empty__node-fill--final landing-empty__node-fill--n5"
        cx="87.5%"
        cy="13.33%"
        r="8"
      />
      <circle
        class="landing-empty__node-ring landing-empty__node-ring--final landing-empty__node-ring--n5"
        cx="87.5%"
        cy="13.33%"
        r="13"
      />
      <circle
        class="landing-empty__node-outer-ring landing-empty__node-outer-ring--n5"
        cx="87.5%"
        cy="13.33%"
        r="20"
        stroke="#00d4ff"
        stroke-dasharray="5 5"
      />
      <text
        class="landing-empty__node-label landing-empty__node-label--n5"
        x="87.5%"
        y="20.33%"
      >curate</text>
    </g>
  </svg>

  <!-- Blinking terminal cursor — decorative giant >_ prompt -->
  <!-- Copied from design/drafts/theme-tron-v1.html lines 1421-1423 -->
  <div
    class="landing-empty__cursor-prompt"
    aria-hidden="true"
  >
    <span class="landing-empty__cursor-chevron">&gt;</span><span class="landing-empty__cursor-blink">_</span>
  </div>
</template>

<style scoped>
/* ================================================================
   PIPELINE SVG — absolutely positioned backdrop
   Copied from design/drafts/theme-tron-v1.html implied by .landing-empty__pipeline usage
   ================================================================ */

/* ================================================================
   DECO PATHS AND ANCHOR DOTS
   Copied from design/drafts/theme-tron-v1.html lines 274-282
   ================================================================ */

/* Decorative secondary paths — subtle background grid lines */
.landing-empty__deco-path {
  fill: none;
  stroke-width: 0.5;
  stroke-dasharray: 3 8;
  /* BUG FIX 1: deco paths also start hidden */
  opacity: 0;
  visibility: hidden;
}

/* ================================================================
   PIPELINE NODES — geometric rings (TRON identity disc style)
   Copied from design/drafts/theme-tron-v1.html lines 285-360
   ================================================================ */

.landing-empty__node-ring {
  fill: none;
  stroke-width: 1;
  opacity: 0;
}

.landing-empty__node-ring--cyan {
  stroke: var(--accent-primary);
  /* FIX 3: Brighter node glows */
  filter: drop-shadow(0 0 8px var(--accent-primary-glow))
          drop-shadow(0 0 16px rgba(0, 212, 255, 0.2));
}

.landing-empty__node-ring--pink {
  stroke: var(--accent-secondary);
  /* FIX 3: Brighter node glows */
  filter: drop-shadow(0 0 8px var(--accent-secondary-glow))
          drop-shadow(0 0 16px rgba(255, 77, 106, 0.2));
}

.landing-empty__node-ring--final {
  stroke: var(--accent-primary);
  stroke-width: 1.5;
  /* FIX 3: Much brighter final node */
  filter: drop-shadow(0 0 14px var(--accent-primary-glow))
          drop-shadow(0 0 30px rgba(0, 212, 255, 0.25));
}

/* Outer geometric ring — TRON identity disc */
.landing-empty__node-outer-ring {
  fill: none;
  stroke-width: 0.5;
  opacity: 0;
}

/* Inner fill dot */
.landing-empty__node-fill {
  opacity: 0;
}

.landing-empty__node-fill--cyan {
  fill: rgba(0, 212, 255, 0.15);
  filter: drop-shadow(0 0 20px rgba(0, 0, 0, 0.8))
          drop-shadow(0 0 40px rgba(0, 0, 0, 0.5));
}

.landing-empty__node-fill--pink {
  fill: rgba(255, 77, 106, 0.12);
  filter: drop-shadow(0 0 20px rgba(0, 0, 0, 0.8))
          drop-shadow(0 0 40px rgba(0, 0, 0, 0.5));
}

.landing-empty__node-fill--final {
  fill: rgba(0, 212, 255, 0.25);
  filter: drop-shadow(0 0 25px rgba(0, 0, 0, 0.8))
          drop-shadow(0 0 50px rgba(0, 0, 0, 0.5));
}

/* Node labels — wide letter-spacing, very TRON */
.landing-empty__node-label {
  font-family: var(--font-mono);
  font-size: 14px;
  letter-spacing: 0.2em;
  fill: var(--text-muted);
  text-anchor: middle;
  text-transform: uppercase;
  opacity: 0;
}

/* Decorative anchor dots — start hidden */
.landing-empty__anchor-dot {
  fill: none;
  stroke-width: 0.5;
  opacity: 0;
  visibility: hidden;
}

/* ================================================================
   BLINKING TERMINAL CURSOR — lower-left
   FIX 3: Brighter cursor with text-shadow glow
   Copied from design/drafts/theme-tron-v1.html lines 628-648
   ================================================================ */

.landing-empty__cursor-prompt {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: -1;
  font-family: var(--font-body);
  font-size: 35rem;
  font-weight: 800;
  color: #355998;
  opacity: 1;
  user-select: none;
  pointer-events: none;
  text-shadow: 0px 0px 20px rgba(0, 0, 0, 0.69);
}

/* ================================================================
   KEYFRAMES
   Copied from design/drafts/theme-tron-v1.html lines 712-736 (nodeAppear/outerRing/fill/label),
   782-811 (pulse keyframes), 880-900 (cursor/anchor keyframes)
   ================================================================ */

/* Deco paths fade in */
@keyframes decoFadeIn {
  from { visibility: visible; opacity: 0; }
  to   { visibility: visible; }
}

@keyframes nodeAppear {
  0%   { opacity: 0; transform: scale(0.4); }
  60%  { opacity: 1; transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes outerRingAppear {
  0%   { opacity: 0; transform: scale(0.6); }
  100% { opacity: 0.3; transform: scale(1); }
}

@keyframes fillAppear {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes labelReveal {
  from { opacity: 0; }
  to   { opacity: 0.3; }
}

/* FIX 3: Node glow pulses — brighter TRON steady hum */
@keyframes nodePulseCyan {
  0%, 100% { transform: scale(1);
             filter: drop-shadow(0 0 6px rgba(0, 212, 255, 0.35))
                     drop-shadow(0 0 14px rgba(0, 212, 255, 0.15)); }
  50%      { transform: scale(1.3);
             filter: drop-shadow(0 0 14px rgba(0, 212, 255, 0.65))
                     drop-shadow(0 0 28px rgba(0, 212, 255, 0.25)); }
}

@keyframes nodePulsePink {
  0%, 100% { transform: scale(1);
             filter: drop-shadow(0 0 6px rgba(255, 77, 106, 0.35))
                     drop-shadow(0 0 14px rgba(255, 77, 106, 0.15)); }
  50%      { transform: scale(1.3);
             filter: drop-shadow(0 0 14px rgba(255, 77, 106, 0.65))
                     drop-shadow(0 0 28px rgba(255, 77, 106, 0.25)); }
}

@keyframes nodePulseFinal {
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

/* Blinking cursor — classic step blink */
@keyframes cursorBlink {
  0%, 49.9% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

@keyframes cursorFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Anchor dots fade in */
@keyframes anchorFadeIn {
  from { visibility: visible; opacity: 0; }
  to   { visibility: visible; }
}

@keyframes pathGlow {
  0%, 100% { opacity: 1; }
  50% {
    filter: drop-shadow(0 0 3px rgba(0, 212, 255, 0.25))
            drop-shadow(0 0 8px rgba(0, 212, 255, 0.1));
    stroke-opacity: 0.6;
  }
}

/* ================================================================
   REDUCED MOTION — show everything in final state, no animation
   Copied from design/drafts/theme-tron-v1.html lines 910-931
   ================================================================ */

@media (prefers-reduced-motion: reduce) {
  .landing-empty__node-ring { opacity: 1 !important; }
  .landing-empty__node-outer-ring { opacity: 0.3 !important; }
  .landing-empty__node-fill { opacity: 1 !important; }
  .landing-empty__node-label { opacity: 0.3 !important; }
  .landing-empty__cursor-prompt { opacity: 1 !important; }
  .landing-empty__cursor-blink { opacity: 0.6 !important; }
  .landing-empty__deco-path { opacity: 0.06 !important; visibility: visible !important; }
  .landing-empty__anchor-dot { opacity: 0.08 !important; visibility: visible !important; }
}

/* ================================================================
   MOTION-ALLOWED ANIMATIONS
   Copied from design/drafts/theme-tron-v1.html lines 944-1053, 1202-1208
   ================================================================ */

@media (prefers-reduced-motion: no-preference) {
  /* 1b. Deco paths and anchor dots fade in early */
  .landing-empty__deco-path {
    animation: decoFadeIn 1s ease-out 0.3s forwards;
  }
  .landing-empty__anchor-dot {
    animation: anchorFadeIn 1s ease-out 0.3s forwards;
  }

  /* Node 1: record (cyan) */
  .landing-empty__node-ring--n1 {
    transform-origin: 160px 80px;
    animation: nodeAppear 0.5s ease-out 0.8s forwards,
               nodePulseCyan 4s ease-in-out 5.0s infinite;
  }
  .landing-empty__node-outer-ring--n1 {
    transform-origin: 160px 80px;
    animation: outerRingAppear 0.6s ease-out 1.0s forwards;
  }
  .landing-empty__node-fill--n1 {
    animation: fillAppear 0.3s ease-out 0.9s forwards;
  }
  .landing-empty__node-label--n1 {
    animation: labelReveal 0.4s ease-out 1.0s forwards;
  }

  /* Node 2: validate (pink) */
  .landing-empty__node-ring--n2 {
    transform-origin: 400px 520px;
    animation: nodeAppear 0.5s ease-out 1.7s forwards,
               nodePulsePink 4.5s ease-in-out 5.6s infinite;
  }
  .landing-empty__node-outer-ring--n2 {
    transform-origin: 400px 520px;
    animation: outerRingAppear 0.6s ease-out 1.9s forwards;
  }
  .landing-empty__node-fill--n2 {
    animation: fillAppear 0.3s ease-out 1.8s forwards;
  }
  .landing-empty__node-label--n2 {
    animation: labelReveal 0.4s ease-out 2.0s forwards;
  }

  /* Node 3: detect (cyan) */
  .landing-empty__node-ring--n3 {
    transform-origin: 640px 80px;
    animation: nodeAppear 0.5s ease-out 2.3s forwards,
               nodePulseCyan 4.2s ease-in-out 6.0s infinite;
  }
  .landing-empty__node-outer-ring--n3 {
    transform-origin: 640px 80px;
    animation: outerRingAppear 0.6s ease-out 2.5s forwards;
  }
  .landing-empty__node-fill--n3 {
    animation: fillAppear 0.3s ease-out 2.4s forwards;
  }
  .landing-empty__node-label--n3 {
    animation: labelReveal 0.4s ease-out 2.7s forwards;
  }

  /* Node 4: replay (pink) */
  .landing-empty__node-ring--n4 {
    transform-origin: 880px 520px;
    animation: nodeAppear 0.5s ease-out 3.0s forwards,
               nodePulsePink 4.8s ease-in-out 5.1s infinite;
  }
  .landing-empty__node-outer-ring--n4 {
    transform-origin: 880px 520px;
    animation: outerRingAppear 0.6s ease-out 3.2s forwards;
  }
  .landing-empty__node-fill--n4 {
    animation: fillAppear 0.3s ease-out 3.1s forwards;
  }
  .landing-empty__node-label--n4 {
    animation: labelReveal 0.4s ease-out 3.4s forwards;
  }

  /* Node 5: curate (cyan, final — stronger glow) */
  .landing-empty__node-ring--n5 {
    transform-origin: 1120px 80px;
    animation: nodeAppear 0.7s ease-out 3.4s forwards,
               nodePulseFinal 3.5s ease-in-out 5.4s infinite;
  }
  .landing-empty__node-outer-ring--n5 {
    transform-origin: 1120px 80px;
    animation: outerRingAppear 0.8s ease-out 3.6s forwards;
  }
  .landing-empty__node-fill--n5 {
    animation: fillAppear 0.4s ease-out 3.5s forwards;
  }
  .landing-empty__node-label--n5 {
    animation: labelReveal 0.5s ease-out 4.2s forwards;
  }

  /* 6. Blinking terminal cursor */
  .landing-empty__cursor-prompt {
    animation: cursorFadeIn 0.6s ease-out 0s forwards;
  }

  .landing-empty__cursor-blink {
    animation: cursorBlink 1s step-end 0s infinite;
  }
}

/* ================================================================
   RESPONSIVE — Mobile
   Copied from design/drafts/theme-tron-v1.html lines 1233-1259
   ================================================================ */

@media (max-width: 767px) {
  .landing-empty__pipeline {
    opacity: 0.3;
    top: -10%;
    left: -20%;
    width: 140%;
    height: 120%;
  }

  .landing-empty__node-label {
    font-size: 24px;
  }

  .landing-empty__cursor-prompt {
    font-size: 14rem;
  }
}
</style>
