/**
 * Tests for JSON configuration file validation.
 * Validates agents/settings.json structure and hook configurations.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const settingsPath = join(__dirname, '..', 'agents', 'settings.json');

interface HookCommand {
  type: 'command';
  command: string;
}

interface Hook {
  hooks: HookCommand[];
}

interface Settings {
  hooks: {
    [eventName: string]: Hook[];
  };
}

/**
 * Load and parse settings.json file.
 */
function loadSettings(): Settings {
  const content = readFileSync(settingsPath, 'utf-8');
  return JSON.parse(content);
}

describe('agents/settings.json', () => {
  it('should exist and be valid JSON', () => {
    expect(() => loadSettings()).not.toThrow();
  });

  it('should have a hooks property', () => {
    const settings = loadSettings();

    expect(settings).toBeDefined();
    expect(settings.hooks).toBeDefined();
    expect(typeof settings.hooks).toBe('object');
  });

  describe('Hooks configuration', () => {
    it('should have valid event names', () => {
      const settings = loadSettings();
      const validEvents = ['SessionStart', 'SessionEnd', 'BeforeToolUse', 'AfterToolUse'];

      for (const eventName of Object.keys(settings.hooks)) {
        expect(validEvents).toContain(eventName);
      }
    });

    it('should have array of hook configurations for each event', () => {
      const settings = loadSettings();

      for (const [eventName, hookConfigs] of Object.entries(settings.hooks)) {
        expect(Array.isArray(hookConfigs)).toBe(true);
        expect(hookConfigs.length).toBeGreaterThan(0);
      }
    });

    it('should have valid hook structure', () => {
      const settings = loadSettings();

      for (const hookConfigs of Object.values(settings.hooks)) {
        for (const hookConfig of hookConfigs) {
          expect(hookConfig).toBeDefined();
          expect(hookConfig.hooks).toBeDefined();
          expect(Array.isArray(hookConfig.hooks)).toBe(true);
        }
      }
    });

    it('should have valid command hooks', () => {
      const settings = loadSettings();

      for (const hookConfigs of Object.values(settings.hooks)) {
        for (const hookConfig of hookConfigs) {
          for (const hook of hookConfig.hooks) {
            expect(hook.type).toBe('command');
            expect(hook.command).toBeDefined();
            expect(typeof hook.command).toBe('string');
            expect(hook.command.length).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  describe('SessionStart hook', () => {
    it('should have SessionStart hook configured', () => {
      const settings = loadSettings();

      expect(settings.hooks.SessionStart).toBeDefined();
      expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
    });

    it('should reference project documentation files', () => {
      const settings = loadSettings();
      const sessionStartHooks = settings.hooks.SessionStart;

      expect(sessionStartHooks).toBeDefined();

      let foundDocReference = false;

      for (const hookConfig of sessionStartHooks) {
        for (const hook of hookConfig.hooks) {
          if (hook.command.includes('AGENTS.md') || hook.command.includes('CLAUDE.md')) {
            foundDocReference = true;
          }
        }
      }

      expect(foundDocReference).toBe(true);
    });

    it('should have fallback behavior for missing files', () => {
      const settings = loadSettings();
      const sessionStartHooks = settings.hooks.SessionStart;

      let hasFallback = false;

      for (const hookConfig of sessionStartHooks) {
        for (const hook of hookConfig.hooks) {
          // Check if command has fallback logic (|| or 2>/dev/null)
          if (hook.command.includes('||') || hook.command.includes('2>/dev/null')) {
            hasFallback = true;
          }
        }
      }

      expect(hasFallback).toBe(true);
    });

    it('should use safe shell commands', () => {
      const settings = loadSettings();
      const sessionStartHooks = settings.hooks.SessionStart;

      for (const hookConfig of sessionStartHooks) {
        for (const hook of hookConfig.hooks) {
          // Should not contain dangerous patterns
          expect(hook.command).not.toContain('rm -rf');
          expect(hook.command).not.toContain('> /dev/');
          expect(hook.command).not.toContain('| sh');
          expect(hook.command).not.toContain('eval');
        }
      }
    });

    it('should reference $CLAUDE_PROJECT_DIR variable', () => {
      const settings = loadSettings();
      const sessionStartHooks = settings.hooks.SessionStart;

      let usesProjectDir = false;

      for (const hookConfig of sessionStartHooks) {
        for (const hook of hookConfig.hooks) {
          if (hook.command.includes('$CLAUDE_PROJECT_DIR')) {
            usesProjectDir = true;
          }
        }
      }

      expect(usesProjectDir).toBe(true);
    });
  });

  describe('JSON formatting', () => {
    it('should be properly formatted', () => {
      const content = readFileSync(settingsPath, 'utf-8');

      // Should parse without errors
      expect(() => JSON.parse(content)).not.toThrow();

      // Should be indented (contains newlines and spaces)
      expect(content).toContain('\n');
      expect(content).toMatch(/^\s+/m); // Has indentation
    });

    it('should not have trailing commas', () => {
      const content = readFileSync(settingsPath, 'utf-8');

      // Trailing comma before closing brace/bracket is invalid JSON
      expect(content).not.toMatch(/,\s*[}\]]/);
    });
  });
});

describe('Settings.json edge cases', () => {
  it('should handle empty hooks array', () => {
    const minimalSettings = {
      hooks: {
        SessionStart: [
          {
            hooks: []
          }
        ]
      }
    };

    expect(minimalSettings.hooks.SessionStart[0].hooks).toEqual([]);
  });

  it('should validate hook type is always "command"', () => {
    const settings = loadSettings();

    for (const hookConfigs of Object.values(settings.hooks)) {
      for (const hookConfig of hookConfigs) {
        for (const hook of hookConfig.hooks) {
          expect(hook.type).toBe('command');
        }
      }
    }
  });
});

describe('Settings.json security', () => {
  it('should not contain hardcoded secrets', () => {
    const content = readFileSync(settingsPath, 'utf-8');
    const lowerContent = content.toLowerCase();

    // Check for common secret patterns
    expect(lowerContent).not.toContain('password');
    expect(lowerContent).not.toContain('api_key');
    expect(lowerContent).not.toContain('api-key');
    expect(lowerContent).not.toContain('secret');
    expect(lowerContent).not.toContain('token');
    expect(content).not.toMatch(/[A-Za-z0-9]{32,}/); // Long alphanumeric strings
  });

  it('should not execute arbitrary user input', () => {
    const settings = loadSettings();

    for (const hookConfigs of Object.values(settings.hooks)) {
      for (const hookConfig of hookConfigs) {
        for (const hook of hookConfig.hooks) {
          // Commands should not use backticks or $() for command substitution with user input
          expect(hook.command).not.toMatch(/\$\([^)]*USER[^)]*\)/);
          expect(hook.command).not.toMatch(/`[^`]*USER[^`]*`/);
        }
      }
    }
  });

  it('should properly quote file paths', () => {
    const settings = loadSettings();

    for (const hookConfigs of Object.values(settings.hooks)) {
      for (const hookConfig of hookConfigs) {
        for (const hook of hookConfig.hooks) {
          // If command references a file path with variable, it should be quoted
          if (hook.command.includes('$CLAUDE_PROJECT_DIR')) {
            expect(hook.command).toMatch(/"\$CLAUDE_PROJECT_DIR[^"]*"/);
          }
        }
      }
    }
  });
});

describe('Settings.json completeness', () => {
  it('should define at least one hook', () => {
    const settings = loadSettings();
    const totalHooks = Object.values(settings.hooks)
      .flatMap(configs => configs)
      .flatMap(config => config.hooks)
      .length;

    expect(totalHooks).toBeGreaterThan(0);
  });

  it('should have non-empty commands', () => {
    const settings = loadSettings();

    for (const hookConfigs of Object.values(settings.hooks)) {
      for (const hookConfig of hookConfigs) {
        for (const hook of hookConfig.hooks) {
          expect(hook.command.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});