import React, { useState, useRef, useCallback } from 'react';
import { Mic, Square, RotateCcw, Loader2, Sparkles } from 'lucide-react';

// ─── Web Speech API types (not in older @types/lib.dom) ──────────────────────

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:  ((event: SpeechRecognitionEvent) => void) | null;
  onerror:   ((event: Event) => void) | null;
  onend:     ((event: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

interface VoiceRecorderProps {
  onProcess: (transcript: string) => void;
  isProcessing?: boolean;
}

const LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'pt-BR', label: 'Portuguese' },
  { code: 'zh-CN', label: 'Chinese' },
  { code: 'ar-SA', label: 'Arabic' },
];

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onProcess, isProcessing = false }) => {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [lang, setLang] = useState('en-US');
  const [unsupported, setUnsupported] = useState(false);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const accumulatedRef = useRef('');

  const buildRecognition = useCallback((): ISpeechRecognition | null => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setUnsupported(true); return null; }

    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;

    r.onresult = (event: SpeechRecognitionEvent) => {
      let final = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + ' ';
        } else {
          interimText += result[0].transcript;
        }
      }
      if (final) {
        accumulatedRef.current = (accumulatedRef.current + final).trim();
        setTranscript(accumulatedRef.current);
      }
      setInterim(interimText);
    };

    r.onerror = () => { setRecording(false); setInterim(''); };
    r.onend   = () => { setRecording(false); setInterim(''); };

    return r;
  }, [lang]);

  const startRecording = () => {
    const r = buildRecognition();
    if (!r) return;
    recognitionRef.current = r;
    r.start();
    setRecording(true);
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setRecording(false);
  };

  const reset = () => {
    recognitionRef.current?.abort();
    setRecording(false);
    setTranscript('');
    setInterim('');
    accumulatedRef.current = '';
  };

  if (unsupported) {
    return (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        Voice input requires Chrome or Edge browser with microphone access.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/40 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Voice Input</span>
          {recording && (
            <span className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
              Listening…
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!recording && (
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 focus:outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          )}

          {transcript && !recording && (
            <button
              type="button"
              onClick={reset}
              title="Clear transcript"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <RotateCcw size={14} />
            </button>
          )}

          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={isProcessing}
            title={recording ? 'Stop recording' : 'Start voice recording'}
            className={`p-2.5 rounded-full shadow transition-all ${
              recording
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            } disabled:opacity-50`}
          >
            {recording ? <Square size={15} /> : <Mic size={15} />}
          </button>
        </div>
      </div>

      {/* Live transcript */}
      {(transcript || interim) && (
        <div className="bg-white rounded-lg border border-blue-100 px-3 py-2.5 min-h-[52px] max-h-36 overflow-y-auto text-sm leading-relaxed">
          <span className="text-gray-800 whitespace-pre-wrap">{transcript}</span>
          {interim && <span className="text-gray-400 italic">{interim}</span>}
        </div>
      )}

      {/* Auto-fill button */}
      {transcript && !recording && (
        <button
          type="button"
          onClick={() => onProcess(transcript)}
          disabled={isProcessing}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white
            bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700
            disabled:opacity-60 transition-all shadow-sm"
        >
          {isProcessing
            ? <><Loader2 size={14} className="animate-spin" /> Processing with AI…</>
            : <><Sparkles size={14} /> Auto-fill with AI</>}
        </button>
      )}

      {!transcript && !recording && (
        <p className="text-xs text-gray-400 text-center py-0.5">
          Click the mic to start speaking your update
        </p>
      )}
    </div>
  );
};

export default VoiceRecorder;
