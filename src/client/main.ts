import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

/* Design system CSS — import order matters:
   1. layout.css  — tokens, reset, grid utilities
   2. page.css    — page scaffold classes
   3. components.css — component styles
   4. fonts.css   — self-hosted Geist @font-face declarations
   5. app_overrides.css — Vue-specific overrides (loaded last) */
import '../../design/styles/layout.css';
import '../../design/styles/page.css';
import '../../design/styles/components.css';
import './styles/fonts.css';
import './styles/app_overrides.css';

/* Terminal ANSI color palette — must load after design system
   to ensure terminal-specific colors are not overridden */
import './styles/terminal-colors.css';

const app = createApp(App);

app.use(router);

app.mount('#app');
