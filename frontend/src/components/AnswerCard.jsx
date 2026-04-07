import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { BookOpen, Check, ChevronDown, ChevronUp, Copy, Square, Volume2 } from 'lucide-react';
import api from '../lib/api.js';

const AnswerCard = ({ mode = 'chat', question, answer, sources, animateTyping = true }) => {
  const [copied, setCopied] = useState(false);
  const [expandedSources, setExpandedSources] = useState(false);
  const [displayedAnswer, setDisplayedAnswer] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechLoading, setIsSpeechLoading] = useState(false);
  const [audioError, setAudioError] = useState('');
  const audioRef = useRef(null);

  useEffect(() => {
    if (!animateTyping) {
      setDisplayedAnswer(answer);
      setIsTyping(false);
      return;
    }

    let i = 0;
    setIsTyping(true);
    setDisplayedAnswer('');

    const speed = 8;
    const typeWriter = () => {
      if (i < answer.length) {
        setDisplayedAnswer(answer.substring(0, i + 1));
        i += 1;
        setTimeout(typeWriter, speed);
      } else {
        setIsTyping(false);
      }
    };

    typeWriter();
    return () => {
      i = answer.length;
    };
  }, [answer, animateTyping]);

  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSpeak = async () => {
    if (isSpeaking && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
      setIsSpeaking(false);
      return;
    }

    setAudioError('');
    setIsSpeechLoading(true);

    try {
      const response = await api.post('/api/speech/synthesize', { text: answer });
      if (!response.data?.success || !response.data?.audioBase64) {
        throw new Error(response.data?.error || 'Unable to generate speech audio.');
      }

      const src = `data:${response.data.mimeType || 'audio/wav'};base64,${response.data.audioBase64}`;
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setAudioError('Audio playback failed. Please try again.');
        setIsSpeaking(false);
        audioRef.current = null;
      };

      await audio.play();
    } catch (error) {
      setAudioError(error.response?.data?.error || error.message || 'Unable to play speech.');
      setIsSpeaking(false);
    } finally {
      setIsSpeechLoading(false);
    }
  };

  const isNotAvailable = answer === 'Not available in rules';

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="premium-pill max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-sm dark:border-[#654534] dark:bg-[#3a2419] dark:text-[#f5d6c4]">
          <p className="whitespace-pre-wrap break-words">{question}</p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-moss-600 text-xs font-semibold text-white dark:bg-[#fde6d8] dark:text-[#bf6336]">
          AI
        </div>

        <div className="premium-card w-full max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3 dark:border-[#5a3c2f] dark:bg-[#2f1e16]">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b7280] dark:text-[#c8a99a]">
              {mode === 'compliance_review' ? 'Compliance review' : 'Assistant'}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSpeak}
                disabled={isSpeechLoading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#6b7280] transition hover:bg-moss-100 hover:text-moss-700 disabled:opacity-50 dark:text-[#c8a99a] dark:hover:bg-[#3a2419] dark:hover:text-[#f3e4db]"
                aria-label={isSpeaking ? 'Stop speaking' : 'Speak answer'}
              >
                {isSpeaking ? <Square size={14} /> : <Volume2 size={14} />}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#6b7280] transition hover:bg-moss-100 hover:text-moss-700 dark:text-[#c8a99a] dark:hover:bg-[#3a2419] dark:hover:text-[#f3e4db]"
                aria-label="Copy answer"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div className={`prose prose-sm max-w-none dark:prose-invert ${isNotAvailable ? 'text-[#6b7280] italic dark:text-[#c8a99a]' : 'text-[#1a1a1a] dark:text-[#f3e4db]'}`}>
            <ReactMarkdown>{displayedAnswer}</ReactMarkdown>
            {isTyping && <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-[#f1bfa1] dark:bg-[#9b6b4f]" />}
          </div>

          {audioError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{audioError}</p>}

          {!isTyping && sources && sources.length > 0 && !isNotAvailable && (
            <div className="mt-4 border-t border-[#e6e0d6] pt-3 dark:border-[#5a3c2f]">
              <button
                type="button"
                onClick={() => setExpandedSources((value) => !value)}
                className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-[#6b7280] transition hover:text-moss-700 dark:text-[#d7b8a7] dark:hover:text-[#f3e4db]"
              >
                <BookOpen size={13} />
                Sources ({sources.length})
                {expandedSources ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {expandedSources && (
                <div className="mt-3 space-y-2">
                  {sources.map((src, idx) => (
                    <div key={idx} className="rounded-lg border border-[#e6e0d6] bg-cream-100 px-3 py-2 text-xs dark:border-[#5a3c2f] dark:bg-[#3a2419]">
                      <div className="mb-1 flex items-center justify-between text-[#6b7280] dark:text-[#c8a99a]">
                        <span>Page {src.page}</span>
                        <span>{src.section}</span>
                      </div>
                      <p className="text-[#1a1a1a] dark:text-[#f5d6c4]">{src.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnswerCard;
