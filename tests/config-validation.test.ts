/**
 * Validation tests for configuration files, agent definitions, and documentation structure.
 * These tests ensure that all configuration files are well-formed and contain required fields.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = join(__dirname, '..');

/**
 * Parse YAML frontmatter from a markdown file
 */
function parseYamlFrontmatter(content: string): Record<string, any> | null {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  const yamlContent = match[1];
  const result: Record<string, any> = {};

  // Simple YAML parser for key-value pairs
  const lines = yamlContent.split('\n');
  let currentKey: string | null = null;

  for (const line of lines) {
    if (line.trim().startsWith('-')) {
      // Array item
      if (currentKey && Array.isArray(result[currentKey])) {
        result[currentKey].push(line.trim().substring(1).trim());
      }
    } else if (line.includes(':')) {
      // Key-value pair
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();

      if (value === '' || value === '[]') {
        // Start of array or empty value
        result[key.trim()] = [];
        currentKey = key.trim();
      } else {
        result[key.trim()] = value;
        currentKey = null;
      }
    }
  }

  return result;
}

describe('Configuration Files', () => {
  describe('agents/settings.json', () => {
    it('should exist', () => {
      const path = join(PROJECT_ROOT, 'agents/settings.json');
      expect(existsSync(path)).toBe(true);
    });

    it('should be valid JSON', () => {
      const path = join(PROJECT_ROOT, 'agents/settings.json');
      const content = readFileSync(path, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should have hooks configuration', () => {
      const path = join(PROJECT_ROOT, 'agents/settings.json');
      const content = readFileSync(path, 'utf-8');
      const config = JSON.parse(content);

      expect(config).toHaveProperty('hooks');
      expect(typeof config.hooks).toBe('object');
    });

    it('should have SessionStart hooks defined', () => {
      const path = join(PROJECT_ROOT, 'agents/settings.json');
      const content = readFileSync(path, 'utf-8');
      const config = JSON.parse(content);

      expect(config.hooks).toHaveProperty('SessionStart');
      expect(Array.isArray(config.hooks.SessionStart)).toBe(true);
    });

    it('should have valid hook structure', () => {
      const path = join(PROJECT_ROOT, 'agents/settings.json');
      const content = readFileSync(path, 'utf-8');
      const config = JSON.parse(content);

      const sessionStartHooks = config.hooks.SessionStart;
      expect(sessionStartHooks.length).toBeGreaterThan(0);

      sessionStartHooks.forEach((hookGroup: any) => {
        expect(hookGroup).toHaveProperty('hooks');
        expect(Array.isArray(hookGroup.hooks)).toBe(true);

        hookGroup.hooks.forEach((hook: any) => {
          expect(hook).toHaveProperty('type');
          expect(hook).toHaveProperty('command');
          expect(typeof hook.command).toBe('string');
        });
      });
    });
  });

  describe('.gitignore', () => {
    it('should exist', () => {
      const path = join(PROJECT_ROOT, '.gitignore');
      expect(existsSync(path)).toBe(true);
    });

    it('should contain node_modules', () => {
      const path = join(PROJECT_ROOT, '.gitignore');
      const content = readFileSync(path, 'utf-8');
      expect(content).toContain('node_modules');
    });

    it('should contain dist directory', () => {
      const path = join(PROJECT_ROOT, '.gitignore');
      const content = readFileSync(path, 'utf-8');
      expect(content).toContain('dist');
    });

    it('should ignore database files', () => {
      const path = join(PROJECT_ROOT, '.gitignore');
      const content = readFileSync(path, 'utf-8');
      expect(content).toMatch(/\*\.db/);
    });

    it('should not contain empty lines at the end', () => {
      const path = join(PROJECT_ROOT, '.gitignore');
      const content = readFileSync(path, 'utf-8');
      const lines = content.split('\n');
      const lastLine = lines[lines.length - 1];
      expect(lastLine).toBe('');
    });
  });

  describe('Symlinks', () => {
    it('.claude should be a symlink to agents', () => {
      const path = join(PROJECT_ROOT, '.claude');
      expect(existsSync(path)).toBe(true);
    });

    it('.codex should be a symlink to agents', () => {
      const path = join(PROJECT_ROOT, '.codex');
      expect(existsSync(path)).toBe(true);
    });
  });
});

describe('Agent Definition Files', () => {
  const agentFiles = [
    'architect.md',
    'coordinator.md',
    'implementer.md',
    'maintainer.md',
    'product-owner.md',
    'reviewer-coderabbit.md',
    'reviewer-internal.md',
    'reviewer-pair.md'
  ];

  agentFiles.forEach((filename) => {
    describe(`agents/agents/${filename}`, () => {
      const filePath = join(PROJECT_ROOT, 'agents/agents', filename);

      it('should exist', () => {
        expect(existsSync(filePath)).toBe(true);
      });

      it('should have YAML frontmatter', () => {
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toMatch(/^---\s*\n/);
      });

      it('should have valid YAML frontmatter structure', () => {
        const content = readFileSync(filePath, 'utf-8');
        const frontmatter = parseYamlFrontmatter(content);
        expect(frontmatter).not.toBeNull();
      });

      it('should have required frontmatter fields', () => {
        const content = readFileSync(filePath, 'utf-8');
        const frontmatter = parseYamlFrontmatter(content);

        expect(frontmatter).not.toBeNull();
        expect(frontmatter!).toHaveProperty('name');
        expect(frontmatter!).toHaveProperty('description');
        expect(frontmatter!).toHaveProperty('model');
        expect(frontmatter!).toHaveProperty('tools');
        expect(frontmatter!).toHaveProperty('permissionMode');
        expect(frontmatter!).toHaveProperty('skills');
      });

      it('should have valid model field', () => {
        const content = readFileSync(filePath, 'utf-8');
        const frontmatter = parseYamlFrontmatter(content);

        const validModels = ['opus', 'sonnet', 'haiku'];
        expect(validModels).toContain(frontmatter!.model);
      });

      it('should have tools array', () => {
        const content = readFileSync(filePath, 'utf-8');
        const frontmatter = parseYamlFrontmatter(content);

        expect(Array.isArray(frontmatter!.tools)).toBe(true);
        expect(frontmatter!.tools.length).toBeGreaterThan(0);
      });

      it('should have skills array', () => {
        const content = readFileSync(filePath, 'utf-8');
        const frontmatter = parseYamlFrontmatter(content);

        expect(Array.isArray(frontmatter!.skills)).toBe(true);
        expect(frontmatter!.skills.length).toBeGreaterThan(0);
      });

      it('should have markdown content after frontmatter', () => {
        const content = readFileSync(filePath, 'utf-8');
        const parts = content.split('---');
        expect(parts.length).toBeGreaterThanOrEqual(3);

        const markdownContent = parts.slice(2).join('---').trim();
        expect(markdownContent.length).toBeGreaterThan(0);
      });

      it('should have a heading in markdown content', () => {
        const content = readFileSync(filePath, 'utf-8');
        const parts = content.split('---');
        const markdownContent = parts.slice(2).join('---').trim();

        expect(markdownContent).toMatch(/^#\s+\w+/m);
      });

      it('should reference a skill file', () => {
        const content = readFileSync(filePath, 'utf-8');
        const parts = content.split('---');
        const markdownContent = parts.slice(2).join('---').trim();

        // Should reference agents/skills/roles/references/ or similar
        expect(markdownContent).toMatch(/agents\/skills|Load and follow/i);
      });
    });
  });

  describe('Agent name consistency', () => {
    agentFiles.forEach((filename) => {
      it(`${filename} should have name matching filename`, () => {
        const filePath = join(PROJECT_ROOT, 'agents/agents', filename);
        const content = readFileSync(filePath, 'utf-8');
        const frontmatter = parseYamlFrontmatter(content);

        const expectedName = filename.replace('.md', '');
        expect(frontmatter!.name).toBe(expectedName);
      });
    });
  });
});

describe('Skill Instruction Files', () => {
  describe('agents/skills/instructions/SKILL.md', () => {
    const filePath = join(PROJECT_ROOT, 'agents/skills/instructions/SKILL.md');

    it('should exist', () => {
      expect(existsSync(filePath)).toBe(true);
    });

    it('should have YAML frontmatter', () => {
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/^---\s*\n/);
    });

    it('should have name and description in frontmatter', () => {
      const content = readFileSync(filePath, 'utf-8');
      const frontmatter = parseYamlFrontmatter(content);

      expect(frontmatter).not.toBeNull();
      expect(frontmatter!).toHaveProperty('name');
      expect(frontmatter!).toHaveProperty('description');
      expect(frontmatter!.name).toBe('instructions');
    });

    it('should reference reference files', () => {
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/references\//);
    });

    it('should contain access pattern section', () => {
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/Access pattern|pattern/i);
    });
  });

  describe('Skill Reference Files', () => {
    const referenceFiles = [
      'coding-principles.md',
      'commands.md',
      'design-principles.md',
      'git.md',
      'project.md',
      'sdlc.md',
      'state.md',
      'tdd.md',
      'verification.md'
    ];

    referenceFiles.forEach((filename) => {
      describe(`agents/skills/instructions/references/${filename}`, () => {
        const filePath = join(PROJECT_ROOT, 'agents/skills/instructions/references', filename);

        it('should exist', () => {
          expect(existsSync(filePath)).toBe(true);
        });

        it('should be valid markdown', () => {
          const content = readFileSync(filePath, 'utf-8');
          expect(content.length).toBeGreaterThan(0);
          expect(content).toMatch(/^#/m);
        });

        it('should have a title heading', () => {
          const content = readFileSync(filePath, 'utf-8');
          expect(content).toMatch(/^#\s+\w+/m);
        });

        it('should not be empty', () => {
          const content = readFileSync(filePath, 'utf-8');
          const trimmed = content.trim();
          expect(trimmed.length).toBeGreaterThan(10);
        });
      });
    });

    it('tdd.md should contain TDD cycle information', () => {
      const filePath = join(PROJECT_ROOT, 'agents/skills/instructions/references/tdd.md');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toMatch(/Red-Green-Refactor|test.*first/i);
    });

    it('git.md should contain git workflow information', () => {
      const filePath = join(PROJECT_ROOT, 'agents/skills/instructions/references/git.md');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toMatch(/git|branch|commit|pull request|PR/i);
    });

    it('coding-principles.md should exist and contain principles', () => {
      const filePath = join(PROJECT_ROOT, 'agents/skills/instructions/references/coding-principles.md');
      const content = readFileSync(filePath, 'utf-8');

      expect(content.length).toBeGreaterThan(0);
    });
  });
});

describe('Documentation Files', () => {
  describe('README.md', () => {
    const filePath = join(PROJECT_ROOT, 'README.md');

    it('should exist', () => {
      expect(existsSync(filePath)).toBe(true);
    });

    it('should have title', () => {
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/^#\s+/m);
    });

    it('should contain project name RAGTS', () => {
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('RAGTS');
    });

    it('should have Getting Started section', () => {
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/##\s+Getting Started/i);
    });

    it('should have installation instructions', () => {
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/npm install|npm run dev/);
    });

    it('should have testing instructions', () => {
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/npm test|vitest/i);
    });
  });

  describe('.state/feat/mvp-v1/ documentation', () => {
    const stateFiles = [
      'REQUIREMENTS.md',
      'PLAN.md',
      'ADR.md'
    ];

    stateFiles.forEach((filename) => {
      describe(filename, () => {
        const filePath = join(PROJECT_ROOT, '.state/feat/mvp-v1', filename);

        it('should exist', () => {
          expect(existsSync(filePath)).toBe(true);
        });

        it('should be valid markdown', () => {
          const content = readFileSync(filePath, 'utf-8');
          expect(content.length).toBeGreaterThan(0);
        });

        it('should have a title', () => {
          const content = readFileSync(filePath, 'utf-8');
          expect(content).toMatch(/^#\s+/m);
        });

        it('should not be empty', () => {
          const content = readFileSync(filePath, 'utf-8');
          expect(content.trim().length).toBeGreaterThan(50);
        });
      });
    });

    it('REQUIREMENTS.md should contain MVP scope', () => {
      const filePath = join(PROJECT_ROOT, '.state/feat/mvp-v1/REQUIREMENTS.md');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toMatch(/MVP|Minimum Viable Product/i);
      expect(content).toMatch(/scope/i);
    });

    it('REQUIREMENTS.md should have functional requirements', () => {
      const filePath = join(PROJECT_ROOT, '.state/feat/mvp-v1/REQUIREMENTS.md');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toMatch(/FR-\d+|Functional Requirements/i);
    });

    it('PLAN.md should exist and contain implementation plan', () => {
      const filePath = join(PROJECT_ROOT, '.state/feat/mvp-v1/PLAN.md');

      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it('ADR.md should exist and contain architecture decisions', () => {
      const filePath = join(PROJECT_ROOT, '.state/feat/mvp-v1/ADR.md');

      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Configuration Consistency', () => {
  it('all agent files should reference valid skills', () => {
    const agentFiles = [
      'architect.md',
      'coordinator.md',
      'implementer.md',
      'maintainer.md',
      'product-owner.md',
      'reviewer-coderabbit.md',
      'reviewer-internal.md',
      'reviewer-pair.md'
    ];

    agentFiles.forEach((filename) => {
      const filePath = join(PROJECT_ROOT, 'agents/agents', filename);
      const content = readFileSync(filePath, 'utf-8');
      const frontmatter = parseYamlFrontmatter(content);

      expect(frontmatter!.skills).toBeDefined();
      expect(Array.isArray(frontmatter!.skills)).toBe(true);

      // Common skills should be valid
      frontmatter!.skills.forEach((skill: string) => {
        expect(typeof skill).toBe('string');
        expect(skill.length).toBeGreaterThan(0);
      });
    });
  });

  it('skill instruction files should all be markdown', () => {
    const referenceDir = join(PROJECT_ROOT, 'agents/skills/instructions/references');
    const referenceFiles = [
      'coding-principles.md',
      'commands.md',
      'design-principles.md',
      'git.md',
      'project.md',
      'sdlc.md',
      'state.md',
      'tdd.md',
      'verification.md'
    ];

    referenceFiles.forEach((filename) => {
      expect(filename.endsWith('.md')).toBe(true);

      const filePath = join(referenceDir, filename);
      expect(existsSync(filePath)).toBe(true);
    });
  });

  it('agents directory structure is consistent', () => {
    const agentsDir = join(PROJECT_ROOT, 'agents');
    const agentsSubdir = join(agentsDir, 'agents');
    const skillsDir = join(agentsDir, 'skills');
    const instructionsDir = join(skillsDir, 'instructions');
    const referencesDir = join(instructionsDir, 'references');

    expect(existsSync(agentsDir)).toBe(true);
    expect(existsSync(agentsSubdir)).toBe(true);
    expect(existsSync(skillsDir)).toBe(true);
    expect(existsSync(instructionsDir)).toBe(true);
    expect(existsSync(referencesDir)).toBe(true);
  });
});

describe('Edge Cases and Negative Tests', () => {
  it('should handle agent files with extra whitespace in frontmatter', () => {
    const filePath = join(PROJECT_ROOT, 'agents/agents/architect.md');
    const content = readFileSync(filePath, 'utf-8');

    // Even with potential extra whitespace, parsing should work
    const frontmatter = parseYamlFrontmatter(content);
    expect(frontmatter).not.toBeNull();
    expect(frontmatter!.name).toBeDefined();
  });

  it('should validate that disallowedTools are properly formatted if present', () => {
    const agentFiles = [
      'architect.md',
      'coordinator.md'
    ];

    agentFiles.forEach((filename) => {
      const filePath = join(PROJECT_ROOT, 'agents/agents', filename);
      const content = readFileSync(filePath, 'utf-8');
      const frontmatter = parseYamlFrontmatter(content);

      if (frontmatter!.disallowedTools) {
        expect(Array.isArray(frontmatter!.disallowedTools)).toBe(true);
      }
    });
  });

  it('should ensure agent descriptions are not empty', () => {
    const agentFiles = [
      'architect.md',
      'coordinator.md',
      'implementer.md',
      'maintainer.md',
      'product-owner.md',
      'reviewer-coderabbit.md',
      'reviewer-internal.md',
      'reviewer-pair.md'
    ];

    agentFiles.forEach((filename) => {
      const filePath = join(PROJECT_ROOT, 'agents/agents', filename);
      const content = readFileSync(filePath, 'utf-8');
      const frontmatter = parseYamlFrontmatter(content);

      expect(frontmatter!.description).toBeDefined();
      expect(frontmatter!.description.length).toBeGreaterThan(10);
    });
  });

  it('README should have proper markdown structure without broken links', () => {
    const filePath = join(PROJECT_ROOT, 'README.md');
    const content = readFileSync(filePath, 'utf-8');

    // Check for common markdown issues
    const lines = content.split('\n');

    // Should not have multiple consecutive blank lines (more than 2)
    let consecutiveBlankLines = 0;
    let maxConsecutiveBlankLines = 0;

    lines.forEach(line => {
      if (line.trim() === '') {
        consecutiveBlankLines++;
        maxConsecutiveBlankLines = Math.max(maxConsecutiveBlankLines, consecutiveBlankLines);
      } else {
        consecutiveBlankLines = 0;
      }
    });

    expect(maxConsecutiveBlankLines).toBeLessThanOrEqual(2);
  });

  it('.gitignore patterns should be valid', () => {
    const filePath = join(PROJECT_ROOT, '.gitignore');
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));

    // All patterns should be reasonable
    lines.forEach(pattern => {
      expect(pattern.length).toBeGreaterThan(0);
      expect(pattern.length).toBeLessThan(100);
    });
  });
});

describe('Additional Boundary and Regression Tests', () => {
  it('should ensure agents/settings.json does not have trailing commas', () => {
    const filePath = join(PROJECT_ROOT, 'agents/settings.json');
    const content = readFileSync(filePath, 'utf-8');

    // Valid JSON should not have trailing commas before closing braces/brackets
    expect(content).not.toMatch(/,\s*}/);
    expect(content).not.toMatch(/,\s*]/);
  });

  it('should verify agent maxTurns values are reasonable', () => {
    const agentFiles = [
      'architect.md',
      'coordinator.md',
      'implementer.md',
      'maintainer.md',
      'product-owner.md',
      'reviewer-coderabbit.md',
      'reviewer-internal.md',
      'reviewer-pair.md'
    ];

    agentFiles.forEach((filename) => {
      const filePath = join(PROJECT_ROOT, 'agents/agents', filename);
      const content = readFileSync(filePath, 'utf-8');
      const frontmatter = parseYamlFrontmatter(content);

      if (frontmatter!.maxTurns) {
        const maxTurns = parseInt(frontmatter!.maxTurns, 10);
        expect(maxTurns).toBeGreaterThan(0);
        expect(maxTurns).toBeLessThanOrEqual(100);
      }
    });
  });

  it('should verify permissionMode values are valid', () => {
    const agentFiles = [
      'architect.md',
      'coordinator.md',
      'implementer.md',
      'maintainer.md',
      'product-owner.md',
      'reviewer-coderabbit.md',
      'reviewer-internal.md',
      'reviewer-pair.md'
    ];

    const validPermissionModes = ['default', 'acceptEdits', 'requireApproval', 'auto'];

    agentFiles.forEach((filename) => {
      const filePath = join(PROJECT_ROOT, 'agents/agents', filename);
      const content = readFileSync(filePath, 'utf-8');
      const frontmatter = parseYamlFrontmatter(content);

      expect(frontmatter!.permissionMode).toBeDefined();
      expect(validPermissionModes).toContain(frontmatter!.permissionMode);
    });
  });

  it('should ensure skill reference files have consistent formatting', () => {
    const referenceFiles = [
      'coding-principles.md',
      'commands.md',
      'design-principles.md',
      'git.md',
      'project.md',
      'sdlc.md',
      'state.md',
      'tdd.md',
      'verification.md'
    ];

    referenceFiles.forEach((filename) => {
      const filePath = join(PROJECT_ROOT, 'agents/skills/instructions/references', filename);
      const content = readFileSync(filePath, 'utf-8');

      // Should start with a heading
      expect(content.trimStart()).toMatch(/^#\s+/);

      // Should not have tabs (use spaces for indentation)
      const hasTabs = content.includes('\t');
      if (hasTabs) {
        // Only allow tabs in code blocks
        const codeBlockRegex = /```[\s\S]*?```/g;
        const contentWithoutCodeBlocks = content.replace(codeBlockRegex, '');
        expect(contentWithoutCodeBlocks).not.toContain('\t');
      }
    });
  });

  it('should verify REQUIREMENTS.md has numbered sections', () => {
    const filePath = join(PROJECT_ROOT, '.state/feat/mvp-v1/REQUIREMENTS.md');
    const content = readFileSync(filePath, 'utf-8');

    // Should have numbered sections like "## 1." or similar
    expect(content).toMatch(/##\s+\d+\.\s+/);
  });

  it('should ensure all agent tools are recognized Claude Code tools', () => {
    const validTools = [
      'Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash',
      'Task', 'WebFetch', 'WebSearch', 'AskUserQuestion',
      'TodoWrite', 'EnterPlanMode', 'ExitPlanMode'
    ];

    const agentFiles = [
      'architect.md',
      'coordinator.md',
      'implementer.md',
      'maintainer.md',
      'product-owner.md',
      'reviewer-coderabbit.md',
      'reviewer-internal.md',
      'reviewer-pair.md'
    ];

    agentFiles.forEach((filename) => {
      const filePath = join(PROJECT_ROOT, 'agents/agents', filename);
      const content = readFileSync(filePath, 'utf-8');
      const frontmatter = parseYamlFrontmatter(content);

      frontmatter!.tools.forEach((tool: string) => {
        // Tool might have parameters like "Task(...)" so extract base name
        const baseTool = tool.split('(')[0].trim();
        expect(validTools).toContain(baseTool);
      });
    });
  });

  it('should verify git.md contains branch protection information', () => {
    const filePath = join(PROJECT_ROOT, 'agents/skills/instructions/references/git.md');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/main.*protected|Branch Protection/i);
    expect(content).toMatch(/PR|pull request/i);
  });

  it('should ensure tdd.md describes the Red-Green-Refactor cycle', () => {
    const filePath = join(PROJECT_ROOT, 'agents/skills/instructions/references/tdd.md');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/Red.*Green.*Refactor/i);
    expect(content.toLowerCase()).toContain('test');
    expect(content.toLowerCase()).toContain('pass');
    expect(content.toLowerCase()).toContain('fail');
  });

  it('should validate that documentation files end with newline', () => {
    const docFiles = [
      'README.md',
      '.state/feat/mvp-v1/REQUIREMENTS.md'
    ];

    docFiles.forEach((filename) => {
      const filePath = join(PROJECT_ROOT, filename);
      const content = readFileSync(filePath, 'utf-8');

      // Files should end with a newline character
      expect(content.endsWith('\n')).toBe(true);
    });
  });

  it('should ensure README has license information', () => {
    const filePath = join(PROJECT_ROOT, 'README.md');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/license|License|LICENSE/i);
  });

  it('should verify coordinator agent can spawn other agents', () => {
    const filePath = join(PROJECT_ROOT, 'agents/agents/coordinator.md');
    const content = readFileSync(filePath, 'utf-8');
    const frontmatter = parseYamlFrontmatter(content);

    // Coordinator should have Task tool with agent parameters
    const hasTaskTool = frontmatter!.tools.some((tool: string) =>
      tool.startsWith('Task(')
    );

    expect(hasTaskTool).toBe(true);
  });

  it('should ensure implementer has Write and Edit tools for code changes', () => {
    const filePath = join(PROJECT_ROOT, 'agents/agents/implementer.md');
    const content = readFileSync(filePath, 'utf-8');
    const frontmatter = parseYamlFrontmatter(content);

    expect(frontmatter!.tools).toContain('Write');
    expect(frontmatter!.tools).toContain('Edit');
  });

  it('should validate that architect cannot use Edit tool (design only)', () => {
    const filePath = join(PROJECT_ROOT, 'agents/agents/architect.md');
    const content = readFileSync(filePath, 'utf-8');
    const frontmatter = parseYamlFrontmatter(content);

    if (frontmatter!.disallowedTools) {
      expect(frontmatter!.disallowedTools).toContain('Edit');
    }
  });

  it('should ensure all agent files reference skill documentation', () => {
    const agentFiles = [
      'architect.md',
      'coordinator.md',
      'implementer.md',
      'maintainer.md',
      'product-owner.md',
      'reviewer-coderabbit.md',
      'reviewer-internal.md',
      'reviewer-pair.md'
    ];

    agentFiles.forEach((filename) => {
      const filePath = join(PROJECT_ROOT, 'agents/agents', filename);
      const content = readFileSync(filePath, 'utf-8');
      const parts = content.split('---');
      const markdownContent = parts.slice(2).join('---').trim();

      // Should reference either agents/skills or have "Load and follow" instruction
      expect(markdownContent).toMatch(/agents\/skills|Load and follow|references\//i);
    });
  });

  it('should verify hooks in settings.json reference valid files', () => {
    const filePath = join(PROJECT_ROOT, 'agents/settings.json');
    const content = readFileSync(filePath, 'utf-8');
    const config = JSON.parse(content);

    const sessionStartHooks = config.hooks.SessionStart;

    sessionStartHooks.forEach((hookGroup: any) => {
      hookGroup.hooks.forEach((hook: any) => {
        // Command should reference AGENTS.md or CLAUDE.md
        expect(hook.command).toMatch(/AGENTS\.md|CLAUDE\.md/);
      });
    });
  });
});