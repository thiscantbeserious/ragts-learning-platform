/**
 * Integration tests for agent definition files.
 * Validates YAML frontmatter structure, required fields, and markdown content.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const agentsPath = join(__dirname, '..', 'agents', 'agents');

interface AgentFrontmatter {
  name: string;
  description: string;
  model: string;
  tools?: string[];
  disallowedTools?: string[];
  permissionMode?: string;
  maxTurns?: number;
  skills?: string[];
}

/**
 * Parse YAML frontmatter from markdown file.
 * Returns frontmatter object and markdown content.
 */
function parseFrontmatter(content: string): { frontmatter: AgentFrontmatter; markdown: string } {
  const frontmatterRegex = /^---\n([\s\S]+?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error('No frontmatter found');
  }

  const [, yamlContent, markdown] = match;

  // Simple YAML parser for our use case
  const frontmatter: any = {};
  const lines = yamlContent.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith('-')) {
      // Array item
      const value = line.trim().substring(1).trim();
      currentArray.push(value);
    } else if (line.includes(':')) {
      // Save previous array if any
      if (currentKey && currentArray.length > 0) {
        frontmatter[currentKey] = currentArray;
        currentArray = [];
      }

      // New key-value pair
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      currentKey = key.trim();

      if (value) {
        // Try to parse as number
        const numValue = Number(value);
        frontmatter[currentKey] = isNaN(numValue) ? value : numValue;
        currentKey = null;
      }
    }
  }

  // Save final array if any
  if (currentKey && currentArray.length > 0) {
    frontmatter[currentKey] = currentArray;
  }

  return { frontmatter: frontmatter as AgentFrontmatter, markdown };
}

/**
 * Load all agent definition files.
 */
function loadAgentFiles(): Map<string, string> {
  const files = readdirSync(agentsPath).filter(f => f.endsWith('.md'));
  const agentFiles = new Map<string, string>();

  for (const file of files) {
    const content = readFileSync(join(agentsPath, file), 'utf-8');
    agentFiles.set(file, content);
  }

  return agentFiles;
}

describe('Agent Definition Files', () => {
  const agentFiles = loadAgentFiles();

  it('should have at least one agent definition', () => {
    expect(agentFiles.size).toBeGreaterThan(0);
  });

  describe.each(Array.from(agentFiles.entries()))('%s', (filename, content) => {
    it('should have valid frontmatter structure', () => {
      expect(() => parseFrontmatter(content)).not.toThrow();
    });

    it('should have required frontmatter fields', () => {
      const { frontmatter } = parseFrontmatter(content);

      expect(frontmatter.name).toBeDefined();
      expect(typeof frontmatter.name).toBe('string');
      expect(frontmatter.name.length).toBeGreaterThan(0);

      expect(frontmatter.description).toBeDefined();
      expect(typeof frontmatter.description).toBe('string');
      expect(frontmatter.description.length).toBeGreaterThan(0);

      expect(frontmatter.model).toBeDefined();
      expect(typeof frontmatter.model).toBe('string');
      expect(['opus', 'sonnet', 'haiku']).toContain(frontmatter.model);
    });

    it('should have valid tools configuration if present', () => {
      const { frontmatter } = parseFrontmatter(content);

      if (frontmatter.tools) {
        expect(Array.isArray(frontmatter.tools)).toBe(true);
        expect(frontmatter.tools.length).toBeGreaterThan(0);

        for (const tool of frontmatter.tools) {
          expect(typeof tool).toBe('string');
          expect(tool.length).toBeGreaterThan(0);
        }
      }
    });

    it('should have valid disallowedTools configuration if present', () => {
      const { frontmatter } = parseFrontmatter(content);

      if (frontmatter.disallowedTools) {
        expect(Array.isArray(frontmatter.disallowedTools)).toBe(true);

        for (const tool of frontmatter.disallowedTools) {
          expect(typeof tool).toBe('string');
          expect(tool.length).toBeGreaterThan(0);
        }
      }
    });

    it('should have valid permissionMode if present', () => {
      const { frontmatter } = parseFrontmatter(content);

      if (frontmatter.permissionMode) {
        expect(['default', 'acceptEdits', 'strict']).toContain(frontmatter.permissionMode);
      }
    });

    it('should have valid maxTurns if present', () => {
      const { frontmatter } = parseFrontmatter(content);

      if (frontmatter.maxTurns) {
        expect(typeof frontmatter.maxTurns).toBe('number');
        expect(frontmatter.maxTurns).toBeGreaterThan(0);
        expect(frontmatter.maxTurns).toBeLessThanOrEqual(100);
      }
    });

    it('should have valid skills configuration if present', () => {
      const { frontmatter } = parseFrontmatter(content);

      if (frontmatter.skills) {
        expect(Array.isArray(frontmatter.skills)).toBe(true);

        for (const skill of frontmatter.skills) {
          expect(typeof skill).toBe('string');
          expect(skill.length).toBeGreaterThan(0);
        }
      }
    });

    it('should have non-empty markdown content', () => {
      const { markdown } = parseFrontmatter(content);

      expect(markdown.trim().length).toBeGreaterThan(0);
    });

    it('should have a level 1 heading in markdown', () => {
      const { markdown } = parseFrontmatter(content);

      expect(markdown).toMatch(/^#\s+.+/m);
    });

    it('should have a reference to skill instructions', () => {
      const { markdown } = parseFrontmatter(content);

      // Agent definitions should reference their role instructions
      expect(markdown).toMatch(/agents\/skills\//);
    });
  });

  describe('Agent file naming conventions', () => {
    it('should use kebab-case for filenames', () => {
      for (const filename of agentFiles.keys()) {
        const nameWithoutExt = filename.replace('.md', '');
        expect(nameWithoutExt).toMatch(/^[a-z0-9-]+$/);
      }
    });

    it('should have filename match frontmatter name', () => {
      for (const [filename, content] of agentFiles.entries()) {
        const { frontmatter } = parseFrontmatter(content);
        const nameWithoutExt = filename.replace('.md', '');
        const expectedName = nameWithoutExt;

        expect(frontmatter.name.toLowerCase()).toBe(expectedName.toLowerCase());
      }
    });
  });
});

describe('Agent Definition Consistency', () => {
  const agentFiles = loadAgentFiles();

  it('should have unique agent names', () => {
    const names = new Set<string>();

    for (const content of agentFiles.values()) {
      const { frontmatter } = parseFrontmatter(content);
      expect(names.has(frontmatter.name)).toBe(false);
      names.add(frontmatter.name);
    }

    expect(names.size).toBe(agentFiles.size);
  });

  it('should all reference the same skill system', () => {
    const skillReferences = new Set<string>();

    for (const content of agentFiles.values()) {
      const { frontmatter } = parseFrontmatter(content);

      if (frontmatter.skills) {
        for (const skill of frontmatter.skills) {
          skillReferences.add(skill);
        }
      }
    }

    // Verify common skills exist
    expect(skillReferences.has('roles') || skillReferences.has('instructions')).toBe(true);
  });

  it('should have descriptions that are not too long', () => {
    for (const content of agentFiles.values()) {
      const { frontmatter } = parseFrontmatter(content);

      // Descriptions should be concise (under 300 chars)
      expect(frontmatter.description.length).toBeLessThan(300);
    }
  });

  it('should not have tools and disallowedTools overlap', () => {
    for (const content of agentFiles.values()) {
      const { frontmatter } = parseFrontmatter(content);

      if (frontmatter.tools && frontmatter.disallowedTools) {
        const tools = new Set(frontmatter.tools);
        const disallowed = new Set(frontmatter.disallowedTools);

        for (const tool of disallowed) {
          expect(tools.has(tool)).toBe(false);
        }
      }
    }
  });
});

describe('Edge Cases', () => {
  it('should handle agent files with minimal configuration', () => {
    const minimalAgent = `---
name: test-agent
description: Test agent for validation
model: haiku
---

# Test Agent

This is a minimal test agent.`;

    const { frontmatter, markdown } = parseFrontmatter(minimalAgent);

    expect(frontmatter.name).toBe('test-agent');
    expect(frontmatter.description).toBe('Test agent for validation');
    expect(frontmatter.model).toBe('haiku');
    expect(markdown.trim()).toContain('# Test Agent');
  });

  it('should handle agent files with all optional fields', () => {
    const fullAgent = `---
name: full-agent
description: Agent with all fields
model: opus
tools:
  - Read
  - Write
  - Bash
disallowedTools:
  - Edit
permissionMode: acceptEdits
maxTurns: 50
skills:
  - roles
  - instructions
---

# Full Agent

Complete configuration.`;

    const { frontmatter } = parseFrontmatter(fullAgent);

    expect(frontmatter.name).toBe('full-agent');
    expect(frontmatter.tools).toEqual(['Read', 'Write', 'Bash']);
    expect(frontmatter.disallowedTools).toEqual(['Edit']);
    expect(frontmatter.permissionMode).toBe('acceptEdits');
    expect(frontmatter.maxTurns).toBe(50);
    expect(frontmatter.skills).toEqual(['roles', 'instructions']);
  });
});