/**
 * System voice fallback for Gids Eyes View.
 *
 * Uses the platform's built-in speech recognition (Android WebView / iOS
 * WKWebView / Chrome) instead of the Gemini Live streaming socket. The
 * interface mirrors the parts of GeminiRealtimeConnection that the voice
 * controller actually drives, so it can be swapped in when Gemini fails.
 *
 *   - Input : window.SpeechRecognition || window.webkitSpeechRecognition
 *   - Output: window.speechSynthesis with the platform's default voice
 *
 * Recognised text is emitted via onTranscript(text); the caller is expected
 * to route it through the normal command pipeline (controller.sendTextCommand).
 */

const SpeechRecognitionCtor =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export function isSystemVoiceAvailable() {
  return Boolean(SpeechRecognitionCtor);
}

export class SystemVoiceAdapter {
  constructor({ onTranscript, onStatus, onError, language = 'en-US' } = {}) {
    this.onTranscript = onTranscript || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onError = onError || (() => {});
    this.language = language;
    this.recognition = null;
    this.active = false;
    this.pushToTalk = false;
  }

  start({ pushToTalk = false } = {}) {
    if (!SpeechRecognitionCtor) {
      this.onError(new Error('System speech recognition is not available on this device'));
      return;
    }
    if (this.active) return;
    this.pushToTalk = pushToTalk;

    const rec = new SpeechRecognitionCtor();
    this.recognition = rec;
    rec.lang = this.language;
    rec.continuous = !pushToTalk;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.active = true;
      this.onStatus('listening', pushToTalk ? 'Listening...' : 'Listening');
    };
    rec.onresult = (event) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
      }
      if (finalText.trim()) {
        const text = finalText.trim();
        this.onTranscript(text);
        this.speak(`Working on: ${text}`);
      }
    };
    rec.onerror = (event) => {
      // 'no-speech' and 'aborted' are noise - don't surface them
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      this.onError(new Error(`System voice error: ${event.error}`));
    };
    rec.onend = () => {
      this.active = false;
      if (!this.pushToTalk) {
        // Continuous mode: restart unless stopped
        if (this._shouldKeepAlive) {
          try { rec.start(); } catch { /* ignore */ }
        }
      } else {
        this.onStatus('idle', 'Tap the mic to speak');
      }
    };

    this._shouldKeepAlive = !pushToTalk;
    try {
      rec.start();
    } catch (error) {
      this.onError(error);
    }
  }

  /** PTT release path. */
  stop() {
    this._shouldKeepAlive = false;
    this.active = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
      this.recognition = null;
    }
    this.onStatus('idle', 'Ready');
  }

  /** Speak the assistant's reply through the platform TTS engine. */
  speak(text) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    window.speechSynthesis.speak(utter);
  }

  cancelSpeech() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
}
