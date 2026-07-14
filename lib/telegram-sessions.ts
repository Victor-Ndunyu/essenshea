import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment');
    }
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

export async function getOrCreateSession(telegramChatId: number): Promise<string> {
  const supabase = getSupabase();
  const { data, error: fetchError } = await supabase
    .from('telegram_sessions')
    .select('session_id')
    .eq('telegram_chat_id', telegramChatId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw new Error(`Failed to fetch session: ${fetchError.message}`);
  }

  if (data) {
    await supabase
      .from('telegram_sessions')
      .update({ last_message: new Date() })
      .eq('telegram_chat_id', telegramChatId);

    return data.session_id;
  }

  const sessionId = `telegram_${telegramChatId}_${Date.now()}`;

  const { error: insertError } = await supabase
    .from('telegram_sessions')
    .insert([
      {
        telegram_chat_id: telegramChatId,
        session_id: sessionId,
      },
    ]);

  if (insertError) {
    throw new Error(`Failed to create session: ${insertError.message}`);
  }

  return sessionId;
}

export async function getSessionByChatId(telegramChatId: number): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('telegram_sessions')
    .select('session_id')
    .eq('telegram_chat_id', telegramChatId)
    .single();

  return data?.session_id || null;
}
