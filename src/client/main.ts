// layout.css is loaded as a blocking <link> in index.html — do not re-import here.
import '../../design/styles/components.css';
import '../../design/styles/page.css';
import '../../design/styles/icons.css';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

const app = createApp(App);

app.use(router);

app.mount('#app');
