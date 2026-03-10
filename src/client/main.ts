import '../../design/styles/layout.css';
import '../../design/styles/components.css';
import '../../design/styles/page.css';
import '../../design/styles/icons.css';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

const app = createApp(App);

app.use(router);

app.mount('#app');
