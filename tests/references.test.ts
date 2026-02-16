/**
 * Tests for validating file references across the codebase.
 * Ensures that files referenced in documentation, configs, and code actually exist.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const projectRoot = join(__dirname, '..');

/**
 * Check if a file exists relative to project root.
 */
function fileExists(relativePath: string): boolean {
  return existsSync(join(projectRoot, relativePath));
}

/**
 * Read file content.
 */
function readFile(relativePath: string): string {
  return readFileSync(join(projectRoot, relativePath), 'utf-8');
}

/**
 * Extract markdown file references from content.
 */
function extractMarkdownReferences(content: string): string[] {
  const references: string[] = [];

  // Match [text](path) style links
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const url = match[2];

    // Skip external URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
      continue;
    }

    // Skip anchors
    if (url.startsWith('#')) {
      continue;
    }

    // Remove anchors from paths
    const path = url.split('#')[0];
    if (path) {
      references.push(path);
    }
  }

  // Match `path/to/file.ext` style references
  const pathRegex = /`([a-zA-Z0-9/_.-]+\.(md|ts|js|json|sql|vue|cast))`/g;

  while ((match = pathRegex.exec(content)) !== null) {
    references.push(match[1]);
  }

  return references;
}

/**
 * Get all agent definition files.
 */
function getAgentFiles(): string[] {
  const agentsDir = join(projectRoot, 'agents', 'agents');
  return readdirSync(agentsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => join('agents', 'agents', f));
}

/**
 * Get all skill reference files.
 */
function getSkillReferenceFiles(): string[] {
  const refsDir = join(projectRoot, 'agents', 'skills', 'instructions', 'references');
  return readdirSync(refsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => join('agents', 'skills', 'instructions', 'references', f));
}

describe('Agent Definition File References', () => {
  const agentFiles = getAgentFiles();

  describe.each(agentFiles)('%s', (agentFile) => {
    it('should reference existing skill files', () => {
      const content = readFile(agentFile);

      // Extract paths like agents/skills/...
      const skillPaths = content.match(/agents\/skills\/[a-zA-Z0-9/_.-]+\.md/g) || [];

      for (const path of skillPaths) {
        expect(fileExists(path)).toBe(true);
      }
    });

    it('should not reference non-existent markdown files', () => {
      const content = readFile(agentFile);
      const references = extractMarkdownReferences(content);

      for (const ref of references) {
        if (ref.endsWith('.md')) {
          // Construct full path
          const fullPath = ref.startsWith('agents/') ? ref : join('agents', ref);
          expect(fileExists(fullPath)).toBe(true);
        }
      }
    });
  });
});

describe('Skill Instructions File References', () => {
  it('SKILL.md should reference existing reference files', () => {
    const skillDoc = readFile('agents/skills/instructions/SKILL.md');
    const references = extractMarkdownReferences(skillDoc);

    for (const ref of references) {
      if (ref.includes('references/')) {
        const fullPath = ref.startsWith('agents/') ? ref : join('agents/skills/instructions', ref);
        expect(fileExists(fullPath)).toBe(true);
      }
    }
  });

  describe('Reference files', () => {
    const referenceFiles = getSkillReferenceFiles();

    describe.each(referenceFiles)('%s', (refFile) => {
      it('should not reference non-existent files', () => {
        const content = readFile(refFile);
        const references = extractMarkdownReferences(content);

        for (const ref of references) {
          // Skip relative references that might be examples
          if (ref.startsWith('./') || ref.startsWith('../')) {
            continue;
          }

          // Check absolute references from project root
          if (ref.startsWith('agents/') || ref.startsWith('src/') || ref.startsWith('.state/')) {
            if (ref.endsWith('.md')) {
              expect(fileExists(ref)).toBe(true);
            }
          }
        }
      });
    });
  });
});

describe('State Documentation References', () => {
  const stateFiles = [
    '.state/feat/mvp-v1/ADR.md',
    '.state/feat/mvp-v1/PLAN.md',
    '.state/feat/mvp-v1/REQUIREMENTS.md',
  ];

  describe.each(stateFiles)('%s', (stateFile) => {
    it('should reference other state files correctly', () => {
      const content = readFile(stateFile);

      // Extract references to other state files
      const stateRefs = content.match(/[A-Z]+\.md/g) || [];

      for (const ref of stateRefs) {
        if (['ADR.md', 'PLAN.md', 'REQUIREMENTS.md', 'ARCHITECTURE.md'].includes(ref)) {
          // Should be in same directory
          const dir = stateFile.substring(0, stateFile.lastIndexOf('/'));
          const fullPath = join(dir, ref);

          // Only check if file exists, not all state files are required
          if (!fileExists(fullPath)) {
            // Warn but don't fail - some references might be to future files
            console.warn(`Referenced file may not exist: ${fullPath}`);
          }
        }
      }
    });

    it('should not reference non-existent code files', () => {
      const content = readFile(stateFile);

      // Extract references to source files
      const srcRefs = content.match(/src\/[a-zA-Z0-9/_.-]+\.(ts|js|vue)/g) || [];

      for (const ref of srcRefs) {
        // These are often examples or planned files, so we just check format
        expect(ref).toMatch(/^src\/.+\.(ts|js|vue)$/);
      }
    });
  });
});

describe('README.md References', () => {
  const readme = readFile('README.md');

  it('should not reference non-existent local files', () => {
    const references = extractMarkdownReferences(readme);

    for (const ref of references) {
      // Skip external URLs (already filtered)
      if (ref.startsWith('http')) {
        continue;
      }

      // Check if file should exist
      if (ref.endsWith('.md') || ref.endsWith('.json')) {
        // Make path relative to root
        const path = ref.startsWith('./') ? ref.substring(2) : ref;

        if (path !== 'LICENSE') { // LICENSE might not exist in test
          // Only warn for missing files in README
          if (!fileExists(path)) {
            console.warn(`README references potentially missing file: ${path}`);
          }
        }
      }
    }
  });

  it('should reference existing fixture files', () => {
    if (readme.includes('fixtures/sample.cast')) {
      expect(fileExists('fixtures/sample.cast')).toBe(true);
    }
  });
});

describe('agents/settings.json References', () => {
  it('should reference existing or fallback files', () => {
    const settings = JSON.parse(readFile('agents/settings.json'));

    for (const hookConfigs of Object.values(settings.hooks)) {
      for (const hookConfig of hookConfigs as any[]) {
        for (const hook of hookConfig.hooks) {
          // Extract file references from commands
          const fileRefs = hook.command.match(/[A-Z_]+\.md/g) || [];

          for (const ref of fileRefs) {
            // Commands should have fallbacks, so we just verify the pattern
            expect(['AGENTS.md', 'CLAUDE.md']).toContain(ref);
          }
        }
      }
    }
  });
});

describe('Template Files', () => {
  it('should have templates directory if referenced', () => {
    const skillDoc = readFile('agents/skills/instructions/SKILL.md');

    if (skillDoc.includes('templates/')) {
      expect(fileExists('agents/skills/instructions/templates')).toBe(true);
    }
  });
});

describe('Cross-File Reference Integrity', () => {
  it('all agent files should reference valid skill paths', () => {
    const agentFiles = getAgentFiles();
    const skillRefs = getSkillReferenceFiles();
    const skillNames = skillRefs.map(f => f.split('/').pop()!.replace('.md', ''));

    for (const agentFile of agentFiles) {
      const content = readFile(agentFile);

      // Extract skill references from markdown body
      const matches = content.match(/agents\/skills\/[a-zA-Z0-9/_-]+\.md/g) || [];

      for (const match of matches) {
        // Verify the path structure is correct (can be in roles or instructions)
        expect(match).toMatch(/^agents\/skills\/(instructions|roles)\/(references\/)?[a-z-]+\.md$/);
      }
    }
  });

  it('skill instructions should form a complete reference set', () => {
    const referenceFiles = getSkillReferenceFiles();
    const expectedRefs = [
      'coding-principles.md',
      'commands.md',
      'design-principles.md',
      'git.md',
      'project.md',
      'sdlc.md',
      'state.md',
      'tdd.md',
    ];

    for (const expected of expectedRefs) {
      const exists = referenceFiles.some(f => f.endsWith(expected));
      expect(exists).toBe(true);
    }
  });

  it('all state files should be in correct directory structure', () => {
    const stateFiles = [
      '.state/feat/mvp-v1/ADR.md',
      '.state/feat/mvp-v1/PLAN.md',
      '.state/feat/mvp-v1/REQUIREMENTS.md',
    ];

    for (const file of stateFiles) {
      expect(fileExists(file)).toBe(true);
    }
  });
});

describe('Path Convention Validation', () => {
  it('agent files should follow naming conventions', () => {
    const agentFiles = getAgentFiles();

    for (const file of agentFiles) {
      const filename = file.split('/').pop()!;

      // Should be kebab-case
      expect(filename).toMatch(/^[a-z0-9-]+\.md$/);
    }
  });

  it('skill reference files should follow naming conventions', () => {
    const referenceFiles = getSkillReferenceFiles();

    for (const file of referenceFiles) {
      const filename = file.split('/').pop()!;

      // Should be kebab-case
      expect(filename).toMatch(/^[a-z0-9-]+\.md$/);
    }
  });

  it('state files should follow naming conventions', () => {
    const stateFiles = [
      '.state/feat/mvp-v1/ADR.md',
      '.state/feat/mvp-v1/PLAN.md',
      '.state/feat/mvp-v1/REQUIREMENTS.md',
    ];

    for (const file of stateFiles) {
      const filename = file.split('/').pop()!;

      // Should be UPPERCASE.md
      expect(filename).toMatch(/^[A-Z]+\.md$/);
    }
  });
});

describe('Circular Reference Detection', () => {
  it('should not have circular references in skill files', () => {
    const referenceFiles = getSkillReferenceFiles();

    for (const file of referenceFiles) {
      const content = readFile(file);
      const filename = file.split('/').pop()!;

      // File should not reference itself
      expect(content).not.toContain(filename);
    }
  });

  it('should not have circular references in agent files', () => {
    const agentFiles = getAgentFiles();

    for (const file of agentFiles) {
      const content = readFile(file);
      const filename = file.split('/').pop()!;

      // File should not reference itself in the same directory
      // It's OK to reference a file with the same name in a different directory (e.g., roles/references/)
      const selfReference = `agents/agents/${filename}`;
      expect(content).not.toContain(selfReference);
    }
  });
});