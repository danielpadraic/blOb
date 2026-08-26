const appJson = require('./app.json');

function iosUrlSchemeFromClientId(clientId) {
  const prefix = String(clientId ?? '')
    .trim()
    .replace(/\.apps\.googleusercontent\.com$/i, '');
  if (!prefix || prefix.includes('://') || prefix === String(clientId ?? '').trim()) {
    return null;
  }
  return `com.googleusercontent.apps.${prefix}`;
}

function withoutGoogleSignInPlugin(plugins) {
  return (plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== '@react-native-google-signin/google-signin';
  });
}

const iosUrlScheme =
  iosUrlSchemeFromClientId(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) ??
  'com.googleusercontent.apps.49251028054-54pin15flhs2uhhtqhnjkblmdte62bka';

module.exports = {
  expo: {
    ...appJson.expo,
    plugins: [
      ...withoutGoogleSignInPlugin(appJson.expo.plugins),
      ['@react-native-google-signin/google-signin', { iosUrlScheme }],
    ],
  },
};
