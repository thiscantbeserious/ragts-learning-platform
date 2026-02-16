/**
 * Tests for markdown documentation structure and completeness.
 * Validates README.md, ADR, PLAN, REQUIREMENTS, and skill reference docs.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const projectRoot = join(__dirname, '..');

/**
 * Read a markdown file from the project.
 */
function readMarkdownFile(relativePath: string): string {
  const fullPath = join(projectRoot, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

/**
 * Extract all headings from markdown content.
 */
function extractHeadings(markdown: string): string[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: string[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    headings.push(match[2].trim());
  }

  return headings;
}

/**
 * Check if markdown contains a specific heading level.
 */
function hasHeadingLevel(markdown: string, level: number): boolean {
  const regex = new RegExp(`^#{${level}}\\s+.+$`, 'm');
  return regex.test(markdown);
}

/**
 * Extract code blocks from markdown.
 */
function extractCodeBlocks(markdown: string): string[] {
  const codeBlockRegex = /```[\s\S]*?```/g;
  return markdown.match(codeBlockRegex) || [];
}

describe('README.md', () => {
  const readme = readMarkdownFile('README.md');

  it('should exist and be non-empty', () => {
    expect(readme.length).toBeGreaterThan(0);
  });

  it('should have a level 1 heading', () => {
    expect(hasHeadingLevel(readme, 1)).toBe(true);
  });

  it('should contain project name or title', () => {
    expect(readme.toLowerCase()).toMatch(/ragts|reinforced/i);
  });

  it('should have Getting Started or Installation section', () => {
    const headings = extractHeadings(readme);
    const hasSetupSection = headings.some(h =>
      /getting started|installation|prerequisites|development/i.test(h)
    );

    expect(hasSetupSection).toBe(true);
  });

  it('should include code examples or commands', () => {
    const codeBlocks = extractCodeBlocks(readme);

    expect(codeBlocks.length).toBeGreaterThan(0);
  });

  it('should mention key technologies', () => {
    const technologies = ['vue', 'typescript', 'node', 'sqlite'];
    const lowerReadme = readme.toLowerCase();

    const mentionedTech = technologies.filter(tech => lowerReadme.includes(tech));

    expect(mentionedTech.length).toBeGreaterThan(0);
  });

  it('should have license information', () => {
    expect(readme.toLowerCase()).toMatch(/license|agpl/i);
  });

  it('should not have broken markdown links', () => {
    // Extract markdown links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkRegex.exec(readme)) !== null) {
      const [, text, url] = match;

      // Ignore external URLs
      if (url.startsWith('http://') || url.startsWith('https://')) {
        continue;
      }

      // Check if relative path exists
      if (url.startsWith('./') || url.startsWith('../') || !url.includes('://')) {
        const relativePath = url.split('#')[0]; // Remove anchor
        if (relativePath && !relativePath.startsWith('#')) {
          const exists = existsSync(join(projectRoot, relativePath));
          expect(exists).toBe(true);
        }
      }
    }
  });

  it('should have Testing section', () => {
    const headings = extractHeadings(readme);
    const hasTestSection = headings.some(h => /test/i.test(h));

    expect(hasTestSection).toBe(true);
  });

  it('should not be excessively long', () => {
    const lines = readme.split('\n').length;

    // README should be concise (under 200 lines is good)
    expect(lines).toBeLessThan(500);
  });
});

describe('.state/feat/mvp-v1/ADR.md', () => {
  const adr = readMarkdownFile('.state/feat/mvp-v1/ADR.md');

  it('should exist and be non-empty', () => {
    expect(adr.length).toBeGreaterThan(0);
  });

  it('should have ADR structure sections', () => {
    const headings = extractHeadings(adr);
    const requiredSections = ['status', 'context', 'decision', 'consequences'];

    for (const section of requiredSections) {
      const hasSection = headings.some(h => h.toLowerCase().includes(section));
      expect(hasSection).toBe(true);
    }
  });

  it('should document decisions with reasoning', () => {
    expect(adr.toLowerCase()).toMatch(/option|decision|pros|cons|trade-?off/);
  });

  it('should have a status', () => {
    expect(adr.toLowerCase()).toMatch(/status|accepted|proposed|rejected/i);
  });

  it('should be comprehensive', () => {
    const lines = adr.split('\n').length;

    // ADR should be detailed (at least 50 lines)
    expect(lines).toBeGreaterThan(50);
  });
});

describe('.state/feat/mvp-v1/PLAN.md', () => {
  const plan = readMarkdownFile('.state/feat/mvp-v1/PLAN.md');

  it('should exist and be non-empty', () => {
    expect(plan.length).toBeGreaterThan(0);
  });

  it('should have stages or steps', () => {
    expect(plan.toLowerCase()).toMatch(/stage|step|phase|task/);
  });

  it('should have checkboxes or progress indicators', () => {
    expect(plan).toMatch(/\[[ x]\]/);
  });

  it('should reference ADR', () => {
    expect(plan.toLowerCase()).toMatch(/adr|architecture decision/i);
  });

  it('should have file listings or paths', () => {
    // Should mention actual code files
    expect(plan).toMatch(/\.(ts|js|vue|json|sql)/);
  });

  it('should be comprehensive', () => {
    const lines = plan.split('\n').length;

    // Plan should be detailed
    expect(lines).toBeGreaterThan(100);
  });
});

describe('.state/feat/mvp-v1/REQUIREMENTS.md', () => {
  const requirements = readMarkdownFile('.state/feat/mvp-v1/REQUIREMENTS.md');

  it('should exist and be non-empty', () => {
    expect(requirements.length).toBeGreaterThan(0);
  });

  it('should have requirements sections', () => {
    const headings = extractHeadings(requirements);
    const requirementPatterns = ['functional', 'non-functional', 'scope', 'requirements'];

    const hasRequirements = headings.some(h =>
      requirementPatterns.some(p => h.toLowerCase().includes(p))
    );

    expect(hasRequirements).toBe(true);
  });

  it('should document MVP scope', () => {
    expect(requirements.toLowerCase()).toMatch(/mvp|scope|in scope|out of scope/);
  });

  it('should have user stories or acceptance criteria', () => {
    expect(requirements.toLowerCase()).toMatch(/user story|acceptance|criteria/i);
  });

  it('should be comprehensive', () => {
    const lines = requirements.split('\n').length;

    // Requirements should be detailed
    expect(lines).toBeGreaterThan(100);
  });
});

describe('Skill Reference Documentation', () => {
  const referenceFiles = [
    'agents/skills/instructions/references/coding-principles.md',
    'agents/skills/instructions/references/commands.md',
    'agents/skills/instructions/references/design-principles.md',
    'agents/skills/instructions/references/git.md',
    'agents/skills/instructions/references/project.md',
    'agents/skills/instructions/references/sdlc.md',
    'agents/skills/instructions/references/state.md',
    'agents/skills/instructions/references/tdd.md',
  ];

  describe.each(referenceFiles)('%s', (filePath) => {
    it('should exist and be non-empty', () => {
      const content = readMarkdownFile(filePath);
      expect(content.length).toBeGreaterThan(0);
    });

    it('should have at least one heading', () => {
      const content = readMarkdownFile(filePath);
      const headings = extractHeadings(content);

      expect(headings.length).toBeGreaterThan(0);
    });

    it('should have structured content', () => {
      const content = readMarkdownFile(filePath);

      // Should have multiple paragraphs or list items
      const hasLists = content.includes('- ') || content.includes('* ') || content.includes('1. ');
      const hasMultipleParagraphs = content.split('\n\n').length > 2;

      expect(hasLists || hasMultipleParagraphs).toBe(true);
    });
  });

  it('coding-principles.md should document file and function size limits', () => {
    const content = readMarkdownFile('agents/skills/instructions/references/coding-principles.md');

    expect(content).toMatch(/400|lines|file size/i);
    expect(content).toMatch(/20|lines|function/i);
  });

  it('git.md should document workflow and commands', () => {
    const content = readMarkdownFile('agents/skills/instructions/references/git.md');

    expect(content.toLowerCase()).toMatch(/branch|commit|push|pull|pr|merge/);
    expect(content).toMatch(/```/); // Should have code examples
  });

  it('tdd.md should document test-driven development', () => {
    const content = readMarkdownFile('agents/skills/instructions/references/tdd.md');

    expect(content.toLowerCase()).toMatch(/test|red|green|refactor/);
  });

  it('project.md should describe project context', () => {
    const content = readMarkdownFile('agents/skills/instructions/references/project.md');

    expect(content.toLowerCase()).toMatch(/ragts|agent|session|architecture/);
  });
});

describe('agents/skills/instructions/SKILL.md', () => {
  const skillDoc = readMarkdownFile('agents/skills/instructions/SKILL.md');

  it('should exist and be non-empty', () => {
    expect(skillDoc.length).toBeGreaterThan(0);
  });

  it('should reference the references directory', () => {
    expect(skillDoc).toMatch(/references\//);
  });

  it('should document skill loading pattern', () => {
    expect(skillDoc.toLowerCase()).toMatch(/load|read|reference/);
  });

  it('should have a mapping table or list', () => {
    const hasTable = skillDoc.includes('|') && skillDoc.includes('---');
    const hasList = skillDoc.includes('- ');

    expect(hasTable || hasList).toBe(true);
  });
});

describe('Documentation Cross-References', () => {
  it('PLAN.md should reference ADR.md', () => {
    const plan = readMarkdownFile('.state/feat/mvp-v1/PLAN.md');

    expect(plan).toMatch(/ADR\.md/i);
  });

  it('ADR.md should reference REQUIREMENTS.md context', () => {
    const adr = readMarkdownFile('.state/feat/mvp-v1/ADR.md');

    expect(adr.toLowerCase()).toMatch(/requirement|mvp|scope/);
  });

  it('Agent definitions should reference skill instructions', () => {
    const architect = readMarkdownFile('agents/agents/architect.md');

    expect(architect).toMatch(/agents\/skills/);
  });
});

describe('Markdown Quality', () => {
  const docsToCheck = [
    'README.md',
    '.state/feat/mvp-v1/ADR.md',
    '.state/feat/mvp-v1/PLAN.md',
    '.state/feat/mvp-v1/REQUIREMENTS.md',
  ];

  describe.each(docsToCheck)('%s', (filePath) => {
    it('should not have excessive blank lines', () => {
      const content = readMarkdownFile(filePath);

      // No more than 3 consecutive blank lines
      expect(content).not.toMatch(/\n\n\n\n\n/);
    });

    it('should end with a newline', () => {
      const content = readMarkdownFile(filePath);

      expect(content.endsWith('\n')).toBe(true);
    });

    it('should not have trailing whitespace on lines', () => {
      const content = readMarkdownFile(filePath);
      const lines = content.split('\n');

      const linesWithTrailing = lines.filter(line => line !== line.trimEnd());

      // Allow a small number of lines with trailing whitespace
      expect(linesWithTrailing.length).toBeLessThan(lines.length * 0.1);
    });
  });
});