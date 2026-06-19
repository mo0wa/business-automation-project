import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 포트/백엔드 대상을 환경변수로 교체 가능
//  - 운영(기본): FE_PORT=3000, API_TARGET=http://localhost:5000
//  - 데모:       FE_PORT=3001, API_TARGET=http://localhost:5001
const FE_PORT = Number(process.env.FE_PORT) || 3000;
const API_TARGET = process.env.API_TARGET || 'http://localhost:5000';
const IS_DEMO = process.env.IS_DEMO === 'true';

export default defineConfig({
  plugins: [react()],
  // 데모 실행(IS_DEMO=true) 시에만 true로 치환되어 코드에서 분기 가능
  define: {
    __IS_DEMO__: JSON.stringify(IS_DEMO),
  },
  server: {
    host: '0.0.0.0',
    port: FE_PORT,
    allowedHosts: ['mo0watest.iptime.org'],
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/uploads': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
