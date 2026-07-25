import { getSupabaseAdmin } from './supabase-admin';

export type AgentMemoryMessage = {
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
};

const CUSTOMER_TTL_HOURS = 24;
const MAX_HISTORY_MESSAGES = 12;

function safeSessionId(value: string | undefined): string | null {
  const clean = String(value || '').replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 160);
  return clean.length >= 8 ? clean : null;
}

export async function loadCustomerConversation(sessionId: string | undefined): Promise<AgentMemoryMessage[]> {
  const safeId = safeSessionId(sessionId);
  if (!safeId) return [];
  try {
    const cutoff = new Date(Date.now() - CUSTOMER_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const supabase = getSupabaseAdmin();
    await supabase.from('agent_conversation_messages').delete().lt('last_active_at', cutoff);
    const { data, error } = await supabase
      .from('agent_conversation_messages')
      .select('role, content, created_at')
      .eq('session_id', safeId)
      .gte('last_active_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);
    if (error) throw error;
    return (data || []).reverse().map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item.content || '').slice(0, 1200),
      created_at: item.created_at,
    }));
  } catch (error) {
    console.error('Customer conversation memory load failed:', error);
    return [];
  }
}

export async function saveCustomerConversationTurn(params: {
  sessionId: string | undefined;
  source: string;
  userMessage: string;
  assistantMessage: string;
}): Promise<void> {
  const safeId = safeSessionId(params.sessionId);
  if (!safeId) return;
  try {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CUSTOMER_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await getSupabaseAdmin().from('agent_conversation_messages').insert([
      {
        session_id: safeId,
        source: params.source,
        role: 'user',
        content: params.userMessage.slice(0, 2000),
        last_active_at: now,
        expires_at: expiresAt,
      },
      {
        session_id: safeId,
        source: params.source,
        role: 'assistant',
        content: params.assistantMessage.slice(0, 4000),
        last_active_at: now,
        expires_at: expiresAt,
      },
    ]);
  } catch (error) {
    console.error('Customer conversation memory save failed:', error);
  }
}

export function formatConversationMemory(messages: AgentMemoryMessage[]): string {
  if (!messages.length) return '';
  return ['Recent conversation memory for this customer session:', ...messages.map((message) => `${message.role}: ${message.content}`)].join('\n');
}

export async function saveOwnerMemory(chatId: number, memoryType: string, content: string, metadata: Record<string, unknown> = {}): Promise<void> {
  if (!content.trim()) return;
  try {
    await getSupabaseAdmin().from('owner_agent_memory').insert([
      {
        telegram_chat_id: chatId,
        memory_type: memoryType,
        content: content.trim().slice(0, 4000),
        metadata,
      },
    ]);
  } catch (error) {
    console.error('Owner memory save failed:', error);
  }
}

export async function retrieveOwnerMemory(chatId: number, query: string): Promise<string> {
  try {
    const terms = query.toLowerCase().split(/\s+/).filter((word) => word.length > 2).slice(0, 8);
    const { data, error } = await getSupabaseAdmin()
      .from('owner_agent_memory')
      .select('memory_type, content, created_at')
      .eq('telegram_chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) throw error;
    const scored = (data || [])
      .map((item) => {
        const haystack = [item.memory_type, item.content].join(' ').toLowerCase();
        const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { item, score };
      })
      .filter((row) => row.score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((row) => `- ${row.item.memory_type}: ${row.item.content}`);
    return scored.length ? ['Owner memory:', ...scored].join('\n') : 'No owner memory matched that yet.';
  } catch (error) {
    console.error('Owner memory retrieval failed:', error);
    return 'I could not retrieve owner memory right now.';
  }
}
