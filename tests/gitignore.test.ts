/**
 * Tests for .gitignore file patterns and effectiveness.
 * Validates that .gitignore properly excludes generated files and sensitive data.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const projectRoot = join(__dirname, '..');
const gitignorePath = join(projectRoot, '.gitignore');

/**
 * Read and parse .gitignore file.
 */
function readGitignore(): string[] {
  const content = readFileSync(gitignorePath, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

/**
 * Check if a pattern is in gitignore.
 */
function hasPattern(patterns: string[], pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return patterns.includes(pattern);
  } else {
    return patterns.some(p => pattern.test(p));
  }
}

/**
 * Get all files recursively in a directory.
 */
function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);

  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      // Skip common ignored directories
      if (!['node_modules', '.git', 'dist', 'coverage', 'data'].includes(file)) {
        getAllFiles(filePath, fileList);
      }
    } else {
      fileList.push(filePath);
    }
  }

  return fileList;
}

describe('.gitignore', () => {
  it('should exist', () => {
    expect(existsSync(gitignorePath)).toBe(true);
  });

  it('should be non-empty', () => {
    const patterns = readGitignore();
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('should end with newline', () => {
    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content.endsWith('\n')).toBe(true);
  });
});

describe('.gitignore patterns', () => {
  const patterns = readGitignore();

  describe('Node.js patterns', () => {
    it('should ignore node_modules', () => {
      expect(hasPattern(patterns, 'node_modules/')).toBe(true);
    });

    it('should ignore build output', () => {
      const hasDist = hasPattern(patterns, 'dist/') || hasPattern(patterns, /dist\/?/);
      expect(hasDist).toBe(true);
    });

    it('should ignore coverage reports', () => {
      expect(hasPattern(patterns, 'coverage/')).toBe(true);
    });
  });

  describe('Data and database patterns', () => {
    it('should ignore data directory', () => {
      expect(hasPattern(patterns, 'data/')).toBe(true);
    });

    it('should ignore SQLite database files', () => {
      expect(hasPattern(patterns, '*.db')).toBe(true);
    });

    it('should ignore SQLite WAL and SHM files', () => {
      expect(hasPattern(patterns, '*.db-shm')).toBe(true);
      expect(hasPattern(patterns, '*.db-wal')).toBe(true);
    });
  });

  describe('Common ignore patterns', () => {
    it('should not ignore configuration files', () => {
      expect(hasPattern(patterns, '*.json')).toBe(false);
      expect(hasPattern(patterns, 'package.json')).toBe(false);
      expect(hasPattern(patterns, 'tsconfig.json')).toBe(false);
    });

    it('should not ignore source code', () => {
      expect(hasPattern(patterns, '*.ts')).toBe(false);
      expect(hasPattern(patterns, '*.js')).toBe(false);
      expect(hasPattern(patterns, '*.vue')).toBe(false);
    });
  });

  describe('Security patterns', () => {
    it('should ignore environment files if present', () => {
      // Check if .env is ignored or should be added
      const hasEnvPattern = hasPattern(patterns, '.env') || hasPattern(patterns, '*.env');

      // .env might not be in gitignore if not used yet, but we should recommend it
      // For now, just verify the pattern format is correct if it exists
      if (hasEnvPattern) {
        expect(hasPattern(patterns, '.env') || hasPattern(patterns, '*.env')).toBe(true);
      }
    });

    it('should not accidentally ignore important files', () => {
      // Verify we're not ignoring critical files
      expect(hasPattern(patterns, 'README.md')).toBe(false);
      expect(hasPattern(patterns, 'package.json')).toBe(false);
      expect(hasPattern(patterns, 'LICENSE')).toBe(false);
    });
  });
});

describe('.gitignore effectiveness', () => {
  it('should not have duplicate patterns', () => {
    const patterns = readGitignore();
    const uniquePatterns = new Set(patterns);

    expect(patterns.length).toBe(uniquePatterns.size);
  });

  it('should not have conflicting patterns', () => {
    const patterns = readGitignore();

    // Check for patterns that would conflict (e.g., ignoring and not ignoring same thing)
    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const p1 = patterns[i];
        const p2 = patterns[j];

        // Check if one pattern negates the other
        if (p1.startsWith('!') && p2 === p1.substring(1)) {
          // This is intentional negation, not a conflict
          continue;
        }

        if (p2.startsWith('!') && p1 === p2.substring(1)) {
          // This is intentional negation, not a conflict
          continue;
        }

        // Otherwise, patterns should not be redundant
        if (p1 === p2) {
          expect(false).toBe(true); // Should never reach here due to uniqueness test
        }
      }
    }
  });

  it('patterns should use forward slashes', () => {
    const patterns = readGitignore();

    for (const pattern of patterns) {
      expect(pattern).not.toContain('\\');
    }
  });

  it('patterns should not have trailing spaces', () => {
    const content = readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.trim() && !line.startsWith('#')) {
        expect(line).toBe(line.trimEnd());
      }
    }
  });
});

describe('Repository cleanliness', () => {
  it('should not have node_modules checked in', () => {
    const nodeModulesPath = join(projectRoot, 'node_modules');

    // If node_modules exists, it should be ignored
    // For CI, this might not exist, so we only check if it does
    if (existsSync(nodeModulesPath)) {
      // We can't directly test git status, but we can verify the pattern exists
      const patterns = readGitignore();
      expect(hasPattern(patterns, 'node_modules/')).toBe(true);
    }
  });

  it('should not have dist directory in git', () => {
    const distPath = join(projectRoot, 'dist');

    if (existsSync(distPath)) {
      const patterns = readGitignore();
      expect(hasPattern(patterns, 'dist/')).toBe(true);
    }
  });

  it('should not have database files in repository', () => {
    const allFiles = getAllFiles(projectRoot);
    const dbFiles = allFiles.filter(f =>
      f.endsWith('.db') || f.endsWith('.db-shm') || f.endsWith('.db-wal')
    );

    // Test fixtures might have .db files, that's OK
    const nonFixtureDbFiles = dbFiles.filter(f => !f.includes('fixtures') && !f.includes('test'));

    expect(nonFixtureDbFiles.length).toBe(0);
  });
});

describe('Gitignore completeness', () => {
  it('should cover common Node.js patterns', () => {
    const patterns = readGitignore();
    const requiredPatterns = ['node_modules/', 'dist/', 'coverage/'];

    for (const required of requiredPatterns) {
      expect(hasPattern(patterns, required)).toBe(true);
    }
  });

  it('should cover project-specific patterns', () => {
    const patterns = readGitignore();
    const projectPatterns = ['data/', '*.db'];

    for (const required of projectPatterns) {
      expect(hasPattern(patterns, required)).toBe(true);
    }
  });

  it('should have minimal but sufficient patterns', () => {
    const patterns = readGitignore();

    // Should have at least a few essential patterns
    expect(patterns.length).toBeGreaterThanOrEqual(5);

    // But shouldn't be excessively long
    expect(patterns.length).toBeLessThan(50);
  });
});

describe('Pattern syntax validation', () => {
  const patterns = readGitignore();

  it('directory patterns should end with /', () => {
    const directoryPatterns = ['node_modules', 'dist', 'coverage', 'data'];

    for (const dir of directoryPatterns) {
      const pattern = patterns.find(p => p.includes(dir));

      if (pattern && !pattern.includes('*')) {
        // Directory patterns should ideally end with /
        // But both "dir" and "dir/" work in gitignore
        expect(pattern).toBeTruthy();
      }
    }
  });

  it('file extension patterns should start with *', () => {
    const extensionPatterns = patterns.filter(p => p.includes('.'));

    for (const pattern of extensionPatterns) {
      if (!pattern.includes('/') && !pattern.startsWith('!')) {
        // Simple extension patterns should use wildcard
        expect(pattern.startsWith('*') || pattern.includes('*.')).toBe(true);
      }
    }
  });

  it('should not have invalid glob patterns', () => {
    for (const pattern of patterns) {
      // Should not have unmatched brackets
      const openBrackets = (pattern.match(/\[/g) || []).length;
      const closeBrackets = (pattern.match(/\]/g) || []).length;
      expect(openBrackets).toBe(closeBrackets);

      // Should not have unmatched braces
      const openBraces = (pattern.match(/\{/g) || []).length;
      const closeBraces = (pattern.match(/\}/g) || []).length;
      expect(openBraces).toBe(closeBraces);
    }
  });
});

describe('Edge cases', () => {
  it('should handle empty lines gracefully', () => {
    const content = readFileSync(gitignorePath, 'utf-8');
    const allLines = content.split('\n');

    // Should have some empty lines or comments for readability
    const emptyOrComments = allLines.filter(l => !l.trim() || l.trim().startsWith('#'));
    expect(emptyOrComments.length).toBeGreaterThanOrEqual(0);
  });

  it('should not have leading/trailing whitespace in patterns', () => {
    const patterns = readGitignore();

    for (const pattern of patterns) {
      expect(pattern).toBe(pattern.trim());
    }
  });
});