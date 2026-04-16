import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sevenrandoms.interview',
  appName: '7RANDOMS 인터뷰',
  webDir: 'out',
  server: {
    url: 'https://pro-keirin.vercel.app/interview',
    cleartext: false,
  },
  android: {
    allowNavigation: ['pro-keirin.vercel.app'],
  },
};

export default config;
