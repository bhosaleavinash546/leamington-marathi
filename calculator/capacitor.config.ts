import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.leamington.costvision',
  appName: 'CostVision',
  webDir: 'dist',
  /*
   * During development, point the WebView at your local Vite dev server.
   * For production builds remove (or comment out) the `server` block so the
   * app bundles from the `dist/` folder.
   *
   * Replace the IP below with your machine's LAN IP when testing on a device:
   *   macOS: `ipconfig getifaddr en0`
   *   Windows: `ipconfig`
   */
  server: {
    url: 'http://192.168.1.100:5174',   // ← replace with your dev machine's LAN IP
    cleartext: true,                     // allow HTTP on Android (dev only)
  },
  android: {
    buildOptions: {
      keystorePath: 'android/app/costvision.jks',
      keystoreAlias: 'costvision',
    },
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0e1525',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0e1525',
      showSpinner: false,
    },
  },
};

export default config;
