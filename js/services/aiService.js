/**
 * AI conversations, messages and memories — tables: TABLES.aiConversations,
 * TABLES.aiMessages, TABLES.aiMemories.
 *
 * send() routes each message:
 *   • AI_ENDPOINT set  → POST to your endpoint (real model, see README)
 *   • otherwise        → lib/localAssistant.js (rule-based, clearly labelled)
 * Both paths return { content, actions } and are stored the same way.
 */
import { TABLES, AI_ENDPOINT, SUPABASE_ANON_KEY, isAiConfigured } from '../config.js';
import { createService } from './createService.js';
import { aiMessagesMap } from './dbMapping.js';
import { authService } from './authService.js';
import { store } from '../state/store.js';
import { respond as localRespond } from '../lib/localAssistant.js';
import { tasksService } from './tasksService.js';
import { eventsService } from './eventsService.js';
import { goalsService } from './goalsService.js';
import { todayKey, addDaysKey } from '../lib/dates.js';

const conversations = createService({
  key: 'conversations',
  tableName: TABLES.aiConversations,
  columns: ['id', 'title', 'created_at'],
  normalize: (r) => ({ ...r, title: r.title || 'Шинэ яриа' }),
});

const messages = createService({
  key: 'messages',
  tableName: TABLES.aiMessages,
  columns: ['id', 'conversation_id', 'role', 'content', 'actions', 'source', 'created_at'],
  mapping: aiMessagesMap,
  normalize: (r) => ({
    ...r,
    content: r.content || '',
    actions: Array.isArray(r.actions) ? r.actions : [],
    source: r.source || (r.role === 'user' ? 'user' : 'local-rules'),
  }),
});

const memories = createService({
  key: 'memories',
  tableName: TABLES.aiMemories,
  columns: ['id', 'content', 'source', 'created_at'],
  normalize: (r) => ({ ...r, content: r.content || '', source: r.source || 'user' }),
});

/** Compact snapshot of your data that a real model can use to answer. */
function buildContext() {
  const today = todayKey();
  return {
    today,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    open_tasks: tasksService.open().slice(0, 100).map(({ id, title, due_date, due_time, priority, category, estimated_minutes, project_id }) => ({
      id, title, due_date, due_time, priority, category, estimated_minutes, project_id,
    })),
    events_next_7_days: eventsService.between(today, addDaysKey(today, 7)).map(({ id, title, event_date, start_time, end_time, all_day }) => ({
      id, title, event_date, start_time, end_time, all_day,
    })),
    active_goals: goalsService.all().filter((g) => g.status === 'active').map(({ id, title, target_date }) => ({ id, title, target_date })),
  };
}

async function callEndpoint(conversationId, text) {
  const headers = { 'Content-Type': 'application/json' };
  const token = await authService.accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (SUPABASE_ANON_KEY) headers.apikey = SUPABASE_ANON_KEY; // needed when the endpoint is a Supabase Edge Function

  const history = aiService.messagesFor(conversationId).slice(-20).map((m) => ({ role: m.role, content: m.content }));
  const response = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      conversation_id: conversationId,
      message: text,
      history,
      memories: memories.all().map((m) => m.content),
      context: buildContext(),
    }),
  });
  if (!response.ok) throw new Error(`AI endpoint ${response.status} ${response.statusText} хариу өглөө`);
  const json = await response.json();
  return {
    content: String(json.reply ?? ''),
    actions: Array.isArray(json.actions) ? json.actions.map((a) => ({ status: 'pending', ...a })) : [],
    source: 'ai',
  };
}

export const aiService = {
  conversations,
  messages,
  memories,
  isConnected: isAiConfigured,

  messagesFor(conversationId) {
    return messages.all()
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  },

  /** Most recently active first. */
  sortedConversations() {
    const last = {};
    messages.all().forEach((m) => {
      if (!last[m.conversation_id] || m.created_at > last[m.conversation_id]) last[m.conversation_id] = m.created_at;
    });
    return [...conversations.all()].sort((a, b) => String(last[b.id] || b.created_at).localeCompare(String(last[a.id] || a.created_at)));
  },

  startConversation(firstMessage) {
    const text = firstMessage.replace(/\s+/g, ' ').trim();
    return conversations.create({ title: text.length > 48 ? `${text.slice(0, 47).trim()}…` : text || 'Шинэ яриа' });
  },

  /** Saves the user's message, gets a reply, saves the reply. */
  async send(conversationId, text) {
    await messages.create({ conversation_id: conversationId, role: 'user', content: text, actions: [], source: 'user' });
    let result;
    try {
      result = isAiConfigured() ? await callEndpoint(conversationId, text) : localRespond(text);
    } catch (err) {
      result = { content: `AI endpoint-тэй холбогдож чадсангүй: ${err.message}. Юу ч өөрчлөгдөөгүй.`, actions: [], source: 'error' };
    }
    return messages.create({ conversation_id: conversationId, role: 'assistant', content: result.content, actions: result.actions, source: result.source });
  },

  /** Records what happened to a proposed action (applied / dismissed). */
  updateAction(messageId, index, patch) {
    const message = messages.get(messageId);
    const actions = message.actions.map((a, i) => (i === index ? { ...a, ...patch } : a));
    return messages.update(messageId, { actions });
  },

  /** Messages are removed by the database (ON DELETE CASCADE); we mirror that locally. */
  async deleteConversation(id) {
    await conversations.remove(id);
    store.set('messages', store.get('messages').filter((m) => m.conversation_id !== id));
  },
};
