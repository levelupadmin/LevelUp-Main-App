import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "club.levelup.app",
  appName: "LevelUp",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidSplashResourceName: "splash",
      iosSplashStoryboard: "LaunchScreen",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0a",
    },
  },
};

export default config;
