import test from 'node:test';
import assert from 'node:assert/strict';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();

const { deviceKey, deviceKeyStatus, hasDeviceKey, promptForKey, readDeviceKeys, saveDeviceKeys } =
  await import('./deviceKeys.js');

test('a key saved on the phone wins over a build-time value', () => {
  assert.equal(deviceKey('FIRMS_MAP_KEY', 'from-build'), 'from-build');
  const result = saveDeviceKeys({ FIRMS_MAP_KEY: 'abcdef1234567890' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.saved, ['FIRMS_MAP_KEY']);
  assert.equal(deviceKey('FIRMS_MAP_KEY', 'from-build'), 'abcdef1234567890');
  assert.equal(hasDeviceKey('firms'), true);
});

test('status lists only keys the phone app can use, stored on the device', () => {
  const status = deviceKeyStatus();
  assert.equal(status.store, 'device');
  assert.deepEqual(
    status.keys.map((k) => k.id).sort(),
    ['cesium-ion', 'firms', 'opensky', 'tomtom'],
  );
  assert.equal(status.keys.find((k) => k.id === 'firms').set, true);
  assert.ok(!JSON.stringify(status).includes('abcdef1234567890'), 'status never carries a key value');
});

test('keys the phone cannot use are refused, bad values are explained', () => {
  assert.equal(saveDeviceKeys({ GEMINI_API_KEY: 'abcdef1234567890' }).ok, false);
  assert.match(saveDeviceKeys({ TOMTOM_API_KEY: '' }).error, /empty/);
  assert.match(saveDeviceKeys({ TOMTOM_API_KEY: 'has space' }).error, /no spaces/);
});

test('null removes a saved key', () => {
  saveDeviceKeys({ FIRMS_MAP_KEY: null });
  assert.equal(readDeviceKeys().FIRMS_MAP_KEY, undefined);
  assert.equal(hasDeviceKey('firms'), false);
});

test('without a screen the prompt declines instead of hanging', async () => {
  assert.equal(await promptForKey('tomtom'), false);
});

test('a key that is already present needs no prompt', async () => {
  saveDeviceKeys({ TOMTOM_API_KEY: 'tomtomkey123456' });
  assert.equal(await promptForKey('tomtom'), true);
});
