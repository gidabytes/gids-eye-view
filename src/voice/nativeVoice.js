// GEV-VOICE v52 — Google speech recognition bound to the Gids Eye View mic,
// running hidden in the background (no Google popup).
//
// How it works (Android, @capgo/capacitor-speech-recognition 8.x):
//  * The native side creates its SpeechRecognizer on Google's recognition
//    service (see GevRecognizer.java, patched in by gids-android.sh), so the
//    GEV mic always talks to Google even if the phone's default is another
//    vendor's engine.
//  * With partialResults:true, words arrive as 'partialResults' events and the
//    final hypothesis arrives as one more 'partialResults' event; start()
//    resolves as soon as listening has begun, stop() returns no text.
//  * Errors arrive as an 'error' event {code,message,sessionId}; the session end
//    arrives as 'listeningState' {state:'stopped', sessionId, reason, errorCode}.
//
// Speed: we decide "you've finished speaking" ourselves from the partials
// (700 ms after a complete-sounding command, 1.3 s otherwise) instead of
// waiting for Android's own end-of-speech timer, and we hand the text over
// before the native recognizer has finished shutting down.
import { registerPlugin } from '@capacitor/core';
const SpeechRecognition = registerPlugin('SpeechRecognition');

export function isNativeVoiceAvailable() {
  return Boolean(globalThis.window?.Capacitor?.isNativePlatform?.());
}

export const QUICK_SILENCE_MS = 700; // "fly to Cebu" — sounds complete
export const SILENCE_MS = 1300; // "fly to …" — may still be mid-phrase
const NO_SPEECH_MS = 8000; // nothing heard at all
const EARLY_END_MS = 1500; // recognizer quit this fast without text = glitch, retry quietly

// words a command does not end on
const DANGLING = new Set(('to the a an of in on at for from near me my and or go fly take show find ' +
  'zoom navigate head travel search look locate where is what turn switch enable disable hey please').split(' '));
export function looksComplete(text) {
  const w = String(text || '').trim().toLowerCase().replace(/[.!?,]+$/, '').split(/\s+/).filter(Boolean);
  return w.length >= 2 && !DANGLING.has(w[w.length - 1]);
}

// Map native / plugin errors to what we do about them.
export function classifyVoiceError(err) {
  const s = `${err?.code || ''} ${err?.errorCode || ''} ${err?.message || err || ''}`;
  if (/INSUFFICIENT_PERMISSIONS|permission|not-allowed|denied/i.test(s)) return 'fatal';
  if (/not available|unavailable|No speech recognition service/i.test(s)) return 'fatal';
  if (/NETWORK|SERVER|network/i.test(s)) return 'network';
  if (/BUSY|already running|CLIENT|RECREATE_FAILED|stopped before final|AUDIO/i.test(s)) return 'retry';
  if (/NO_MATCH|SPEECH_TIMEOUT|No match|No speech input/i.test(s)) return 'silent';
  return 'other';
}

// on-screen caption so you can SEE what Google heard
let capEl = null, capT = 0;
export function gevCaption(text, fade = true) {
  try {
    if (!capEl) {
      capEl = document.createElement('div');
      capEl.id = 'gev-voice-caption';
      capEl.setAttribute('role', 'status');
      capEl.style.cssText = 'position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom,0px));translate:-50% 0;' +
        'max-width:86vw;padding:8px 14px;border-radius:14px;z-index:2147483647;pointer-events:none;' +
        'background:rgba(10,18,32,.88);border:1px solid rgba(140,220,255,.35);color:#dff3ff;' +
        'font:500 13px/1.35 Inter,system-ui,sans-serif;box-shadow:0 0 18px rgba(90,200,255,.35);' +
        'transition:opacity .3s;text-align:center';
      document.body.appendChild(capEl);
    }
    capEl.textContent = '🎙 ' + text;
    capEl.style.opacity = '1';
    clearTimeout(capT);
    if (fade) capT = setTimeout(() => { if (capEl) capEl.style.opacity = '0'; }, 4000);
  } catch {}
}

// Permission + availability are checked once, then cached, so a tap starts
// listening straight away. A failure is not cached (the user may fix it).
let ready = null;
export function warmUpVoice() {
  if (!ready) {
    ready = (async () => {
      let perm = await SpeechRecognition.checkPermissions?.().catch(() => null);
      if (!perm || perm.speechRecognition !== 'granted') perm = await SpeechRecognition.requestPermissions();
      if (perm?.speechRecognition !== 'granted') throw new Error('Microphone / speech permission denied');
      const { available } = await SpeechRecognition.available();
      if (!available) throw new Error('No speech recognition service on this device (run ./gids-android.sh --voice-setup to install Google speech services)');
      return true;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function resetNative() {
  try {
    if (SpeechRecognition.forceStop) await SpeechRecognition.forceStop({ timeout: 300 });
    else await SpeechRecognition.stop();
  } catch {}
  await sleep(250);
}

// Only one capture at a time: the native recognizer is a singleton, and two JS
// owners were the cause of "Speech recognition is already running" errors.
let current = null;
export const activeVoice = () => current;

export class NativeVoiceAdapter {
  constructor({ onTranscript, onPartial, onStatus, onError, language } = {}) {
    this.onTranscript = onTranscript || (() => {});
    this.onPartial = onPartial || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onError = onError || (() => {});
    this.language = language || navigator.language || 'en-US';
    this.subs = []; this.active = false; this.done = true; this.last = '';
    this.timer = 0; this.noSpeech = 0; this.gen = 0;
  }

  async start() {
    if (this.active) return;
    if (current && current !== this) current.abort();
    current = this;
    Object.assign(this, { active: true, done: false, last: '', attempts: 0, triedOnDevice: false,
      lastError: null, nativeSession: undefined, t0: performance.now(), heardAt: 0 });
    window.__gevVoiceActive = true;
    gevCaption('Listening…', false);
    this.onStatus('listening', 'Listening…');
    try {
      await warmUpVoice();
      if (this.done) return; // tapped off while the permission check ran
      await this._listen();
    } catch (e) {
      this._fail(e);
    }
  }

  async _listen({ onDevice = false } = {}) {
    this._unsub();
    this.attempts++;
    const gen = ++this.gen;
    const mine = (ev) => gen === this.gen && !this.done &&
      (ev?.sessionId === undefined || this.nativeSession === undefined || ev.sessionId === this.nativeSession);
    this.lastError = null; this.nativeSession = undefined; this.listenAt = performance.now();
    const add = async (name, fn) => {
      try { this.subs.push(await SpeechRecognition.addListener(name, fn)); } catch {}
    };
    await add('listeningState', (ev) => {
      if (gen !== this.gen || this.done) return;
      const st = ev?.state || ev?.status;
      if ((st === 'startingListening' || st === 'started') && ev?.sessionId !== undefined) this.nativeSession = ev.sessionId;
      if ((ev?.status === 'stopped' || st === 'stopped') && mine(ev)) this._ended(ev);
    });
    await add('partialResults', (ev) => {
      if (!mine(ev)) return;
      const t = String(ev?.accumulatedText || ev?.matches?.[0] || ev?.value?.[0] || '').trim();
      if (t) this._heard(t);
    });
    await add('error', (ev) => { if (mine(ev)) this.lastError = ev; });

    let res;
    try {
      res = await SpeechRecognition.start({
        language: this.language, maxResults: 3, partialResults: true, popup: false,
        ...(onDevice ? { useOnDeviceRecognition: true } : {}),
      });
    } catch (e) {
      if (this.done) return;
      if (classifyVoiceError(e) === 'retry' && this.attempts < 3) {
        console.info('[GEV-Voice] recognizer busy (' + (e?.message || e) + ') — resetting and retrying');
        await resetNative();
        return this._listen({ onDevice });
      }
      throw e;
    }
    console.info('[GEV-Voice] Google listening (background), lang=' + this.language + (onDevice ? ', on-device' : ''));
    const m = String(res?.matches?.[0] || '').trim(); // some builds still resolve with text
    if (m) { this.last = m; this.finalize('results'); return; }
    clearTimeout(this.noSpeech);
    this.noSpeech = setTimeout(() => { if (!this.last) this.finalize('no-speech'); }, NO_SPEECH_MS);
  }

  _heard(t) {
    this.last = t;
    this.heardAt = performance.now();
    clearTimeout(this.noSpeech);
    gevCaption('“' + t + '”', false);
    this.onPartial(t);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.finalize('silence'), looksComplete(t) ? QUICK_SILENCE_MS : SILENCE_MS);
  }

  // native session ended on its own (Android end-of-speech, or an error)
  async _ended(ev) {
    if (this.done) return;
    if (this.last.trim()) return this.finalize('end');
    const err = this.lastError || (ev?.errorCode ? { code: ev.errorCode } : null);
    const kind = err ? classifyVoiceError(err) : 'silent';
    const quick = performance.now() - this.listenAt < EARLY_END_MS;
    console.info('[GEV-Voice] recognizer ended without text', JSON.stringify({ code: err?.code, kind, quick }));
    if (kind === 'fatal') return this._fail(new Error(err?.message || err?.code));
    if (kind === 'network' && !this.triedOnDevice) {
      this.triedOnDevice = true;
      const od = await SpeechRecognition.isOnDeviceRecognitionAvailable?.({ language: this.language }).catch(() => null);
      if (od?.available && !this.done) {
        gevCaption('No connection — listening on-device…', false);
        return this._listen({ onDevice: true }).catch((e) => this._fail(e));
      }
      return this.finalize('network');
    }
    if ((kind === 'retry' || quick) && this.attempts < 3) {
      await resetNative();
      if (!this.done) return this._listen().catch((e) => this._fail(e));
      return;
    }
    this.finalize(kind === 'network' ? 'network' : 'no-speech');
  }

  // user tapped the mic again: use what was heard so far
  async stop() {
    if (!this.active) return;
    if (!this.last.trim()) return this.finalize('cancelled');
    // deliver on the next tick, after the voice session has processed the tap
    // (it goes idle first; the command then runs as a fresh 'executing' turn)
    this.active = false;
    clearTimeout(this.timer);
    setTimeout(() => this.finalize('user'), 0);
  }

  // another capture took over / app tore the session down
  abort() {
    if (this.done) return;
    this.finalize('aborted');
  }

  finalize(reason) {
    if (this.done) return;
    this.done = true; this.active = false;
    clearTimeout(this.timer); clearTimeout(this.noSpeech);
    this._unsub();
    if (current === this) current = null;
    window.__gevVoiceActive = false;
    // shut the recognizer down in the background — never wait for it
    SpeechRecognition.stop().catch(() => {});
    const t = this.last.trim();
    const now = performance.now();
    window.__gevVoiceTiming = { reason, text: t, startMs: Math.round(now - this.t0),
      afterLastWordMs: this.heardAt ? Math.round(now - this.heardAt) : null, finalAt: now };
    console.info('[GEV-Voice] transcript:', JSON.stringify(t), reason, window.__gevVoiceTiming.afterLastWordMs + 'ms after last word');
    if (reason === 'aborted') return;
    const msg = t ? '“' + t + '”'
      : reason === 'network' ? 'Google speech needs a connection — check Wi-Fi/data and try again'
      : reason === 'cancelled' ? 'Voice off'
      : 'Didn’t catch that — tap the mic and speak';
    gevCaption(msg, true);
    if (t) this.onTranscript(t);
    this.onStatus('idle', t ? 'Heard: ' + t : msg);
  }

  _fail(e) {
    const msg = String(e?.message || e || 'Voice error');
    console.warn('[GEV-Voice] start failed:', msg);
    if (!this.done) {
      this.done = true; this.active = false;
      clearTimeout(this.timer); clearTimeout(this.noSpeech);
      this._unsub();
      if (current === this) current = null;
      window.__gevVoiceActive = false;
      SpeechRecognition.stop().catch(() => {});
    }
    gevCaption('Voice: ' + msg, true);
    if (classifyVoiceError(e) === 'fatal') this.onError(e);
    else this.onStatus('idle', msg);
  }

  _unsub() {
    const subs = this.subs; this.subs = [];
    subs.forEach((s) => { try { s.remove(); } catch {} });
  }

  speak(text) {
    try { window.gevSpeak ? window.gevSpeak(text) : window.speechSynthesis?.speak(new SpeechSynthesisUtterance(text)); } catch {}
  }
  cancelSpeech() { try { window.speechSynthesis?.cancel(); } catch {} }
}
