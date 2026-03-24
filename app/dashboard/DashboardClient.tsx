'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createClient } from '@/lib/supabase-browser';
import { db } from '@/lib/database';
import { PERSONAS, LEVELS } from '@/lib/constants';

type Props = {
  userId: string;
  initialProfile: any;
  initialMemory: any[];
  initialCorrections: any[];
  initialStats: any;
  initialStreak: number;
};

export default function DashboardClient({
  userId,
  initialProfile,
  initialMemory,
  initialCorrections,
  initialStats,
  initialStreak,
}: Props) {
  const { signOut } = useAuth();
  const supabase = createClient();

  // Profile & settings
  const [profile, setProfile] = useState(initialProfile);
  const [needsOnboarding, setNeedsOnboarding] = useState(!initialProfile?.onboarded);

  // Chat state
  const [messages, setMessages] = useState<any[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStart, setSessionStart] = useState<number | null>(null);

  // Data
  const [memoryNotes, setMemoryNotes] = useState(initialMemory);
  const [corrections, setCorrections] = useState(initialCorrections);
  const [stats, setStats] = useState(initialStats);
  const [streak, setStreak] = useState(initialStreak);

  // UI
  const [activeTab, setActiveTab] = useState<'home' | 'chat' | 'call' | 'progress'>('home');
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const callRecognitionRef = useRef<any>(null);
  const callTranscriptRef = useRef<any[]>([]);
  const callTimerRef = useRef<any>(null);

  // Voice call state
  const [callActive, setCallActive] = useState(false);
  const [callListening, setCallListening] = useState(false);
  const [callSpeaking, setCallSpeaking] = useState(false);
  const [callThinking, setCallThinking] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callConvId, setCallConvId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'active' | 'ended'>('idle');

  // Refs to avoid stale closures in speech callbacks
  const callActiveRef = useRef(false);
  const callConvIdRef = useRef<string | null>(null);
  const callProcessingRef = useRef(false); // prevents double-processing

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Load voices for TTS
  useEffect(() => {
    window.speechSynthesis?.getVoices();
  }, []);

  // ── Speech Recognition ─────────────────────────────
  const startListening = () => {
    setMicError('');
    const SRClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRClass) {
      setMicError('Speech recognition not available. Please use Chrome.');
      return;
    }
    try {
      const recognition = new SRClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (e: any) => {
        const text = e.results[0]?.[0]?.transcript;
        if (text) {
          setInputText(text);
          setIsListening(false);
          setTimeout(() => sendMessage(text, true), 50);
        }
      };
      recognition.onerror = (e: any) => {
        setIsListening(false);
        if (e.error === 'not-allowed') {
          setMicError('Microphone access denied. Allow mic in browser settings.');
        } else if (e.error === 'no-speech') {
          setMicError('No speech detected. Try again.');
        } else {
          setMicError('Mic error: ' + e.error);
        }
      };
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch (err) {
      setMicError('Could not start microphone.');
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  // ── Speak text ─────────────────────────────────────
  const speak = (text: string, onDone?: () => void) => {
    if (!('speechSynthesis' in window)) { onDone?.(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    u.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => v.lang.startsWith('en') && v.name.includes('Google')) ||
      voices.find((v) => v.lang.startsWith('en-US')) ||
      voices.find((v) => v.lang.startsWith('en'));
    if (preferred) u.voice = preferred;
    u.onend = () => { setIsSpeaking(false); setCallSpeaking(false); onDone?.(); };
    u.onerror = () => { setIsSpeaking(false); setCallSpeaking(false); onDone?.(); };
    setIsSpeaking(true);
    window.speechSynthesis.speak(u);
  };

  // ── Voice Call System Prompt ───────────────────────
  const buildCallSystemPrompt = () => {
    const persona = profile?.persona || 'friend';
    const p = PERSONAS[persona];
    let prompt = p.system;
    prompt += `\n\nThe learner's name is ${profile?.name || 'there'}. Their level is ${profile?.level || 'B1 - Intermediate'}.`;

    if (memoryNotes.length > 0) {
      prompt += `\n\nHere's what you remember about them from past conversations:\n${memoryNotes
        .slice(0, 20)
        .map((n: any) => `- ${n.content}`)
        .join('\n')}`;
    }

    prompt += `\n\nYou are on a VOICE CALL with the learner. CRITICAL RULES:
- This is a spoken conversation. Keep responses SHORT (1-3 sentences max) so it feels like a natural phone call.
- NEVER use markdown, asterisks, bullet points, or any written formatting. Everything you say will be read aloud by text-to-speech.
- Do NOT correct spelling, capitalization, or punctuation — the user is SPEAKING, not typing. Their text comes from speech-to-text transcription.
- DO gently correct grammar mistakes in their speech (wrong verb tense, wrong preposition, etc.) by naturally rephrasing.
- DO notice vocabulary choices and suggest better words when appropriate.
- Be conversational and warm. Ask follow-up questions. Keep the conversation flowing naturally like a real phone call.
- If you hear a grammar mistake, correct it casually inline, like: "Oh you mean you WENT there, not goed — but that sounds like a great trip! Tell me more."`;
    return prompt;
  };

  // ── Start Voice Call ───────────────────────────────
  const startCall = async () => {
    setCallStatus('connecting');
    setCallSeconds(0);
    callTranscriptRef.current = [];
    callProcessingRef.current = false;

    // Create conversation in DB
    const conv = await db.createConversation(supabase, userId, profile?.persona || 'friend');
    const convId = conv?.id || null;
    setCallConvId(convId);
    callConvIdRef.current = convId;

    // Start timer
    callTimerRef.current = setInterval(() => {
      setCallSeconds((s) => s + 1);
    }, 1000);

    setCallActive(true);
    callActiveRef.current = true;
    setCallStatus('active');

    // AI speaks first
    const greeting = memoryNotes.length > 0
      ? `Hey ${profile?.name || 'there'}! Great to hear from you again. How have you been?`
      : `Hey ${profile?.name || 'there'}! Nice to meet you. How are you doing today?`;

    callTranscriptRef.current.push({ role: 'assistant', content: greeting });
    if (convId) {
      await db.addMessage(supabase, convId, userId, 'assistant', greeting);
    }

    setCallSpeaking(true);
    speak(greeting, () => {
      setCallSpeaking(false);
      if (callActiveRef.current) {
        startCallListening();
      }
    });
  };

  // ── Call: Start listening for user speech ──────────
  const startCallListening = () => {
    if (!callActiveRef.current) return;

    const SRClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRClass) return;

    try {
      const recognition = new SRClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      let gotResult = false;

      recognition.onresult = async (e: any) => {
        const text = e.results[0]?.[0]?.transcript;
        if (!text || callProcessingRef.current) return;

        gotResult = true;
        callProcessingRef.current = true;
        setCallListening(false);
        callTranscriptRef.current.push({ role: 'user', content: text });

        // Save to DB
        const currentConvId = callConvIdRef.current;
        if (currentConvId) {
          await db.addMessage(supabase, currentConvId, userId, 'user', text);
        }

        // Extract memory
        const memoryTriggers = [
          'I work', 'my job', 'I live', "I'm from", 'my name',
          'I like', 'I love', 'my family', 'my wife', 'my husband',
          'my kid', 'I have a', 'I want to', 'my hobby', 'I study', 'my goal',
        ];
        if (memoryTriggers.some((t) => text.toLowerCase().includes(t))) {
          await db.addMemoryNote(supabase, userId, text, 'general');
          setMemoryNotes((prev) => [{ content: text, category: 'general', created_at: new Date().toISOString() }, ...prev]);
        }

        // Get AI response
        setCallThinking(true);
        try {
          const apiMessages = callTranscriptRef.current.slice(-20).map((m) => ({
            role: m.role,
            content: m.role === 'user' ? `[VOICE INPUT] ${m.content}` : m.content,
          }));

          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: apiMessages,
              system: buildCallSystemPrompt(),
            }),
          });

          const data = await res.json();
          const rawReply = data.content?.[0]?.text || "Sorry, I didn't catch that. Could you say it again?";
          const reply = rawReply.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');

          callTranscriptRef.current.push({ role: 'assistant', content: reply });
          if (currentConvId) {
            await db.addMessage(supabase, currentConvId, userId, 'assistant', reply);
          }

          setCallThinking(false);
          setCallSpeaking(true);
          callProcessingRef.current = false;

          speak(reply, () => {
            setCallSpeaking(false);
            // Auto-listen again after AI finishes speaking
            if (callActiveRef.current) {
              startCallListening();
            }
          });
        } catch {
          setCallThinking(false);
          callProcessingRef.current = false;
          if (callActiveRef.current) {
            startCallListening();
          }
        }
      };

      recognition.onerror = (e: any) => {
        setCallListening(false);
        // Retry listening after a short pause (unless it's an abort from ending call)
        if (callActiveRef.current && e.error !== 'aborted') {
          setTimeout(() => {
            if (callActiveRef.current) startCallListening();
          }, 500);
        }
      };

      recognition.onend = () => {
        setCallListening(false);
        // If no result was captured and we're still in a call, restart listening
        // (handles silence timeout)
        if (!gotResult && !callProcessingRef.current && callActiveRef.current) {
          setTimeout(() => {
            if (callActiveRef.current) startCallListening();
          }, 300);
        }
      };

      callRecognitionRef.current = recognition;
      recognition.start();
      setCallListening(true);
    } catch {
      setCallListening(false);
    }
  };

  // ── End Voice Call ─────────────────────────────────
  const endCall = async () => {
    callActiveRef.current = false;
    setCallActive(false);
    setCallStatus('ended');
    setCallListening(false);
    setCallSpeaking(false);
    setCallThinking(false);
    callProcessingRef.current = false;
    callRecognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setAnalyzing(true);

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    const callMinutes = Math.max(Math.round(callSeconds / 60), 1);

    // Analyze the call
    let analysis = { corrections: [], newWords: [], fluencyScore: 70, tip: 'Keep practicing daily!' };
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: callTranscriptRef.current.slice(-20) }),
      });
      analysis = await res.json();
    } catch {}

    // Save to Supabase
    const currentConvId = callConvIdRef.current;
    if (currentConvId) {
      await db.endConversation(supabase, currentConvId, {
        minutes: callMinutes,
        fluencyScore: analysis.fluencyScore || 70,
        tip: analysis.tip || '',
      });

      if (analysis.corrections?.length) {
        await db.addCorrections(supabase, userId, currentConvId, analysis.corrections);
        setCorrections((prev) => [...analysis.corrections.map((c: any) => ({ ...c, created_at: new Date().toISOString() })), ...prev]);
      }

      await db.upsertDailyStats(supabase, userId, callMinutes, analysis.fluencyScore || 70, 0);
    }

    // Refresh stats
    const [newStats, newStreak] = await Promise.all([
      db.getStats(supabase, userId),
      db.getStreak(supabase, userId),
    ]);
    setStats(newStats);
    setStreak(newStreak);

    setAnalyzing(false);
    setSummary({ ...analysis, minutes: callMinutes });
    setShowSummary(true);
    setCallConvId(null);
    callConvIdRef.current = null;
    setCallStatus('idle');
    setCallSeconds(0);
  };

  // Format seconds to mm:ss
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ── Delete Account ─────────────────────────────────
  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/delete-account', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await signOut();
      } else {
        alert('Failed to delete account. Please try again.');
        setDeleting(false);
        setShowDeleteConfirm(false);
      }
    } catch {
      alert('Failed to delete account. Please try again.');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // ── Build system prompt with memory ────────────────
  const buildSystemPrompt = () => {
    const persona = profile?.persona || 'friend';
    const p = PERSONAS[persona];
    let prompt = p.system;
    prompt += `\n\nThe learner's name is ${profile?.name || 'there'}. Their level is ${profile?.level || 'B1 - Intermediate'}.`;

    if (memoryNotes.length > 0) {
      prompt += `\n\nHere's what you remember about them from past conversations:\n${memoryNotes
        .slice(0, 20)
        .map((n: any) => `- ${n.content}`)
        .join('\n')}`;
    }

    if (corrections.length > 0) {
      prompt += `\n\nCommon mistakes they make (gently address these):\n${corrections
        .slice(0, 5)
        .map((c: any) => `- Says "${c.original}" instead of "${c.corrected}"`)
        .join('\n')}`;
    }

    prompt += `\n\nIMPORTANT RULES:
- Keep responses SHORT (2-4 sentences). Be encouraging.
- If they share personal info, remember it.
- Correct mistakes naturally within conversation flow.
- NEVER use markdown formatting like **bold**, *italics*, or any asterisks in your responses. Write in plain text only. Your responses will be read aloud by text-to-speech, so they must sound natural when spoken.
- When the user's message is marked as [VOICE INPUT], do NOT correct capitalization, punctuation, or formatting — those are speech-to-text artifacts, not the user's mistakes. Only correct actual grammar and vocabulary errors in voice messages.`;
    return prompt;
  };

  // ── Send message (via server proxy) ────────────────
  const sendMessage = async (text: string, fromMic = false) => {
    if (!text?.trim()) return;

    const displayText = text.trim();
    // Tag voice messages so AI knows not to correct formatting
    const aiText = fromMic ? `[VOICE INPUT] ${displayText}` : displayText;

    const userMsg = { role: 'user', content: displayText, ts: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    setIsThinking(true);

    // Start session if not active
    let convId = conversationId;
    if (!sessionActive) {
      setSessionActive(true);
      setSessionStart(Date.now());
      const conv = await db.createConversation(supabase, userId, profile?.persona || 'friend');
      convId = conv?.id || null;
      setConversationId(convId);
    }

    // Save user message to DB
    if (convId) {
      await db.addMessage(supabase, convId, userId, 'user', displayText);
    }

    // Extract memory from user message
    const memoryTriggers = [
      'I work', 'my job', 'I live', "I'm from", 'my name',
      'I like', 'I love', 'my family', 'my wife', 'my husband',
      'my kid', 'I have a', 'I want to', 'my hobby', 'I study', 'my goal',
    ];
    if (memoryTriggers.some((t) => displayText.toLowerCase().includes(t))) {
      await db.addMemoryNote(supabase, userId, displayText, 'general');
      setMemoryNotes((prev) => [{ content: displayText, category: 'general', created_at: new Date().toISOString() }, ...prev]);
    }

    try {
      // Build API messages — use tagged version for AI context
      const apiMessages = newMessages.slice(-20).map((m, i) => ({
        role: m.role,
        content: i === newMessages.length - 1 && fromMic ? aiText : m.content,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          system: buildSystemPrompt(),
        }),
      });

      const data = await res.json();
      const rawReply = data.content?.[0]?.text || "Sorry, I had a little hiccup. Could you say that again?";
      // Strip markdown formatting (bold, italics) so it reads clean in UI and TTS
      const reply = rawReply.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');

      const aiMsg = { role: 'assistant', content: reply, ts: Date.now() };
      setMessages((prev) => [...prev, aiMsg]);

      // Save AI message to DB
      if (convId) {
        await db.addMessage(supabase, convId, userId, 'assistant', reply);
      }

      // Speak the reply
      speak(reply);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Hmm, I'm having trouble connecting. Let's try again!", ts: Date.now() },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  // ── End session ────────────────────────────────────
  const endSession = async () => {
    setSessionActive(false);
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setAnalyzing(true);

    const sessionMinutes = sessionStart ? Math.max(Math.round((Date.now() - sessionStart) / 60000), 1) : 1;

    // Analyze via server proxy
    let analysis = { corrections: [], newWords: [], fluencyScore: 70, tip: 'Keep practicing daily!' };
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.slice(-20) }),
      });
      analysis = await res.json();
    } catch {}

    // Save everything to Supabase
    if (conversationId) {
      await db.endConversation(supabase, conversationId, {
        minutes: sessionMinutes,
        fluencyScore: analysis.fluencyScore || 70,
        tip: analysis.tip || '',
      });

      if (analysis.corrections?.length) {
        await db.addCorrections(supabase, userId, conversationId, analysis.corrections);
        setCorrections((prev) => [...analysis.corrections.map((c: any) => ({ ...c, created_at: new Date().toISOString() })), ...prev]);
      }

      await db.upsertDailyStats(supabase, userId, sessionMinutes, analysis.fluencyScore || 70, 0);
    }

    // Refresh stats
    const [newStats, newStreak] = await Promise.all([
      db.getStats(supabase, userId),
      db.getStreak(supabase, userId),
    ]);
    setStats(newStats);
    setStreak(newStreak);

    setAnalyzing(false);
    setSummary({ ...analysis, minutes: sessionMinutes });
    setShowSummary(true);
    setConversationId(null);
  };

  // ── Onboarding save ────────────────────────────────
  const saveOnboarding = async (name: string, level: string, persona: string) => {
    await db.updateProfile(supabase, userId, { name, level, persona, onboarded: true });
    setProfile({ ...profile, name, level, persona, onboarded: true });
    setNeedsOnboarding(false);
  };

  // ── Computed values ────────────────────────────────
  const persona = PERSONAS[profile?.persona || 'friend'];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // ── ONBOARDING ─────────────────────────────────────
  if (needsOnboarding) {
    return <OnboardingFlow onComplete={saveOnboarding} />;
  }

  // ── MAIN APP ───────────────────────────────────────
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--surface2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img 
            src="/bird.png" 
            alt="FluentBuddy Logo"
            style={{ 
              width: 32, 
              height: 32, 
              borderRadius: 8,
              transition: 'transform 0.2s',
              cursor: 'pointer'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          />
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 600, color: 'var(--amber)' }}>FluentBuddy</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: 'var(--surface2)', padding: '5px 12px', borderRadius: 20, fontSize: 14, fontWeight: 600, color: 'var(--amber)' }}>
            🔥 {streak}
          </span>
          <button onClick={signOut} style={{ background: 'none', color: 'var(--text3)', fontSize: 12 }}>Sign out</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', paddingBottom: 80 }}>
        {activeTab === 'home' && (
          <div style={{ animation: 'fadeUp 0.4s ease' }}>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, lineHeight: 1.2 }}>
              {greeting}, {profile?.name}!
            </h1>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 6 }}>Ready for some English practice?</p>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '20px 0' }}>
              {[
                { value: stats.totalSessions, label: 'Sessions' },
                { value: `${stats.totalMinutes}m`, label: 'Practice' },
                { value: stats.avgFluency || '—', label: 'Fluency' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Fraunces', serif" }}>{s.value}</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Start Chat CTA */}
            <button onClick={() => setActiveTab('chat')} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--surface)', borderRadius: 'var(--radius)', animation: 'breathe 3s ease infinite', color: 'var(--text)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
                <span style={{ fontSize: 36 }}>{persona.emoji}</span>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 17, display: 'block' }}>Chat with {persona.name}</span>
                  <span style={{ color: 'var(--text2)', fontSize: 13 }}>
                    {memoryNotes.length > 0 ? 'Continue where you left off' : 'Start a new conversation'}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 20 }}>→</span>
            </button>

            {/* Persona Switcher */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '16px 18px', marginTop: 16, border: '1px solid var(--surface2)' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>🎭 Your AI Partner</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
                {Object.entries(PERSONAS).map(([key, p]) => (
                  <button
                    key={key}
                    onClick={async () => {
                      await db.updateProfile(supabase, userId, { persona: key });
                      setProfile({ ...profile, persona: key });
                    }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '10px 6px', borderRadius: 'var(--radius-sm)',
                      background: profile?.persona === key ? 'var(--amber-dim)' : 'var(--surface2)',
                      border: profile?.persona === key ? '2px solid var(--amber)' : '2px solid transparent',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{p.emoji}</span>
                    <span style={{ fontSize: 11, color: profile?.persona === key ? 'var(--text)' : 'var(--text3)', fontWeight: 500 }}>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Memory */}
            {memoryNotes.length > 0 && (
              <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '16px 18px', marginTop: 16 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>🧠 What I Remember</span>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {memoryNotes.slice(0, 5).map((note: any, i: number) => (
                    <p key={i} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>• {note.content}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Danger Zone */}
            <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--surface2)' }}>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  width: '100%', padding: '12px', borderRadius: 'var(--radius-sm)',
                  background: 'transparent', color: 'var(--red)',
                  fontSize: 13, fontWeight: 500, border: '1px solid var(--red-dim)',
                  opacity: 0.7,
                }}
              >
                Delete Account
              </button>
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', margin: '-20px -16px' }}>
            {/* Chat header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--surface2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 28 }}>{persona.emoji}</span>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{persona.name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: isSpeaking ? 'var(--green)' : isThinking ? 'var(--amber)' : 'var(--text3)' }}>
                    {isSpeaking ? 'Speaking...' : isThinking ? 'Thinking...' : 'Online'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {messages.length > 0 && !sessionActive && (
                  <button onClick={() => setMessages([])} style={{ background: 'var(--surface3)', color: 'var(--text2)', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1px solid var(--text3)' }}>
                    Clear Chat
                  </button>
                )}
                {sessionActive && (
                  <button onClick={endSession} style={{ background: 'var(--red-dim)', color: 'var(--red)', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                    End Session
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.length === 0 && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, opacity: 0.7 }}>
                  <span style={{ fontSize: 48 }}>{persona.emoji}</span>
                  <p style={{ color: 'var(--text2)', fontSize: 15, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
                    Hey there! Type a message to start practicing English with me!
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', animation: 'fadeUp 0.3s ease' }}>
                  {msg.role === 'assistant' && <span style={{ fontSize: 20, flexShrink: 0, marginBottom: 2 }}>{persona.emoji}</span>}
                  <div style={{
                    padding: '10px 16px', borderRadius: 18, fontSize: 14, lineHeight: 1.6, maxWidth: '78%', wordWrap: 'break-word' as const,
                    ...(msg.role === 'user'
                      ? { background: 'var(--amber)', color: '#0f0f0f', borderBottomRightRadius: 4, fontWeight: 450 }
                      : { background: 'var(--surface2)', color: 'var(--text)', borderBottomLeftRadius: 4 }),
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {isThinking && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{persona.emoji}</span>
                  <div style={{ padding: '10px 16px', borderRadius: 18, background: 'var(--surface2)', borderBottomLeftRadius: 4 }}>
                    <span style={{ color: 'var(--text3)', fontSize: 14 }}>● ● ●</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--surface2)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage(inputText)}
                  placeholder="Type in English..."
                  style={{ flex: 1, background: 'var(--surface)', color: 'var(--text)', padding: '12px 16px', borderRadius: 24, fontSize: 14 }}
                />
                <button
                  onClick={() => sendMessage(inputText)}
                  style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--amber)', color: '#0f0f0f', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: inputText.trim() ? 1 : 0.4, flexShrink: 0 }}
                >
                  ↑
                </button>
              </div>
              <button
                onClick={isListening ? stopListening : startListening}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  background: isListening ? 'var(--red-dim)' : 'var(--surface)',
                  color: isListening ? 'var(--red)' : 'var(--text2)',
                  fontSize: 14,
                  fontWeight: 500,
                  textAlign: 'center' as const,
                  marginTop: 8,
                }}
              >
                {isListening ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--red)', animation: 'pulse 1s infinite', display: 'inline-block' }} />
                    Listening... tap to stop
                  </span>
                ) : (
                  <span>🎤 Tap to speak</span>
                )}
              </button>
              {micError && (
                <p style={{ fontSize: 12, color: 'var(--amber)', textAlign: 'center' as const, marginTop: 6, lineHeight: 1.5 }}>
                  {micError}
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'call' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 140px)', margin: '-20px -16px', background: 'var(--bg)', animation: 'fadeUp 0.4s ease' }}>
            {callStatus === 'idle' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                {/* Avatar */}
                <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56 }}>
                  {persona.emoji}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600 }}>Call {persona.name}</h2>
                  <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>Practice speaking English — no text, just talking</p>
                </div>
                <button
                  onClick={startCall}
                  style={{
                    width: 72, height: 72, borderRadius: '50%', background: 'var(--green)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28, marginTop: 20, boxShadow: '0 0 30px rgba(74, 222, 128, 0.3)',
                  }}
                >
                  📞
                </button>
                <span style={{ color: 'var(--text3)', fontSize: 13 }}>Tap to start call</span>
              </div>
            )}

            {(callStatus === 'connecting' || callStatus === 'active') && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%', padding: '0 20px' }}>
                {/* Pulsing avatar */}
                <div style={{
                  width: 130, height: 130, borderRadius: '50%',
                  background: callSpeaking ? 'var(--amber-dim)' : callListening ? 'var(--green-dim)' : 'var(--surface2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60,
                  transition: 'all 0.5s ease',
                  boxShadow: callSpeaking
                    ? '0 0 40px rgba(245, 166, 35, 0.4), 0 0 80px rgba(245, 166, 35, 0.15)'
                    : callListening
                    ? '0 0 40px rgba(74, 222, 128, 0.4), 0 0 80px rgba(74, 222, 128, 0.15)'
                    : '0 0 20px rgba(255,255,255,0.05)',
                  animation: (callSpeaking || callListening) ? 'pulse 2s ease infinite' : 'none',
                }}>
                  {persona.emoji}
                </div>

                <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600 }}>
                  {persona.name}
                </h3>

                {/* Status */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 20px', borderRadius: 20,
                  background: 'var(--surface)',
                  fontSize: 14, color: 'var(--text2)',
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: callSpeaking ? 'var(--amber)' : callListening ? 'var(--green)' : callThinking ? 'var(--blue)' : 'var(--text3)',
                    animation: (callSpeaking || callListening || callThinking) ? 'pulse 1s infinite' : 'none',
                    display: 'inline-block',
                  }} />
                  {callStatus === 'connecting' ? 'Connecting...' :
                   callSpeaking ? `${persona.name} is speaking...` :
                   callThinking ? `${persona.name} is thinking...` :
                   callListening ? 'Listening to you...' :
                   'On call'}
                </div>

                {/* Timer */}
                <span style={{
                  fontFamily: "'DM Sans', monospace", fontSize: 32, fontWeight: 300,
                  color: 'var(--text)', letterSpacing: 4, marginTop: 8,
                }}>
                  {formatTime(callSeconds)}
                </span>

                {/* Waveform animation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 40, marginTop: 8 }}>
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 3,
                        borderRadius: 2,
                        background: callSpeaking ? 'var(--amber)' : callListening ? 'var(--green)' : 'var(--surface3)',
                        height: (callSpeaking || callListening)
                          ? `${8 + Math.random() * 28}px`
                          : '6px',
                        transition: 'height 0.15s ease, background 0.3s ease',
                        animation: (callSpeaking || callListening) ? `waveBar 0.5s ease ${i * 0.05}s infinite alternate` : 'none',
                      }}
                    />
                  ))}
                </div>

                {/* End call button */}
                <button
                  onClick={endCall}
                  style={{
                    width: 64, height: 64, borderRadius: '50%', background: 'var(--red)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, marginTop: 32, boxShadow: '0 0 30px rgba(248, 113, 113, 0.3)',
                    color: '#fff',
                  }}
                >
                  ✕
                </button>
                <span style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>End call</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'progress' && (
          <div style={{ animation: 'fadeUp 0.4s ease' }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, marginBottom: 24 }}>Your Progress</h2>

            {/* Fluency Score - hero card */}
            <div style={{
              background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)',
              borderRadius: 'var(--radius)', padding: '28px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              border: '1px solid var(--surface3)',
            }}>
              <div>
                <span style={{ color: 'var(--text2)', fontSize: 13, fontWeight: 500 }}>Average Fluency Score</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 56, fontWeight: 700, color: 'var(--amber)', fontFamily: "'Fraunces', serif" }}>
                    {stats.avgFluency || '—'}
                  </span>
                  <span style={{ color: 'var(--text3)', fontSize: 16 }}>/100</span>
                </div>
              </div>
              {/* Mini bar chart of recent scores */}
              {stats.fluencyScores?.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
                  {(stats.fluencyScores as number[]).slice(-10).map((s: number, i: number) => (
                    <div
                      key={i}
                      style={{
                        width: 8,
                        height: `${Math.max((s / 100) * 60, 4)}px`,
                        background: s >= 80 ? 'var(--green)' : s >= 60 ? 'var(--amber)' : 'var(--red)',
                        borderRadius: 3,
                        opacity: 0.5 + (i / 20),
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Stats grid - 3 equal cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
              <div style={{
                background: 'var(--surface)', borderRadius: 'var(--radius)',
                padding: '20px 18px', border: '1px solid var(--surface2)',
              }}>
                <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--green)', fontFamily: "'Fraunces', serif", display: 'block' }}>
                  {streak}
                </span>
                <span style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4, display: 'block' }}>Day Streak 🔥</span>
              </div>
              <div style={{
                background: 'var(--surface)', borderRadius: 'var(--radius)',
                padding: '20px 18px', border: '1px solid var(--surface2)',
              }}>
                <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--blue)', fontFamily: "'Fraunces', serif", display: 'block' }}>
                  {stats.totalSessions}
                </span>
                <span style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4, display: 'block' }}>Sessions</span>
              </div>
              <div style={{
                background: 'var(--surface)', borderRadius: 'var(--radius)',
                padding: '20px 18px', border: '1px solid var(--surface2)',
              }}>
                <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--text)', fontFamily: "'Fraunces', serif", display: 'block' }}>
                  {stats.totalMinutes}m
                </span>
                <span style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4, display: 'block' }}>Practice Time</span>
              </div>
            </div>

            {/* Corrections */}
            {corrections.length > 0 && (
              <div style={{
                background: 'var(--surface)', borderRadius: 'var(--radius)',
                padding: '20px 22px', marginTop: 16, border: '1px solid var(--surface2)',
              }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>✏️ Recent Corrections</span>
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {corrections.slice(0, 5).map((c: any, i: number) => (
                    <div key={i} style={{
                      padding: '12px 14px', background: 'var(--surface2)',
                      borderRadius: 'var(--radius-sm)', lineHeight: 1.7,
                    }}>
                      <div style={{ fontSize: 14 }}>
                        <span style={{ color: 'var(--red)', textDecoration: 'line-through' }}>{c.original}</span>
                        <span style={{ color: 'var(--text3)', margin: '0 8px' }}>→</span>
                        <span style={{ color: 'var(--green)', fontWeight: 500 }}>{c.corrected}</span>
                      </div>
                      {c.explanation && (
                        <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>{c.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {corrections.length === 0 && stats.totalSessions === 0 && (
              <div style={{
                background: 'var(--surface)', borderRadius: 'var(--radius)',
                padding: '40px 20px', marginTop: 16, textAlign: 'center' as const,
                border: '1px solid var(--surface2)',
              }}>
                <span style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>📈</span>
                <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 }}>
                  Complete your first session to see your progress here!
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 0', borderTop: '1px solid var(--surface2)', background: 'var(--bg)', position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 640, zIndex: 10 }}>
        {[
          { id: 'home' as const, icon: '🏠', label: 'Home' },
          { id: 'chat' as const, icon: '💬', label: 'Chat' },
          { id: 'call' as const, icon: '📞', label: 'Call' },
          { id: 'progress' as const, icon: '📊', label: 'Progress' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', padding: '6px 16px', borderRadius: 12 }}
          >
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 500, marginTop: 2, color: activeTab === tab.id ? 'var(--amber)' : 'var(--text3)' }}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Analyzing Overlay */}
      {analyzing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
          backdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', zIndex: 100,
          animation: 'fadeUp 0.3s ease', gap: 20,
        }}>
          {/* Spinning loader */}
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            border: '3px solid var(--surface3)',
            borderTopColor: 'var(--amber)',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{
            fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600,
            color: 'var(--text)', textAlign: 'center',
          }}>
            Analyzing your session...
          </p>
          <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
            Reviewing grammar, vocabulary, and fluency
          </p>
        </div>
      )}

      {/* Delete Account Confirmation */}
      {showDeleteConfirm && (
        <div onClick={() => !deleting && setShowDeleteConfirm(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
          backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 100, animation: 'fadeUp 0.3s ease',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--surface)', borderRadius: 'var(--radius)',
            padding: '28px 24px', maxWidth: 360, width: '90%',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            animation: 'fadeUp 0.4s ease',
          }}>
            {deleting ? (
              <>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  border: '3px solid var(--surface3)', borderTopColor: 'var(--red)',
                  animation: 'spin 0.8s linear infinite', marginBottom: 16,
                }} />
                <p style={{ color: 'var(--text2)', fontSize: 14 }}>Deleting your account...</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, textAlign: 'center' as const }}>
                  Delete your account?
                </h3>
                <p style={{
                  color: 'var(--text2)', fontSize: 13, textAlign: 'center' as const,
                  marginTop: 8, lineHeight: 1.6, maxWidth: 280,
                }}>
                  This will permanently delete all your data — conversations, memory, progress, and stats. This cannot be undone.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 24, width: '100%' }}>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    style={{
                      flex: 1, padding: '12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface2)', color: 'var(--text)',
                      fontSize: 14, fontWeight: 600,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={deleteAccount}
                    style={{
                      flex: 1, padding: '12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--red)', color: '#fff',
                      fontSize: 14, fontWeight: 600,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Summary Modal */}
      {showSummary && summary && (
        <div onClick={() => setShowSummary(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '28px 24px', maxWidth: 380, width: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fadeUp 0.4s ease' }}>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 22 }}>Session Complete! 🎉</h3>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>{summary.minutes} min of practice</p>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 32px', background: 'var(--amber-dim)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: 42, fontWeight: 700, color: 'var(--amber)', fontFamily: "'Fraunces', serif" }}>{summary.fluencyScore}</span>
              <span style={{ color: 'var(--text2)', fontSize: 13 }}>Fluency Score</span>
            </div>

            {summary.tip && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--amber-dim)', borderRadius: 'var(--radius-sm)', width: '100%' }}>
                <p style={{ fontSize: 13, color: 'var(--amber-light)', lineHeight: 1.5 }}>💡 {summary.tip}</p>
              </div>
            )}

            <button onClick={() => setShowSummary(false)} style={{ marginTop: 20, width: '100%', padding: '14px 24px', background: 'var(--amber)', color: '#0f0f0f', borderRadius: 'var(--radius-sm)', fontSize: 15, fontWeight: 600, textAlign: 'center' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onboarding Component ─────────────────────────────
function OnboardingFlow({ onComplete }: { onComplete: (name: string, level: string, persona: string) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [level, setLevel] = useState('B1 - Intermediate');
  const [persona, setPersona] = useState('friend');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 380, width: '100%' }}>
        {step === 0 && (
          <div style={{ animation: 'fadeUp 0.5s ease', textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>👋</div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600 }}>Welcome to FluentBuddy</h1>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>Your AI English partner that helps you practice through real conversations.</p>
            <div style={{ marginTop: 32, textAlign: 'left' }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', marginBottom: 8, display: 'block' }}>What's your name?</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name..."
                style={{ width: '100%', background: 'var(--surface)', color: 'var(--text)', padding: '14px 16px', borderRadius: 'var(--radius-sm)', fontSize: 16 }}
              />
            </div>
            <button
              onClick={() => name.trim() && setStep(1)}
              style={{ marginTop: 24, width: '100%', padding: '14px 24px', background: 'var(--amber)', color: '#0f0f0f', borderRadius: 'var(--radius-sm)', fontSize: 15, fontWeight: 600, opacity: name.trim() ? 1 : 0.5 }}
            >
              Continue →
            </button>
          </div>
        )}

        {step === 1 && (
          <div style={{ animation: 'fadeUp 0.5s ease', textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>📊</div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600 }}>Your English Level</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
              {LEVELS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  style={{ padding: '12px 16px', background: level === l ? 'var(--amber-dim)' : 'var(--surface)', color: level === l ? 'var(--text)' : 'var(--text2)', borderRadius: 'var(--radius-sm)', fontSize: 14, textAlign: 'left', border: level === l ? '2px solid var(--amber)' : '2px solid transparent' }}
                >
                  {l}
                </button>
              ))}
            </div>
            <button onClick={() => setStep(2)} style={{ marginTop: 24, width: '100%', padding: '14px 24px', background: 'var(--amber)', color: '#0f0f0f', borderRadius: 'var(--radius-sm)', fontSize: 15, fontWeight: 600 }}>
              Continue →
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={{ animation: 'fadeUp 0.5s ease', textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🎭</div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600 }}>Pick Your AI Partner</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
              {Object.entries(PERSONAS).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => setPersona(key)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '18px 12px', background: persona === key ? 'var(--amber-dim)' : 'var(--surface)', borderRadius: 'var(--radius)', border: persona === key ? '2px solid var(--amber)' : '2px solid transparent' }}
                >
                  <span style={{ fontSize: 32 }}>{p.emoji}</span>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{p.desc}</span>
                </button>
              ))}
            </div>
            <button onClick={() => onComplete(name, level, persona)} style={{ marginTop: 24, width: '100%', padding: '14px 24px', background: 'var(--amber)', color: '#0f0f0f', borderRadius: 'var(--radius-sm)', fontSize: 15, fontWeight: 600 }}>
              Let's Go! 🚀
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: step === i ? 24 : 8, height: 8, borderRadius: step === i ? 4 : '50%', background: step === i ? 'var(--amber)' : 'var(--surface3)', transition: 'all 0.3s' }} />
          ))}
        </div>
      </div>
    </div>
  );
}
