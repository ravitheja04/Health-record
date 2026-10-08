// Adds build-time settings to app.json. The Google keys for family sync come
// from GitHub secrets in the APK build (see docs/google-drive-setup.md); builds
// without them still work, with family sync showing how to turn it on.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    googleApiKey: process.env.GOOGLE_API_KEY ?? '',
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? '',
  },
});
