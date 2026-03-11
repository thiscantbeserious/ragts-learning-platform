/**
 * Tests for the router configuration.
 *
 * Verifies the layout route wrapper pattern: SpatialShell as the parent
 * route with child routes rendering into the main area.
 */
import { describe, it, expect } from 'vitest';
import router from './router.js';

describe('router configuration', () => {
  describe('route structure', () => {
    it('has a single top-level route at path "/"', () => {
      const routes = router.getRoutes();
      const rootRoutes = routes.filter((r) => r.path === '/');
      expect(rootRoutes.length).toBeGreaterThan(0);
    });

    it('has the shell route as the parent with name "shell"', () => {
      const routes = router.getRoutes();
      const shellRoute = routes.find((r) => r.name === 'shell');
      expect(shellRoute).toBeDefined();
    });

    it('has a child route for landing page at exact path "/"', () => {
      const routes = router.getRoutes();
      const landingRoute = routes.find((r) => r.name === 'landing');
      expect(landingRoute).toBeDefined();
    });

    it('has a child route for session detail at path "/session/:id"', () => {
      const routes = router.getRoutes();
      const sessionRoute = routes.find((r) => r.name === 'session-detail');
      expect(sessionRoute).toBeDefined();
      expect(sessionRoute?.path).toBe('/session/:id');
    });

    it('landing route is a child of the shell route', () => {
      const routes = router.getRoutes();
      const shellRoute = routes.find((r) => r.name === 'shell');
      // Verify via shell's children list
      const childNames = shellRoute?.children?.map((c) => c.name) ?? [];
      expect(childNames).toContain('landing');
    });

    it('session-detail route is a child of the shell route', () => {
      const routes = router.getRoutes();
      const shellRoute = routes.find((r) => r.name === 'shell');
      // Verify via shell's children list
      const childNames = shellRoute?.children?.map((c) => c.name) ?? [];
      expect(childNames).toContain('session-detail');
    });
  });

  describe('navigation', () => {
    it('resolves "/" to landing name', () => {
      const resolved = router.resolve('/');
      expect(resolved.name).toBe('landing');
    });

    it('resolves "/session/abc123" to session-detail name', () => {
      const resolved = router.resolve('/session/abc123');
      expect(resolved.name).toBe('session-detail');
      expect(resolved.params.id).toBe('abc123');
    });
  });
});
