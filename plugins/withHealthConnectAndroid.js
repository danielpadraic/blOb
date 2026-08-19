const { createRunOncePlugin, withAndroidManifest } = require('@expo/config-plugins');

const HEALTH_CONNECT_PACKAGE = 'com.google.android.apps.healthdata';
const RATIONALE_ACTION = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';

function ensureQueries(manifest) {
  if (!manifest.queries) {
    manifest.queries = [{}];
  }
  const queries = manifest.queries[0];
  if (!queries.package) {
    queries.package = [];
  }
  const hasPackage = queries.package.some(
    (entry) => entry.$?.['android:name'] === HEALTH_CONNECT_PACKAGE,
  );
  if (!hasPackage) {
    queries.package.push({ $: { 'android:name': HEALTH_CONNECT_PACKAGE } });
  }
  if (!queries.intent) {
    queries.intent = [];
  }
  const hasRationale = queries.intent.some((entry) =>
    (entry.action || []).some((action) => action.$?.['android:name'] === RATIONALE_ACTION),
  );
  if (!hasRationale) {
    queries.intent.push({
      action: [{ $: { 'android:name': RATIONALE_ACTION } }],
    });
  }
  return manifest;
}

const withHealthConnectAndroid = (config) =>
  withAndroidManifest(config, (config) => {
    ensureQueries(config.modResults.manifest);
    return config;
  });

module.exports = createRunOncePlugin(
  withHealthConnectAndroid,
  'withHealthConnectAndroid',
  '1.0.0',
);
