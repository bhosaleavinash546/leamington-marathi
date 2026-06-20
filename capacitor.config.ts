import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.brainspark.automotive',
  appName: 'BrainSpark',
  webDir: 'dist',
  server: {
    // When the app runs on a real device, it loads from the bundled dist/.
    // The user configures their BrainSpark server URL in Settings.
    androidScheme: 'https',
    allowNavigation: ['*'],
  },
  plugins: {
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#07111e',
      overlaysWebView: false,
    },
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#07111e',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK',
    },
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    backgroundColor: '#07111e',
  },
};

export default config;
