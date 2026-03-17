/**
 * Toolbar collapse context — shared injection key and interface for the
 * collapse/expand feature. Extracted to a plain .ts file so TypeScript
 * can resolve the named exports (Vue SFC *.vue shim does not expose them).
 */
import type { InjectionKey, Ref } from 'vue';

export interface ToolbarCollapseContext {
  /** Whether the toolbar pill is currently collapsed. */
  isCollapsed: Readonly<Ref<boolean>>;
  /** Toggles the collapsed state. */
  toggleCollapse: () => void;
}

/** Injection key for the toolbar collapse context. */
export const toolbarCollapseKey: InjectionKey<ToolbarCollapseContext> = Symbol('toolbarCollapse');
