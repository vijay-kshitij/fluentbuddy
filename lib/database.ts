import { SupabaseClient } from '@supabase/supabase-js';

export const db = {
  // ── Profile ──────────────────────────────────
  async getProfile(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    return data;
  },

  async updateProfile(supabase: SupabaseClient, userId: string, updates: any) {
    const { data } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    return data;
  },

  async upsertProfile(supabase: SupabaseClient, userId: string, updates: any) {
    const { data } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          ...updates,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select()
      .single();
    return data;
  },

  // ── Conversations ────────────────────────────
  async createConversation(supabase: SupabaseClient, userId: string, persona: string) {
    const { data } = await supabase
      .from('conversations')
      .insert({ user_id: userId, persona_used: persona })
      .select()
      .single();
    return data;
  },

  async endConversation(supabase: SupabaseClient, convId: string, stats: {
    minutes: number;
    fluencyScore: number;
    tip: string;
  }) {
    const { data } = await supabase
      .from('conversations')
      .update({
        ended_at: new Date().toISOString(),
        duration_minutes: stats.minutes,
        fluency_score: stats.fluencyScore,
        summary_tip: stats.tip,
      })
      .eq('id', convId)
      .select()
      .single();
    return data;
  },

  // ── Messages ─────────────────────────────────
  async addMessage(supabase: SupabaseClient, convId: string, userId: string, role: string, content: string) {
    const { data } = await supabase
      .from('messages')
      .insert({ conversation_id: convId, user_id: userId, role, content })
      .select()
      .single();
    return data;
  },

  async getRecentMessages(supabase: SupabaseClient, userId: string, limit = 20) {
    const { data } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []).reverse();
  },

  async getConversationMessages(supabase: SupabaseClient, convId: string) {
    const { data } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    return data || [];
  },

  // ── Memory ───────────────────────────────────
  async addMemoryNote(supabase: SupabaseClient, userId: string, content: string, category = 'general') {
    const { data } = await supabase
      .from('memory_notes')
      .insert({ user_id: userId, content, category })
      .select()
      .single();
    return data;
  },

  async getMemoryNotes(supabase: SupabaseClient, userId: string, limit = 30) {
    const { data } = await supabase
      .from('memory_notes')
      .select('content, category, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  },

  // ── Words Learned ────────────────────────────
  async addWords(supabase: SupabaseClient, userId: string, words: string[]) {
    if (!words.length) return [];
    const rows = words.map(word => ({ user_id: userId, word: word.toLowerCase() }));
    const { data } = await supabase
      .from('words_learned')
      .upsert(rows, { onConflict: 'user_id,word' })
      .select();
    return data;
  },

  async getWordsLearned(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
      .from('words_learned')
      .select('word, learned_at')
      .eq('user_id', userId)
      .order('learned_at', { ascending: false })
      .limit(200);
    return data || [];
  },

  // ── Corrections ──────────────────────────────
  async addCorrections(supabase: SupabaseClient, userId: string, convId: string, corrections: {
    original: string;
    corrected: string;
    explanation?: string;
  }[]) {
    if (!corrections.length) return [];
    const rows = corrections.map(c => ({
      user_id: userId,
      conversation_id: convId,
      original: c.original,
      corrected: c.corrected,
      explanation: c.explanation || null,
    }));
    const { data } = await supabase
      .from('corrections')
      .insert(rows)
      .select();
    return data;
  },

  async getRecentCorrections(supabase: SupabaseClient, userId: string, limit = 10) {
    const { data } = await supabase
      .from('corrections')
      .select('original, corrected, explanation, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  },

  // ── Daily Stats ──────────────────────────────
  async upsertDailyStats(
    supabase: SupabaseClient,
    userId: string,
    sessionMinutes: number,
    fluencyScore: number,
    wordsCount: number
  ) {
    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('daily_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    if (existing) {
      const newSessionsCount = existing.sessions_count + 1;
      const { data } = await supabase
        .from('daily_stats')
        .update({
          sessions_count: newSessionsCount,
          minutes_practiced: existing.minutes_practiced + sessionMinutes,
          words_learned_count: existing.words_learned_count + wordsCount,
          avg_fluency_score: Math.round(
            (existing.avg_fluency_score * existing.sessions_count + fluencyScore) / newSessionsCount
          ),
        })
        .eq('id', existing.id)
        .select()
        .single();
      return data;
    } else {
      const { data } = await supabase
        .from('daily_stats')
        .insert({
          user_id: userId,
          date: today,
          sessions_count: 1,
          minutes_practiced: sessionMinutes,
          words_learned_count: wordsCount,
          avg_fluency_score: fluencyScore,
        })
        .select()
        .single();
      return data;
    }
  },

  async getStats(supabase: SupabaseClient, userId: string) {
    const { data: dailyStats } = await supabase
      .from('daily_stats')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(30);

    const stats = dailyStats || [];
    const totalSessions = stats.reduce((sum, d) => sum + d.sessions_count, 0);
    const totalMinutes = stats.reduce((sum, d) => sum + d.minutes_practiced, 0);
    const fluencyScores = stats
      .filter(d => d.avg_fluency_score)
      .map(d => d.avg_fluency_score);
    const avgFluency = fluencyScores.length
      ? Math.round(fluencyScores.reduce((a: number, b: number) => a + b, 0) / fluencyScores.length)
      : 0;

    return { totalSessions, totalMinutes, avgFluency, fluencyScores, dailyStats: stats };
  },

  async getStreak(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase.rpc('get_streak', { p_user_id: userId });
    return data || 0;
  },
};
