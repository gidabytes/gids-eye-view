/**
 * Keys a phone user pastes into the app (POWER UP dialog), kept on that device.
 *
 * The public APK ships with NO API keys. In APK mode the embedded proxy answers
 * /api/setup/status and /api/setup/keys from here, so the same POWER UP dialog
 * the desktop app uses saves keys on the phone instead of in a .env file.
 * Keys never leave the device except in requests to the provider they belong to.
 */
import { KEY_SETUP_KEYS, keySetupStatus, validateKeySetupUpdates } from '../keySetupCore.mjs';

const STORE = 'gids.deviceKeys.v1';

/**
 * Keys the standalone APK can use, all free tiers. The rest need the desktop
 * server; Google Maps (metered, needs billing) is left out on purpose.
 */
export const DEVICE_KEY_IDS = Object.freeze(['cesium-ion', 'firms', 'tomtom', 'opensky']);

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** All saved device keys as {ENV_VAR: value}. */
export function readDeviceKeys() {
  try {
    const raw = storage()?.getItem(STORE);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** One key: the device copy wins, then a build-time value, else ''. */
export function deviceKey(name, buildValue = '') {
  const saved = readDeviceKeys()[name];
  return typeof saved === 'string' && saved ? saved : buildValue || '';
}

/** POWER UP status for the keys this APK can use. */
export function deviceKeyStatus(buildEnv = {}) {
  const env = { ...buildEnv, ...readDeviceKeys() };
  const status = keySetupStatus(env);
  const keys = status.keys.filter((key) => DEVICE_KEY_IDS.includes(key.id));
  const counted = keys.filter((key) => !key.optional || key.set);
  return { keys, setCount: counted.filter((key) => key.set).length, total: counted.length, store: 'device' };
}

/** True when every variable of key `id` has a value (device or build-time). */
export function hasDeviceKey(id, buildEnv = {}) {
  const entry = KEY_SETUP_KEYS.find((item) => item.id === id);
  return Boolean(entry && entry.envVars.every((name) => deviceKey(name, buildEnv[name])));
}

const pending = new Map();
const DISMISSED = 'gids.keyPrompt.dismissed.';

function wasDismissed(id) {
  try {
    return globalThis.sessionStorage?.getItem(DISMISSED + id) === '1';
  } catch {
    return false;
  }
}

function rememberDismissed(id) {
  try {
    globalThis.sessionStorage?.setItem(DISMISSED + id, '1');
  } catch {
    // not remembering is fine
  }
}

/**
 * Ask the user for the key a feature needs, right when the feature asks for it.
 * Resolves true when the key was saved, false when the user chose "Not now"
 * (not asked again until the app restarts) or there is no screen to ask on.
 * @param {string} id key id from KEY_SETUP_KEYS, e.g. 'firms'
 */
export function promptForKey(id, buildEnv = {}) {
  if (hasDeviceKey(id, buildEnv)) return Promise.resolve(true);
  const doc = globalThis.document;
  const entry = KEY_SETUP_KEYS.find((item) => item.id === id);
  if (!doc?.body || !entry || wasDismissed(id)) return Promise.resolve(false);
  if (pending.has(id)) return pending.get(id);

  const promise = new Promise((resolve) => {
    const overlay = doc.createElement('div');
    overlay.className = 'gids-key-prompt';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `${entry.title} key needed`);
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,8,14,.72);padding:16px;font-family:Inter,system-ui,sans-serif';
    const card = doc.createElement('form');
    card.noValidate = true;
    card.style.cssText =
      'width:min(420px,100%);background:#06141c;color:#dff6ff;border:1px solid #1fb6d6;border-radius:14px;' +
      'padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.6)';
    const kicker = doc.createElement('div');
    kicker.textContent = 'API KEY NEEDED';
    kicker.style.cssText = 'font:600 11px/1.4 "JetBrains Mono",monospace;letter-spacing:.14em;color:#4fd8f3';
    const title = doc.createElement('h2');
    title.textContent = entry.title;
    title.style.cssText = 'margin:6px 0 4px;font:600 20px/1.3 "JetBrains Mono",monospace;letter-spacing:.06em';
    const why = doc.createElement('p');
    why.textContent = `${entry.unlocks}. Paste your own ${entry.tier === 'free' ? 'free ' : ''}key; it is saved only on this phone.`;
    why.style.cssText = 'margin:0 0 10px;font-size:14px;line-height:1.45;color:#a9cbd8';
    const link = doc.createElement('a');
    link.href = entry.getUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `Get a key at ${new URL(entry.getUrl).hostname} ↗`;
    link.style.cssText = 'display:inline-block;margin-bottom:12px;color:#4fd8f3;font-size:14px';
    card.append(kicker, title, why, link);

    const inputs = entry.envVars.map((name) => {
      const label = doc.createElement('label');
      label.textContent = name;
      label.style.cssText = 'display:block;margin:6px 0 4px;font:500 11px/1.3 "JetBrains Mono",monospace;color:#7fb3c4';
      const input = doc.createElement('input');
      input.type = 'password';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.dataset.envVar = name;
      input.placeholder = 'Paste key';
      input.style.cssText =
        'width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #2b5566;' +
        'background:#020b10;color:#e8fbff;font:14px "JetBrains Mono",monospace';
      card.append(label, input);
      return input;
    });

    const message = doc.createElement('div');
    message.setAttribute('aria-live', 'polite');
    message.style.cssText = 'min-height:18px;margin-top:8px;font-size:13px;color:#ffb4a8';
    const row = doc.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:8px';
    const later = doc.createElement('button');
    later.type = 'button';
    later.textContent = 'Not now';
    const save = doc.createElement('button');
    save.type = 'submit';
    save.textContent = 'Save key';
    for (const button of [later, save]) {
      button.style.cssText =
        'min-height:44px;padding:0 16px;border-radius:8px;font:600 13px "JetBrains Mono",monospace;cursor:pointer;' +
        'border:1px solid #1fb6d6;background:transparent;color:#bdefff';
    }
    save.style.background = '#1fb6d6';
    save.style.color = '#02141b';
    row.append(later, save);
    card.append(message, row);
    overlay.append(card);
    doc.body.append(overlay);
    inputs[0]?.focus?.();

    const finish = (saved) => {
      overlay.remove();
      pending.delete(id);
      resolve(saved);
    };
    later.addEventListener('click', () => {
      rememberDismissed(id);
      finish(false);
    });
    card.addEventListener('submit', (event) => {
      event.preventDefault();
      const body = {};
      for (const input of inputs) body[input.dataset.envVar] = input.value;
      const result = saveDeviceKeys(body, buildEnv);
      if (!result.ok) {
        message.textContent = result.error;
        return;
      }
      finish(true);
    });
  });
  pending.set(id, promise);
  return promise;
}

/**
 * Save keys from a POWER UP POST body. null removes a key.
 * @returns {{ok: true, saved: string[], status: object} | {ok: false, error: string}}
 */
export function saveDeviceKeys(body, buildEnv = {}) {
  const allowed = new Set(
    KEY_SETUP_KEYS.filter((entry) => DEVICE_KEY_IDS.includes(entry.id)).flatMap((entry) => entry.envVars),
  );
  const result = validateKeySetupUpdates(body);
  if (!result?.ok) return { ok: false, error: result?.error || 'Those keys could not be read.' };
  const updates = result.updates || {};
  const unsupported = Object.keys(updates).filter((name) => !allowed.has(name));
  if (unsupported.length) {
    return { ok: false, error: `Not used by the phone app: ${unsupported.join(', ')}` };
  }
  const next = readDeviceKeys();
  for (const [name, value] of Object.entries(updates)) {
    if (value === null) delete next[name];
    else next[name] = value;
  }
  const store = storage();
  if (!store) return { ok: false, error: 'This device does not allow saving keys.' };
  store.setItem(STORE, JSON.stringify(next));
  return { ok: true, saved: Object.keys(updates), status: deviceKeyStatus(buildEnv) };
}
