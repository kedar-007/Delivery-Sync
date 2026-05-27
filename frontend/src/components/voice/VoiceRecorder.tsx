import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, RotateCcw, Loader2, Sparkles, AlertCircle, Keyboard, Volume2 } from 'lucide-react';
import { aiApi } from '../../lib/api';

// ─── Web Speech API types ─────────────────────────────────────────────────────

interface SpeechRecognitionAlternative { readonly transcript: string }
interface SpeechRecognitionResult      { readonly isFinal: boolean; [i: number]: SpeechRecognitionAlternative }
interface SpeechRecognitionResultList  { readonly length: number;   [i: number]: SpeechRecognitionResult }
interface SpeechRecognitionErrorEvent  extends Event { readonly error: string }
interface SpeechRecognitionEvent       extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface ISpeechRecognition extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void; abort(): void;
  onresult:  ((e: SpeechRecognitionEvent) => void) | null;
  onerror:   ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend:     (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition:       new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

interface VoiceRecorderProps {
  onProcess: (transcript: string) => void;
  isProcessing?: boolean;
}

// ─── Languages ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en-US', label: '🇺🇸 English (US)' },
  { code: 'en-AU', label: '🇦🇺 English (AU)' },
  { code: 'en-GB', label: '🇬🇧 English (UK)' },
  { code: 'en-IN', label: '🇮🇳 English (India)' },
  { code: 'hi-IN', label: '🇮🇳 Hindi' },
  { code: 'es-ES', label: '🇪🇸 Spanish' },
  { code: 'es-MX', label: '🇲🇽 Spanish (MX)' },
  { code: 'fr-FR', label: '🇫🇷 French' },
  { code: 'de-DE', label: '🇩🇪 German' },
  { code: 'pt-BR', label: '🇧🇷 Portuguese' },
  { code: 'zh-CN', label: '🇨🇳 Chinese (Simplified)' },
  { code: 'zh-TW', label: '🇹🇼 Chinese (Traditional)' },
  { code: 'ja-JP', label: '🇯🇵 Japanese' },
  { code: 'ko-KR', label: '🇰🇷 Korean' },
  { code: 'ar-SA', label: '🇸🇦 Arabic' },
  { code: 'ru-RU', label: '🇷🇺 Russian' },
  { code: 'it-IT', label: '🇮🇹 Italian' },
  { code: 'nl-NL', label: '🇳🇱 Dutch' },
  { code: 'pl-PL', label: '🇵🇱 Polish' },
  { code: 'tr-TR', label: '🇹🇷 Turkish' },
  { code: 'vi-VN', label: '🇻🇳 Vietnamese' },
  { code: 'th-TH', label: '🇹🇭 Thai' },
  { code: 'id-ID', label: '🇮🇩 Indonesian' },
  { code: 'ms-MY', label: '🇲🇾 Malay' },
  { code: 'bn-IN', label: '🇮🇳 Bengali' },
  { code: 'ta-IN', label: '🇮🇳 Tamil' },
  { code: 'te-IN', label: '🇮🇳 Telugu' },
  { code: 'mr-IN', label: '🇮🇳 Marathi' },
  { code: 'gu-IN', label: '🇮🇳 Gujarati' },
  { code: 'ur-PK', label: '🇵🇰 Urdu' },
];

// Seed multipliers give each bar a unique amplitude shape
const BAR_SEEDS = [0.55, 0.95, 0.65, 1.3, 0.75, 1.1, 0.5, 0.85];

type Mode = 'idle' | 'checking' | 'recording' | 'transcribing' | 'done' | 'error' | 'manual';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload  = () => {
      // result is "data:<mime>;base64,<data>" — strip the prefix
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.readAsDataURL(blob);
  });

// ─── Component ────────────────────────────────────────────────────────────────

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onProcess, isProcessing = false }) => {
  const [mode, setMode]             = useState<Mode>('idle');
  const [finalText, setFinalText]   = useState('');
  const [liveText, setLiveText]     = useState('');
  const [lang, setLang]             = useState('en-US');
  const [errorMsg, setErrorMsg]     = useState('');
  const [manualText, setManualText] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);   // 0–100 RMS from analyser
  const [lowVolume, setLowVolume]   = useState(false);
  // Sustained high audio with no transcript progress → likely noisy environment.
  // Tracked as a running average so single loud syllables don't trigger it.
  const [tooNoisy, setTooNoisy]     = useState(false);

  const recogRef    = useRef<ISpeechRecognition | null>(null);
  const accRef      = useRef('');
  const wantRef     = useRef(false);
  const streamRef   = useRef<MediaStream | null>(null);
  const langRef     = useRef(lang);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const rafRef      = useRef<number>(0);
  // Exponential moving average of audioLevel — used to detect sustained noise
  const noiseAvgRef = useRef<number>(0);
  // Tracks current liveText so the polling loop can decide whether speech is
  // actually being captured (no need for re-renders on every change).
  const liveTextRef = useRef<string>('');

  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { liveTextRef.current = liveText; }, [liveText]);

  // Cleanup on unmount
  useEffect(() => () => {
    wantRef.current = false;
    cancelAnimationFrame(rafRef.current);
    recogRef.current?.abort();
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close();
  }, []);

  // ── Audio level polling ──────────────────────────────────────────────────────

  const startLevelPoll = () => {
    // Reset moving average each time we start a new recording session
    noiseAvgRef.current = 0;
    const poll = () => {
      if (!analyserRef.current) return;
      const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms   = Math.sqrt(sum / buf.length);
      const level = Math.min(100, Math.round(rms * 500));
      setAudioLevel(level);
      setLowVolume(level < 6 && wantRef.current);

      // Smoothed running average for noise detection (~2-second window at 60fps)
      const ALPHA = 0.03;
      noiseAvgRef.current = noiseAvgRef.current * (1 - ALPHA) + level * ALPHA;
      // Mark as "too noisy" only when:
      //   1. We're actively trying to record
      //   2. Sustained average audio is high (> 35)
      //   3. AND not much transcript captured yet (< 5 words) — if words are
      //      flowing in, the speech recognition is succeeding so the audio is
      //      clearly being heard, even if loud.
      const wordsSoFar = liveTextRef.current.trim().split(/\s+/).filter(Boolean).length;
      setTooNoisy(
        wantRef.current &&
        noiseAvgRef.current > 35 &&
        wordsSoFar < 5
      );
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
  };

  // ── Mic acquisition with AudioContext amplification pipeline ──────────────

  const acquireMic = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  true,
          channelCount:     1,
          sampleRate:       16000,
        },
      });
      streamRef.current = stream;

      // AudioContext pipeline: source → gain(4×) → analyser
      //                                          ↘ MediaStreamDestination (for MediaRecorder)
      const ctx      = new AudioContext();
      const source   = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = 4.0; // 4× amplification for quiet / meeting-room voices

      const analyser = ctx.createAnalyser();
      analyser.fftSize               = 256;
      analyser.smoothingTimeConstant = 0.6;

      const dest = ctx.createMediaStreamDestination();

      source.connect(gainNode);
      gainNode.connect(analyser);
      gainNode.connect(dest); // amplified stream for MediaRecorder

      audioCtxRef.current = ctx;
      gainNodeRef.current = gainNode;
      analyserRef.current = analyser;

      // MediaRecorder captures the 4× amplified audio
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      try {
        const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.start(200); // collect in 200 ms slices
        mediaRecRef.current = recorder;
      } catch {
        // MediaRecorder unavailable — voice-only mode still works
        mediaRecRef.current = null;
      }

      startLevelPoll();
      return true;

    } catch (err: any) {
      const name: string = err?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setErrorMsg('Microphone permission denied. Click the 🔒 lock in your browser address bar → allow Microphone → refresh.');
      } else if (name === 'NotFoundError') {
        setErrorMsg('No microphone found. Please connect a microphone and try again.');
      } else {
        setErrorMsg(`Microphone error (${name || err?.message}). Try the keyboard option below.`);
      }
      return false;
    }
  };

  // ── Tear down audio pipeline ───────────────────────────────────────────────

  const teardownAudio = () => {
    cancelAnimationFrame(rafRef.current);
    setAudioLevel(0);
    setLowVolume(false);
    setTooNoisy(false);
    noiseAvgRef.current = 0;

    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      try { mediaRecRef.current.stop(); } catch { /* ignore */ }
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    gainNodeRef.current = null;
    analyserRef.current = null;
  };

  // ── One recognition session ────────────────────────────────────────────────

  const startOnce = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    try { recogRef.current?.abort(); } catch { /* ignore */ }

    const r = new SR();
    r.continuous     = false;
    r.interimResults = true;
    r.lang           = langRef.current;
    recogRef.current = r;

    r.onresult = (event: SpeechRecognitionEvent) => {
      let finalChunk   = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalChunk   += res[0].transcript + ' ';
        else             interimChunk += res[0].transcript;
      }
      setLiveText(interimChunk);
      if (finalChunk) {
        accRef.current = (accRef.current + finalChunk).trim();
        setFinalText(accRef.current);
        setLiveText('');
      }
    };

    r.onerror = (event: SpeechRecognitionErrorEvent) => {
      const code = event.error;
      if (code === 'aborted' || code === 'no-speech') return;
      wantRef.current = false;
      teardownAudio();
      if (code === 'not-allowed') {
        setErrorMsg('Microphone permission denied. Allow microphone in browser settings and refresh.');
      } else if (code === 'audio-capture') {
        setErrorMsg('No microphone detected. Please connect a microphone.');
      } else if (code === 'network') {
        setErrorMsg('Cannot reach Google\'s speech service. Check your internet — or use the keyboard icon below.');
      } else {
        setErrorMsg(`Speech recognition error: "${code}". Use the keyboard icon to type instead.`);
      }
      setLiveText('');
      setMode('error');
    };

    r.onend = () => {
      setLiveText('');
      if (wantRef.current) {
        setTimeout(() => { if (wantRef.current) startOnce(); }, 80);
      }
    };

    try {
      r.start();
    } catch (e: any) {
      if (e?.name !== 'InvalidStateError') {
        setErrorMsg('Could not start speech recognition. Refresh the page or use the keyboard option.');
        setMode('error');
      }
    }
  };

  // ── Controls ──────────────────────────────────────────────────────────────

  const startRecording = async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMode('error');
      setErrorMsg('Voice input is not supported in this browser. Please use Chrome or Edge — or use the keyboard icon below.');
      return;
    }
    setMode('checking');
    setErrorMsg('');
    setFinalText('');
    setLiveText('');
    accRef.current  = '';
    chunksRef.current = [];

    const ok = await acquireMic();
    if (!ok) { setMode('error'); return; }

    wantRef.current = true;
    setMode('recording');
    startOnce();
  };

  const stopRecording = async () => {
    wantRef.current = false;
    try { recogRef.current?.stop(); } catch { /* ignore */ }

    // Grab the recorder chunks before teardown stops it
    const recorder = mediaRecRef.current;
    mediaRecRef.current = null;

    setLiveText('');

    // Wait a tick for the last ondataavailable to fire
    await new Promise(r => setTimeout(r, 300));

    teardownAudio();

    const webSpeechText = accRef.current.trim();

    // If Web Speech captured enough, use it directly
    if (webSpeechText.length >= 30) {
      setMode('done');
      return;
    }

    // Try backend transcription from the amplified audio recording
    const chunks = chunksRef.current;
    if (chunks.length > 0 && recorder) {
      setMode('transcribing');
      try {
        const blob     = new Blob(chunks, { type: chunks[0].type || 'audio/webm' });
        const base64   = await blobToBase64(blob);
        const result   = await aiApi.transcribe({ audio: base64, mimeType: blob.type, lang: langRef.current });
        const backend  = result?.transcript?.trim() ?? '';

        if (backend.length > webSpeechText.length) {
          accRef.current = backend;
          setFinalText(backend);
        }
      } catch {
        // Backend transcription unavailable — keep whatever Web Speech got
      }
    }

    setMode(accRef.current ? 'done' : 'idle');
  };

  const reset = () => {
    wantRef.current = false;
    try { recogRef.current?.abort(); } catch { /* ignore */ }
    teardownAudio();
    setMode('idle');
    setFinalText('');
    setLiveText('');
    setErrorMsg('');
    setManualText('');
    accRef.current = '';
    chunksRef.current = [];
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isActive  = mode === 'recording' || mode === 'checking';
  const wordCount = accRef.current.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/40 p-4 space-y-3">

      {/* ── Header ──
          DSV-002: the status indicator's slot has a min-width so badges of
          different lengths ("Checking mic…", "Enhancing transcript…", etc.)
          all occupy the same horizontal space — without this the surrounding
          layout reflowed on every state change and the page appeared to
          shake. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-h-[20px]">
          <span className="text-sm font-semibold text-gray-700">Voice Input</span>
          <div className="min-w-[160px]">
            {mode === 'checking' && (
              <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> Checking mic…
              </span>
            )}
            {mode === 'recording' && (
              <span className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                Recording
                {wordCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px] font-bold">
                    {wordCount}w
                  </span>
                )}
              </span>
            )}
            {mode === 'transcribing' && (
              <span className="text-xs text-violet-600 font-medium flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> Enhancing transcript…
              </span>
            )}
            {mode === 'done' && (
              <span className="text-xs text-green-600 font-medium">✓ {wordCount} words captured</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Language dropdown — kept in the DOM but visually hidden when
              recording so its slot remains and the header doesn't reflow. */}
          {mode !== 'transcribing' && (
            <select value={lang} onChange={e => setLang(e.target.value)}
              disabled={isActive}
              className={`text-xs border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 bg-ds-surface text-ds-text-muted focus:outline-none focus:ring-1 focus:ring-blue-300 max-w-[160px] ${
                isActive ? 'invisible' : ''
              }`}>
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          )}

          {/* Reset */}
          {(finalText || errorMsg || mode === 'manual') && !isActive && mode !== 'transcribing' && (
            <button type="button" onClick={reset} title="Clear and reset"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <RotateCcw size={14} />
            </button>
          )}

          {/* Keyboard toggle */}
          {!isActive && mode !== 'transcribing' && (
            <button type="button"
              onClick={() => setMode(mode === 'manual' ? 'idle' : 'manual')}
              title="Type instead of speaking"
              className={`p-1.5 rounded-lg transition-colors ${
                mode === 'manual'
                  ? 'bg-blue-100 text-blue-600'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}>
              <Keyboard size={14} />
            </button>
          )}

          {/* Mic / Stop */}
          {mode !== 'manual' && mode !== 'transcribing' && (
            <button type="button"
              onClick={isActive ? stopRecording : startRecording}
              disabled={isProcessing || mode === 'checking'}
              title={isActive ? 'Stop recording' : 'Start recording'}
              className={`p-2.5 rounded-full shadow-md transition-all ${
                mode === 'recording'
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}>
              {mode === 'recording'
                ? <Square size={15} fill="white" />
                : mode === 'checking'
                  ? <Loader2 size={15} className="animate-spin" />
                  : <Mic size={15} />}
            </button>
          )}
        </div>
      </div>

      {/* ── Recording status area with reserved space ──
          DSV-002 / follow-up: this wrapper has a fixed `min-h-[110px]` so the
          page below the recorder doesn't jolt down when the live panel
          appears. The panel + tips render inside this stable area. */}
      <div className="min-h-[110px]">
        {mode === 'recording' && (
          <div className={`rounded-lg border-2 transition-colors duration-150 min-h-[56px] px-3 py-2.5 ${
            liveText
              ? 'border-blue-400 bg-ds-surface'
              : tooNoisy
                ? 'border-rose-300 bg-rose-50/60 dark:bg-rose-900/20'
                : lowVolume
                  ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-900/20'
                  : 'border-dashed border-blue-200 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-900/20'
          }`}>
            {liveText ? (
              <p className="text-sm text-blue-600 dark:text-blue-400 font-medium leading-snug whitespace-pre-wrap">
                {liveText}
                <span className="inline-block w-0.5 h-4 bg-blue-500 ml-0.5 animate-pulse align-middle" />
              </p>
            ) : (
              <div className="space-y-1.5">
                {/* Dynamic waveform bars driven by real audio level */}
                <div className="flex items-end gap-0.5 h-6">
                  {BAR_SEEDS.map((seed, i) => {
                    const h = audioLevel > 4
                      ? Math.max(3, Math.min(24, audioLevel * 0.22 * seed))
                      : [5, 9, 6, 12, 7, 10, 5, 8][i];
                    return (
                      <span key={i}
                        className={`w-1.5 rounded-full transition-all duration-75 ${
                          tooNoisy
                            ? 'bg-rose-400'
                            : lowVolume
                              ? 'bg-amber-400'
                              : audioLevel > 4 ? 'bg-blue-500' : 'bg-blue-300 animate-bounce'
                        }`}
                        style={{
                          height: `${h}px`,
                          ...(audioLevel <= 4 ? { animationDelay: `${i * 0.08}s`, animationDuration: '0.7s' } : {}),
                        }}
                      />
                    );
                  })}
                </div>
                <span className={`text-xs ${
                  tooNoisy
                    ? 'text-rose-600 font-medium'
                    : lowVolume
                      ? 'text-amber-600 font-medium'
                      : 'text-blue-400'
                }`}>
                  {tooNoisy
                    ? '🔊 Too much background noise — find a quieter spot or use a headset mic'
                    : lowVolume
                      ? '🔇 Speaking too softly — move closer to the mic or speak louder'
                      : finalText ? 'Listening for more…' : 'Speak now — words will appear here as you talk'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Detailed tips — one slot, two possible tips depending on which
            condition is active. Reserved space stays the same so the area
            doesn't reflow when the tip swaps. */}
        {mode === 'recording' && (tooNoisy || lowVolume) && (
          <div className={`mt-2 flex items-start gap-1.5 px-2.5 py-1.5 border rounded-lg ${
            tooNoisy ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'
          }`}>
            <Volume2 size={12} className={`shrink-0 mt-0.5 ${tooNoisy ? 'text-rose-500' : 'text-amber-500'}`} />
            <p className={`text-xs ${tooNoisy ? 'text-rose-700' : 'text-amber-700'}`}>
              {tooNoisy ? (
                <><strong>Too noisy:</strong> Background sound is drowning out your voice. Try a quieter room, move away from fans/windows, or use a headset mic.</>
              ) : (
                <><strong>Too quiet:</strong> Speak directly at the mic, avoid side angles. In a meeting room, move closer or use a headset.</>
              )}
            </p>
          </div>
        )}
      </div>

      {/* ── Transcribing fallback indicator ── */}
      {mode === 'transcribing' && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-violet-50 dark:bg-violet-900/25 border border-violet-200 dark:border-violet-700/50 rounded-lg">
          <Loader2 size={14} className="text-violet-500 dark:text-violet-400 animate-spin shrink-0" />
          <div>
            <p className="text-xs text-violet-700 dark:text-violet-300 font-medium">Enhancing with amplified audio…</p>
            <p className="text-[10px] text-violet-500 dark:text-violet-400">Processing the boosted recording for better accuracy</p>
          </div>
        </div>
      )}

      {/* ── Accumulated final transcript ── */}
      {finalText && mode !== 'transcribing' && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-ds-surface px-3 py-2.5 max-h-36 overflow-y-auto">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Captured</p>
          <p className="text-sm text-ds-text leading-relaxed whitespace-pre-wrap">{finalText}</p>
        </div>
      )}

      {/* ── Error ── */}
      {mode === 'error' && errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-1.5">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700 leading-snug">{errorMsg}</p>
          </div>
          <button type="button" onClick={() => setMode('manual')}
            className="text-xs font-semibold text-red-600 underline underline-offset-2 hover:text-red-800 ml-5">
            Type my update instead →
          </button>
        </div>
      )}

      {/* ── Idle hint ── */}
      {mode === 'idle' && (
        <p className="text-xs text-gray-400 text-center py-0.5">
          Click the mic to start · Works in <strong>Chrome</strong> / <strong>Edge</strong> · or <strong>⌨</strong> to type
        </p>
      )}

      {/* ── Manual text area ── */}
      {mode === 'manual' && (
        <div className="space-y-2">
          <textarea autoFocus rows={4}
            className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 bg-ds-surface text-ds-text placeholder:text-gray-400 dark:placeholder:text-gray-500"
            placeholder="Type your update (e.g. yesterday I finished X, today working on Y, no blockers)…"
            value={manualText}
            onChange={e => setManualText(e.target.value)}
          />
          <button type="button"
            onClick={() => manualText.trim().length >= 5 && onProcess(manualText.trim())}
            disabled={isProcessing || manualText.trim().length < 5}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white
              bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700
              disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">
            {isProcessing
              ? <><Loader2 size={14} className="animate-spin" /> Processing with AI…</>
              : <><Sparkles size={14} /> Auto-fill with AI</>}
          </button>
        </div>
      )}

      {/* ── Auto-fill after recording ── */}
      {mode === 'done' && finalText && (
        <button type="button"
          onClick={() => onProcess(finalText)}
          disabled={isProcessing}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white
            bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700
            disabled:opacity-60 transition-all shadow-sm">
          {isProcessing
            ? <><Loader2 size={14} className="animate-spin" /> Processing with AI…</>
            : <><Sparkles size={14} /> Auto-fill with AI</>}
        </button>
      )}
    </div>
  );
};

export default VoiceRecorder;
