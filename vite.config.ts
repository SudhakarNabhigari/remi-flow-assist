import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "vercel",
    runtimeConfig: {
      rimeApiKey: "",
      rimeEndpoint: "",
      rimeModel: "",
      rimeSpeaker: "",
      rimeLanguage: "",
      rimeRegion: "",
      rimeAudioFormat: "",
      rimeTransport: "",
    },
  },
});
