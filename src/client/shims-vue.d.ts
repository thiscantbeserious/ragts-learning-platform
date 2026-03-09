/**
 * Module declarations for Vue single-file components.
 * Required so TypeScript can resolve .vue imports.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
