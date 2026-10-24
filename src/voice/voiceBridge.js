import { NativeVoiceAdapter, isNativeVoiceAvailable, gevCaption, warmUpVoice, activeVoice } from './nativeVoice.js';
import { registerPlugin } from '@capacitor/core';
const TextToSpeech = registerPlugin('TextToSpeech');

// Spoken replies via the native engine (Speech Recognition & Synthesis by Google).
// Android WebView's speechSynthesis is often silent, so it is not relied on.
async function speak(text, opts = {}) {
  if (!text) return;
  try {
    await TextToSpeech.stop().catch(() => {});
    await TextToSpeech.speak({ text: String(text), lang: opts.lang || navigator.language || 'en-US',
                               rate: opts.rate || 1.0, pitch: opts.pitch || 1.0, volume: 1.0, category: 'playback' });
  } catch (e) {
    console.warn('[GEV-Voice] native TTS failed, falling back:', e?.message || e);
    try { window.__gevOrigSynth?.speak(new SpeechSynthesisUtterance(text)); } catch {}
  }
}

function findSearchBox() {
  const real = document.getElementById('location-search');
  if (real) {
    const bar = document.getElementById('location-bar');
    if (bar?.classList.contains('collapsed')) { try { document.getElementById('location-bar-toggle')?.click(); } catch {} }
    return real;
  }
  const sel = [
    'input[type="search"]', 'input[name*="search" i]', 'input[id*="search" i]',
    'input[placeholder*="search" i]', 'input[placeholder*="location" i]',
    'input[placeholder*="destination" i]', 'input[placeholder*="place" i]',
    'input[placeholder*="go to" i]', 'input[aria-label*="search" i]',
  ];
  for (const s of sel) {
    for (const el of document.querySelectorAll(s)) if (!el.disabled) return el;
  }
  return null;
}
function typeAndSubmit(input, text) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  input.focus();
  setter.call(input, text);                                  // works with React/Vue bound inputs
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const key = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
  input.dispatchEvent(new KeyboardEvent('keydown', key));
  input.dispatchEvent(new KeyboardEvent('keypress', key));
  input.dispatchEvent(new KeyboardEvent('keyup', key));
  input.form?.requestSubmit?.();
  try { input.blur(); } catch {}                             // keep the soft keyboard down
}
function deliver(text) {
  const ev = new CustomEvent('gev:voice-transcript', { detail: { text }, cancelable: true });
  const handled = !document.dispatchEvent(ev);
  if (handled) return;
  if (window.gevSearch?.(text)) return;                     // optional app hook
  const box = findSearchBox();
  if (box) { typeAndSubmit(box, text); console.info('[GEV-Voice] searched:', text); gevCaption('Searching the map for ' + text); }
  else { console.warn('[GEV-Voice] no search box found for transcript:', text); speak('I heard ' + text + ', but I could not find the search box'); }
}

class NativeSpeechRecognition extends EventTarget {
  constructor() {
    super();
    this.lang = navigator.language || 'en-US';
    this.continuous = false; this.interimResults = false; this.maxAlternatives = 1;
    this.onstart = this.onend = this.onresult = this.onerror = this.onaudiostart = this.onspeechend = null;
    this._a = null;
  }
  _emit(type, extra = {}) {
    const ev = new Event(type); Object.assign(ev, extra);
    this.dispatchEvent(ev);
    try { this['on' + type]?.(ev); } catch (e) { console.warn(e); }
  }
  _result(text, isFinal) {
    const alt = { transcript: text, confidence: 0.9 };
    const res = Object.assign([alt], { isFinal, length: 1, item: (i) => res[i] });
    const list = Object.assign([res], { length: 1, item: (i) => list[i] });
    this._emit('result', { results: list, resultIndex: 0 });
  }
  start() {
    this._a = new NativeVoiceAdapter({
      language: this.lang,
      onPartial: (t) => { if (this.interimResults) this._result(t, false); },
      onTranscript: (t) => { this._result(t, true); if (!window.__gevNativeSession) deliver(t); },
      onError: (e) => this._emit('error', { error: /permission/i.test(e?.message) ? 'not-allowed' : 'network', message: String(e?.message || e) }),
      onStatus: (s) => { if (s === 'idle') this._emit('end'); },
    });
    this._emit('start'); this._emit('audiostart');
    this._a.start();
  }
  stop()  { this._a?.stop(); }
  abort() { this._a?.abort(); }
}

if (isNativeVoiceAvailable()) {
  window.SpeechRecognition = NativeSpeechRecognition;
  window.webkitSpeechRecognition = NativeSpeechRecognition;
  // route window.speechSynthesis.speak() through the native engine too
  try {
    window.__gevOrigSynth = window.speechSynthesis;
    const shim = {
      speak: (u) => { speak(u?.text ?? String(u), { lang: u?.lang, rate: u?.rate, pitch: u?.pitch })
                       .then(() => { try { u?.onend?.(new Event('end')); } catch {} }); },
      cancel: () => TextToSpeech.stop().catch(() => {}),
      pause() {}, resume() {}, getVoices: () => [], speaking: false, pending: false, paused: false,
      addEventListener() {}, removeEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: shim, configurable: true });
  } catch {}
  window.gevVoice = { deliver, findSearchBox, speak, Recognition: NativeSpeechRecognition };
  window.gevVoiceCaption = (t) => gevCaption(t);
  window.gevSpeak = speak;

  // The GEV mic is bound to Google speech recognition (background, no popup).
  const MIC = '#gev-voice-button, [data-gev-mic], .gev-voice-button';
  // Warm up as the finger lands, so the permission/availability check is done
  // by the time the tap completes and listening starts without a pause.
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest?.(MIC)) warmUpVoice().catch(() => {});
  }, true);
  // Speaking cuts any reply that is still being read out, so the mic hears you.
  document.addEventListener('click', (e) => {
    if (e.target.closest?.(MIC)) TextToSpeech.stop().catch(() => {});
  }, true);

  // Fallback ONLY for a forked voice stack that is not native (e.g. a
  // preserved server-relayed session): if a tap that switches voice ON does
  // not start Google capture, capture here and fly/search directly. With the
  // native session (the default) this never runs — two owners of the
  // recognizer were what caused "already running" errors.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.(MIC);
    if (!btn || window.__gevNativeSession) return;
    const own = activeVoice();
    if (own?.__standalone) { own.stop(); return; }
    if (btn.getAttribute('aria-pressed') === 'true') return; // this tap turns voice off
    setTimeout(() => {
      if (window.__gevVoiceActive || window.__gevNativeSession) return;
      console.info('[GEV-Voice] app voice did not start Google capture — using standalone capture');
      const a = new NativeVoiceAdapter({
        onTranscript: (t) => {
          const dest = t.replace(/^(?:please\s+)?(?:go to|fly to|take me to|navigate to|search(?: for)?|find|show me|where is)\s+/i, '').trim();
          deliver(dest || t);
        },
        onError: (er) => gevCaption('Voice error: ' + (er?.message || er)),
      });
      a.__standalone = true;
      a.start();
    }, 500);
  }, true);
  console.info('[GEV-Voice] bridge installed (GEV mic -> Google speech, background)');
}
export { deliver };
