import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'MomCare',
  webDir: 'www',
  // Native and web-console logs only in debug builds, never in a release
  // build (it can leak information on the device). This is Capacitor's
  // default, stated here so it can't change silently. WebView debugging
  // (chrome://inspect) is left at its default: on for debug builds only.
  loggingBehavior: 'debug',
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: "#fce4ec",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    }
  }
};

export default config;