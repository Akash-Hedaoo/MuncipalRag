import React, { useEffect, useRef, useState } from 'react';
import {
  ClipboardCheck,
  History,
  Loader2,
  MessageSquareText,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import api from '../lib/api.js';
import AnswerCard from './AnswerCard.jsx';
import { useAuth } from '../hooks/useAuth.js';

const normalizeChatSessions = (sessions = []) =>
  sessions.map((session, sessionIndex) => ({
    id: session.id || `chat-${sessionIndex + 1}`,
    title: session.title || `Chat ${sessionIndex + 1}`,
    mode: session.mode || 'chat',
    lastAskedAt: session.lastAskedAt || null,
    previewQuestion: session.previewQuestion || '',
    conversationCount: session.conversationCount || (session.conversations || []).length,
    conversations: (session.conversations || []).map((message, messageIndex) => ({
      id: message.id || `${message.askedAt || Date.now()}-${messageIndex}`,
      mode: message.mode || 'chat',
      question: message.question || '',
      answer: message.answer || '',
      sources: message.sources || [],
      askedAt: message.askedAt || null,
    })),
  }));

const SearchArea = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('chat');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState('');
  const [lastSubmittedMode, setLastSubmittedMode] = useState('chat');
  const [isMobileHistoryOpen, setIsMobileHistoryOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const [voiceDraftNotice, setVoiceDraftNotice] = useState('');
  const inputRef = useRef(null);
  const chatViewportRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);

  const activeSession = chatSessions.find((session) => session.id === activeSessionId) || null;
  const activeMessages = activeSession?.conversations || [];

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode, activeSessionId]);

  useEffect(() => {
    const supportsMediaRecording =
      typeof navigator !== 'undefined' &&
      typeof window !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof window.MediaRecorder !== 'undefined';

    setIsSpeechSupported(supportsMediaRecording);

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadChatHistory = async () => {
      try {
        setIsLoadingHistory(true);
        const response = await api.get('/api/query/history');

        if (!isCancelled) {
          const sessions = normalizeChatSessions(response.data.chatSessions || []);
          setChatSessions(sessions);
          setActiveSessionId(sessions[sessions.length - 1]?.id || null);

          if (sessions.length > 0) {
            setMode(sessions[sessions.length - 1].mode || 'chat');
          }
        }
      } catch (historyError) {
        if (!isCancelled) {
          setError(historyError.response?.data?.error || 'Unable to load chat history.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingHistory(false);
        }
      }
    };

    loadChatHistory();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!chatViewportRef.current) return;

    chatViewportRef.current.scrollTo({
      top: chatViewportRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [activeMessages.length, isLoading, activeSessionId]);

  const startNewChat = (nextMode = mode) => {
    setActiveSessionId(null);
    setQuery('');
    setError(null);
    setSpeechError('');
    setVoiceDraftNotice('');
    setLastSubmittedQuery('');
    setLastSubmittedMode(nextMode);
    setMode(nextMode);
    setIsMobileHistoryOpen(false);
    inputRef.current?.focus();
  };

  const upsertChatSession = (nextSession) => {
    setChatSessions((currentSessions) => {
      const existingIndex = currentSessions.findIndex((session) => session.id === nextSession.id);

      if (existingIndex === -1) {
        return [...currentSessions, nextSession];
      }

      const updatedSessions = [...currentSessions];
      updatedSessions[existingIndex] = nextSession;
      return updatedSessions;
    });
  };

  const askQuestion = async (questionToAsk, selectedMode = mode) => {
    if (!questionToAsk.trim() || isLoading) return;

    const trimmedQuestion = questionToAsk.trim();
    const canAppendToActiveSession = activeSession && (activeSession.mode || 'chat') === selectedMode;
    const history = canAppendToActiveSession
      ? activeMessages.flatMap((message) => [
          { role: 'user', text: message.question },
          { role: 'model', text: message.answer },
        ])
      : [];

    setLastSubmittedQuery(trimmedQuestion);
    setLastSubmittedMode(selectedMode);

    try {
      setIsLoading(true);
      setError(null);

      const payload =
        selectedMode === 'compliance_review'
          ? {
              mode: selectedMode,
              submission: trimmedQuestion,
              history,
              sessionId: canAppendToActiveSession ? activeSession.id : undefined,
            }
          : {
              mode: selectedMode,
              query: trimmedQuestion,
              history,
              sessionId: canAppendToActiveSession ? activeSession.id : undefined,
            };

      const response = await api.post('/api/query', payload);
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to get answer');
      }

      const nextSession = normalizeChatSessions([response.data.chatSession || {}])[0];
      if (nextSession) {
        upsertChatSession(nextSession);
        setActiveSessionId(nextSession.id);
        setMode(nextSession.mode || selectedMode);
      }

      setQuery('');
      setIsMobileHistoryOpen(false);
    } catch (requestError) {
      console.error(requestError);
      setError(requestError.response?.data?.error || requestError.message || 'Something went wrong while processing your query.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (event) => {
    event?.preventDefault();
    setVoiceDraftNotice('');
    await askQuestion(query, mode);
  };

  const stopMediaStream = () => {
    if (!mediaStreamRef.current) return;
    mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        resolve(result.split(',')[1] || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const transcribeAndDraft = async (blob) => {
    setIsTranscribing(true);
    try {
      const audioBase64 = await blobToBase64(blob);
      if (!audioBase64) {
        throw new Error('Failed to read recorded audio.');
      }

      const response = await api.post('/api/speech/transcribe', {
        audioBase64,
        mimeType: blob.type || 'audio/webm',
      });

      const transcript = response.data?.transcript?.trim() || '';
      if (!transcript) {
        throw new Error('No speech was detected in the recording.');
      }

      setQuery(transcript);
      setVoiceDraftNotice('Voice converted to text. Press Enter or click Send.');
      inputRef.current?.focus();
    } catch (transcriptionError) {
      setSpeechError(transcriptionError.response?.data?.error || transcriptionError.message || 'Voice transcription failed.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const toggleVoiceInput = async () => {
    if (!isSpeechSupported || isLoading || isTranscribing) return;
    setSpeechError('');

    if (isRecording) {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstart = () => setIsRecording(true);
      recorder.onerror = () => {
        setSpeechError('Microphone recording failed.');
        setIsRecording(false);
        stopMediaStream();
      };
      recorder.onstop = async () => {
        setIsRecording(false);
        const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        stopMediaStream();
        await transcribeAndDraft(audioBlob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch (_error) {
      setSpeechError('Microphone permission is blocked. Please allow access.');
      setIsRecording(false);
      stopMediaStream();
    }
  };

  const historyList = (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => startNewChat(mode)}
        className="premium-btn-primary flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
      >
        <Plus size={15} />
        New chat
      </button>

      {isLoadingHistory ? (
        <div className="flex items-center gap-2 rounded-lg border border-[#e6e0d6] bg-cream-100 px-3 py-2 text-sm text-[#6b7280] dark:border-[#355269] dark:bg-[#1b2c3a] dark:text-[#a9c3d8]">
          <Loader2 size={14} className="animate-spin" />
          Loading chats...
        </div>
      ) : chatSessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#d8d1c5] px-3 py-3 text-sm text-[#6b7280] dark:border-[#355269] dark:text-[#a9c3d8]">
          No saved chats yet.
        </div>
      ) : (
        chatSessions
          .slice()
          .sort((a, b) => new Date(b.lastAskedAt || 0).getTime() - new Date(a.lastAskedAt || 0).getTime())
          .map((session, index) => (
            <button
              key={`${session.id}-history`}
              type="button"
              onClick={() => {
                setActiveSessionId(session.id);
                setMode(session.mode || 'chat');
                setQuery('');
                setError(null);
                setLastSubmittedQuery('');
                setIsMobileHistoryOpen(false);
                inputRef.current?.focus();
              }}
              className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                session.id === activeSessionId
                  ? 'border-[#83b9e7] bg-[#e8f3fb] dark:border-[#4f7391] dark:bg-[#1d3344]'
                  : 'premium-card hover:border-[#b9d8f2] hover:bg-moss-50 dark:hover:border-[#3c5c75] dark:hover:bg-[#1d3344]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[#1a1a1a] dark:text-[#dce8f3]">
                  {session.title || `Chat ${index + 1}`}
                </p>
                <span className="text-[11px] uppercase tracking-[0.08em] text-[#6b7280] dark:text-[#a9c3d8]">
                  {session.mode === 'compliance_review' ? 'Review' : 'Chat'}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-[#6b7280] dark:text-[#a9c3d8]">
                {session.previewQuestion || 'No messages yet.'}
              </p>
            </button>
          ))
      )}
    </div>
  );

  return (
    <section className="premium-surface flex h-full min-h-0 w-full flex-1 overflow-hidden rounded-xl dark:border-[#355269] dark:bg-[#1b2c3a]">
      <aside className="hidden w-72 shrink-0 border-r border-[#e6e0d6] bg-cream-100 px-4 py-4 dark:border-[#355269] dark:bg-[#1b2c3a] lg:flex lg:flex-col">
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#6b7280] dark:text-[#a9c3d8]">Account</p>
          <p className="mt-1 text-sm font-semibold text-[#1a1a1a] dark:text-[#dce8f3]">{user?.fullName}</p>
        </div>
        {historyList}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e6e0d6] bg-cream-50 px-4 dark:border-[#355269] dark:bg-[#1b2c3a]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileHistoryOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e2ddd4] text-[#6b7280] lg:hidden dark:border-[#355269] dark:text-[#a9c3d8]"
            >
              <History size={15} />
            </button>
            <div>
              <h2 className="text-sm font-semibold text-[#1a1a1a] dark:text-[#dce8f3]">
                {activeSession?.title || 'New chat'}
              </h2>
              <p className="text-xs text-[#6b7280] dark:text-[#a9c3d8]">
                {activeSession
                  ? `${activeSession.conversationCount} conversation${activeSession.conversationCount === 1 ? '' : 's'}`
                  : 'Start a new conversation thread'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startNewChat('chat')}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e2ddd4] px-3 text-sm text-[#6b7280] transition hover:bg-moss-50 dark:border-[#355269] dark:text-[#a9c3d8] dark:hover:bg-[#1d3344]"
            >
              <Plus size={14} />
              New
            </button>
            <button
              type="button"
              onClick={() => setMode('chat')}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition ${
                mode === 'chat'
                  ? 'premium-btn-primary'
                  : 'premium-btn-secondary dark:text-[#a9c3d8] dark:hover:bg-[#1d3344]'
              }`}
            >
              <MessageSquareText size={14} />
              Chat
            </button>
            <button
              type="button"
              onClick={() => setMode('compliance_review')}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition ${
                mode === 'compliance_review'
                  ? 'premium-btn-primary'
                  : 'premium-btn-secondary dark:text-[#a9c3d8] dark:hover:bg-[#1d3344]'
              }`}
            >
              <ClipboardCheck size={14} />
              Review
            </button>
          </div>
        </header>

        <div ref={chatViewportRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-cream-100 px-4 py-5 touch-pan-y dark:bg-[#0f1820] sm:px-6">
          {activeMessages.length === 0 && !isLoading && !error && (
            <div className="premium-card mx-auto mt-8 max-w-xl rounded-xl p-6 text-center">
              <h3 className="text-lg font-semibold text-[#1a1a1a] dark:text-[#dce8f3]">
                {activeSession ? 'Continue this chat' : 'How can I help today?'}
              </h3>
              <p className="mt-2 text-sm text-[#6b7280] dark:text-[#a9c3d8]">
                Ask questions from indexed rules, or switch to review mode for detailed compliance checks.
              </p>
            </div>
          )}

          {error && (
            <div className="mx-auto mb-4 max-w-2xl rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-500/10">
              <p className="text-sm text-rose-700 dark:text-rose-200">{error}</p>
              <button
                type="button"
                onClick={() => askQuestion(lastSubmittedQuery, lastSubmittedMode)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#e2ddd4] bg-cream-50 px-3 py-2 text-sm text-[#6b7280] hover:bg-moss-50 dark:border-[#355269] dark:bg-[#1b2c3a] dark:text-[#a9c3d8] dark:hover:bg-[#1d3344]"
              >
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          )}

          <div className="mx-auto max-w-3xl space-y-6">
            {activeMessages.map((message, index) => (
              <AnswerCard
                key={message.id}
                mode={message.mode || 'chat'}
                question={message.question}
                answer={message.answer}
                sources={message.sources}
                animateTyping={index === activeMessages.length - 1}
              />
            ))}

            {isLoading && (
              <div className="space-y-4">
                <div className="premium-pill rounded-xl px-4 py-3 text-center dark:border-[#355269] dark:bg-[#1d3344]">
                  <p className="text-base font-semibold uppercase tracking-[0.08em] text-moss-700 dark:text-[#a9d6f7]">Processing your query...</p>
                  <p className="mt-1 text-sm text-[#6b7280] dark:text-[#a9c3d8]">Retrieving rule context and generating response</p>
                </div>
                <div className="h-24 animate-pulse rounded-xl border border-[#e6e0d6] bg-cream-50 dark:border-[#355269] dark:bg-[#1b2c3a]" />
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSearch} className="shrink-0 border-t border-[#e6e0d6] bg-cream-50 px-4 py-3 dark:border-[#355269] dark:bg-[#1b2c3a]">
          <div className="mx-auto max-w-3xl">
            <div className="premium-input flex items-end gap-2 rounded-xl p-2 dark:bg-[#1b2c3a]">
              {mode === 'compliance_review' ? (
                <textarea
                  ref={inputRef}
                  rows={3}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVoiceDraftNotice('');
                  }}
                  placeholder="Paste structured lines for compliance review..."
                  disabled={isLoading}
                  className="max-h-44 min-h-20 flex-1 resize-y border-0 bg-transparent px-2 py-1 text-sm text-[#1a1a1a] outline-none placeholder:text-[#8a8f99] disabled:opacity-50 dark:text-[#dce8f3] dark:placeholder:text-[#95afc4]"
                />
              ) : (
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVoiceDraftNotice('');
                  }}
                  placeholder="Ask about permits, zoning, taxes, water rules..."
                  disabled={isLoading}
                  className="h-10 flex-1 border-0 bg-transparent px-2 text-sm text-[#1a1a1a] outline-none placeholder:text-[#8a8f99] disabled:opacity-50 dark:text-[#dce8f3] dark:placeholder:text-[#95afc4]"
                />
              )}

              <button
                type="button"
                onClick={toggleVoiceInput}
                disabled={!isSpeechSupported || isLoading || isTranscribing}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition ${
                  isRecording
                    ? 'border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300'
                    : 'border-[#cfdfec] bg-cream-50 text-[#6b7280] hover:bg-moss-50 dark:border-[#355269] dark:bg-[#1b2c3a] dark:text-[#a9c3d8] dark:hover:bg-[#1d3344]'
                } disabled:opacity-50`}
                aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
              >
                {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
              </button>

              <button
                type="submit"
                disabled={!query.trim() || isLoading}
                className="premium-btn-primary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:opacity-50"
              >
                {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                Send
              </button>
            </div>

            {speechError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{speechError}</p>}
            {voiceDraftNotice && <p className="mt-2 text-xs text-moss-700 dark:text-[#a9d6f7]">{voiceDraftNotice}</p>}
            {isTranscribing && <p className="mt-2 text-xs text-[#6b7280] dark:text-[#a9c3d8]">Transcribing voice...</p>}
          </div>
        </form>
      </div>

      {isMobileHistoryOpen && (
        <>
          <button
            type="button"
            onClick={() => setIsMobileHistoryOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-label="Close history"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-[86vw] max-w-sm border-r border-[#e6e0d6] bg-cream-50 p-4 lg:hidden dark:border-[#355269] dark:bg-[#1b2c3a]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1a1a1a] dark:text-[#dce8f3]">Chat history</h3>
              <button
                type="button"
                onClick={() => setIsMobileHistoryOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e2ddd4] text-[#6b7280] dark:border-[#355269] dark:text-[#a9c3d8]"
                aria-label="Close history panel"
              >
                <X size={15} />
              </button>
            </div>
            {historyList}
          </div>
        </>
      )}
    </section>
  );
};

export default SearchArea;
