import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getOrCreateSession(telegramChatId: number): Promise<string> {
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
  const { data } = await supabase
    .from('telegram_sessions')
    .select('session_id')
    .eq('telegram_chat_id', telegramChatId)
    .single();

  return data?.session_id || null;
}
