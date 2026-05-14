import { createApp } from 'vue';
import NowPlaying from './NowPlaying.vue';

const container = document.createElement('div');
container.id = 'tracklit-root';
document.body.appendChild(container);

createApp(NowPlaying).mount('#tracklit-root');
