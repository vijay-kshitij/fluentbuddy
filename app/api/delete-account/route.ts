import { createServerSupabase } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(req: NextRequest) {
  // 1. Verify user is authenticated
  const supabase = createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Use service role client to delete user data and auth record
  // Service role bypasses RLS and can delete from auth.users
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Delete all user data from tables (cascade should handle most,
    // but being explicit for safety)
    await adminClient.from('daily_stats').delete().eq('user_id', user.id);
    await adminClient.from('corrections').delete().eq('user_id', user.id);
    await adminClient.from('words_learned').delete().eq('user_id', user.id);
    await adminClient.from('memory_notes').delete().eq('user_id', user.id);
    await adminClient.from('messages').delete().eq('user_id', user.id);
    await adminClient.from('conversations').delete().eq('user_id', user.id);
    await adminClient.from('profiles').delete().eq('id', user.id);

    // Delete the auth user (this is permanent)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete auth account', details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
