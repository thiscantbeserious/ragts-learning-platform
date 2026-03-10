/**
 * Unit tests for PipelineVisualization component.
 * Verifies SVG structure, node groups, deco paths, anchor dots,
 * and cursor prompt element. All CSS-only animations — no JS animation tests.
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PipelineVisualization from './PipelineVisualization.vue';

function mountPipeline() {
  return mount(PipelineVisualization);
}

describe('PipelineVisualization — smoke render', () => {
  it('mounts without error', () => {
    expect(() => mountPipeline()).not.toThrow();
  });

  it('renders an SVG element', () => {
    const wrapper = mountPipeline();
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('SVG has aria-hidden="true"', () => {
    const wrapper = mountPipeline();
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true');
  });

  it('SVG has class "landing-empty__pipeline"', () => {
    const wrapper = mountPipeline();
    expect(wrapper.find('svg').classes()).toContain('landing-empty__pipeline');
  });

  it('SVG has viewBox="0 0 1280 600"', () => {
    const wrapper = mountPipeline();
    expect(wrapper.find('svg').attributes('viewBox')).toBe('0 0 1280 600');
  });

  it('SVG has preserveAspectRatio="xMidYMid slice"', () => {
    const wrapper = mountPipeline();
    expect(wrapper.find('svg').attributes('preserveAspectRatio')).toBe('xMidYMid slice');
  });
});

describe('PipelineVisualization — pipeline nodes', () => {
  it('renders exactly 5 node groups (g elements with node-fill)', () => {
    const wrapper = mountPipeline();
    // Each node group has a node-fill circle
    const nodeFills = wrapper.findAll('.landing-empty__node-fill');
    expect(nodeFills).toHaveLength(5);
  });

  it('renders 5 node ring circles', () => {
    const wrapper = mountPipeline();
    const nodeRings = wrapper.findAll('.landing-empty__node-ring');
    expect(nodeRings).toHaveLength(5);
  });

  it('renders 5 outer ring circles', () => {
    const wrapper = mountPipeline();
    const outerRings = wrapper.findAll('.landing-empty__node-outer-ring');
    expect(outerRings).toHaveLength(5);
  });

  it('renders 5 node label text elements', () => {
    const wrapper = mountPipeline();
    const labels = wrapper.findAll('.landing-empty__node-label');
    expect(labels).toHaveLength(5);
  });

  it('node labels contain the expected decorative text values', () => {
    const wrapper = mountPipeline();
    const labels = wrapper.findAll('.landing-empty__node-label');
    const labelTexts = labels.map((l) => l.text());
    expect(labelTexts).toContain('record');
    expect(labelTexts).toContain('validate');
    expect(labelTexts).toContain('detect');
    expect(labelTexts).toContain('replay');
    expect(labelTexts).toContain('curate');
  });

  it('nodes 1, 3, 5 (odd) use cyan color class', () => {
    const wrapper = mountPipeline();
    expect(wrapper.find('.landing-empty__node-ring--n1').classes()).toContain('landing-empty__node-ring--cyan');
    expect(wrapper.find('.landing-empty__node-ring--n3').classes()).toContain('landing-empty__node-ring--cyan');
  });

  it('node 5 uses final class for stronger glow', () => {
    const wrapper = mountPipeline();
    expect(wrapper.find('.landing-empty__node-ring--n5').classes()).toContain('landing-empty__node-ring--final');
  });

  it('nodes 2 and 4 use pink color class', () => {
    const wrapper = mountPipeline();
    expect(wrapper.find('.landing-empty__node-ring--n2').classes()).toContain('landing-empty__node-ring--pink');
    expect(wrapper.find('.landing-empty__node-ring--n4').classes()).toContain('landing-empty__node-ring--pink');
  });
});

describe('PipelineVisualization — deco paths', () => {
  it('renders exactly 4 deco paths', () => {
    const wrapper = mountPipeline();
    const decoPaths = wrapper.findAll('.landing-empty__deco-path');
    expect(decoPaths).toHaveLength(4);
  });

  it('first deco path has cyan stroke', () => {
    const wrapper = mountPipeline();
    const paths = wrapper.findAll('.landing-empty__deco-path');
    expect(paths[0]?.attributes('stroke')).toBe('#00d4ff');
  });

  it('second deco path has pink stroke', () => {
    const wrapper = mountPipeline();
    const paths = wrapper.findAll('.landing-empty__deco-path');
    expect(paths[1]?.attributes('stroke')).toBe('#ff4d6a');
  });
});

describe('PipelineVisualization — anchor dots', () => {
  it('renders exactly 6 anchor dots', () => {
    const wrapper = mountPipeline();
    const anchorDots = wrapper.findAll('.landing-empty__anchor-dot');
    expect(anchorDots).toHaveLength(6);
  });
});

describe('PipelineVisualization — cursor prompt', () => {
  it('renders the cursor-prompt element', () => {
    const wrapper = mountPipeline();
    expect(wrapper.find('.landing-empty__cursor-prompt').exists()).toBe(true);
  });

  it('cursor-prompt has aria-hidden="true"', () => {
    const wrapper = mountPipeline();
    expect(wrapper.find('.landing-empty__cursor-prompt').attributes('aria-hidden')).toBe('true');
  });

  it('cursor-prompt contains chevron and blink spans', () => {
    const wrapper = mountPipeline();
    expect(wrapper.find('.landing-empty__cursor-chevron').exists()).toBe(true);
    expect(wrapper.find('.landing-empty__cursor-blink').exists()).toBe(true);
  });
});

describe('PipelineVisualization — pipeline path', () => {
  it('renders the full pipeline path segment', () => {
    const wrapper = mountPipeline();
    expect(wrapper.find('.landing-empty__path-segment--full').exists()).toBe(true);
  });
});
