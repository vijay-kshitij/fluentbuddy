import { createServerSupabase } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/database';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Load user data from Supabase
  const [profile, memoryNotes, corrections, stats, streak] = await Promise.all([
    db.getProfile(supabase, user.id),
    db.getMemoryNotes(supabase, user.id),
    db.getRecentCorrections(supabase, user.id),
    db.getStats(supabase, user.id),
    db.getStreak(supabase, user.id),
  ]);

  return (
    <DashboardClient
      userId={user.id}
      initialProfile={profile}
      initialMemory={memoryNotes}
      initialCorrections={corrections}
      initialStats={stats}
      initialStreak={streak}
    />
  );
}
