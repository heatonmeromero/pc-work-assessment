import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// singlefile: 全アセットを index.html に内包し、file:// 直開きで動作させる
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2019',
  },
});
