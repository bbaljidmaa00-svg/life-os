/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Life OS · Тохиргоо
 * ─────────────────────────────────────────────────────────────────────────────
 *  Supabase-тэй холбохын тулд зөвхөн энэ файлыг засна.
 *
 *  1. Supabase Dashboard → Project Settings → API хэсгийг нээнэ.
 *  2. "Project URL"-ийг SUPABASE_URL-д хуулна.
 *  3. "anon public" түлхүүрийг (эсвэл шинэ "publishable" түлхүүрийг)
 *     SUPABASE_ANON_KEY-д хуулна.
 *
 *  ⚠️  service_role / secret түлхүүрийг ЭНД ХЭЗЭЭ Ч БҮҮ ОРУУЛ. Энэ хавтасны
 *      бүх файл хөтөч рүү татагддаг тул хэн ч уншиж чадна. anon түлхүүр нь
 *      нийтэд ил байхаар зохиогдсон: хэрэглэгч бүр юуг харж, засаж болохыг
 *      өгөгдлийн сангийн Row Level Security (RLS) дүрэм шийднэ.
 *      Secret түлхүүр илэрвэл апп ажиллахаас татгалзана.
 *
 *  SUPABASE_URL / SUPABASE_ANON_KEY хоосон үед апп "session горим"-оор ажиллана:
 *  өгөгдөл зөвхөн тухайн хөтчийн цонхны санах ойд байж, дахин ачаалахад устна.
 *  localStorage-д ямар ч хувийн өгөгдөл бичигдэхгүй.
 */
export const SUPABASE_URL = 'https://cztdncdfhyrctqzpfwob.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_JkkgN4U_qsfr3oNtGtsXlA_6hMJCcOL'; // publishable — нийтэд ил байж болно

/**
 * Өгөгдлийн сангийн хүснэгтийн нэрс.
 * Таны Supabase сан аль хэдийн бий — хэрэв хүснэгтүүд өөр нэртэй бол
 * БАРУУН талын утгыг өөрчил (зүүн талын түлхүүрийг бүү өөрчил).
 * Хүснэгт бүрт шаардлагатай баганууд supabase/schema.sql болон
 * js/services/ доторх файл бүрийн эхэн дэх COLUMNS жагсаалтад бий.
 */
export const TABLES = {
  tasks: 'tasks',
  events: 'calendar_events',
  goals: 'goals',
  projects: 'projects',
  journal: 'journal_entries',
  birthdays: 'birthdays',
  aiConversations: 'ai_conversations',
  aiMessages: 'ai_messages',
  aiMemories: 'ai_memories',
  subjects: 'subjects',
  classSessions: 'class_sessions',
  homework: 'homework',
  workplaces: 'workplaces',
  workShifts: 'work_shifts',
  income: 'income_entries',
  orders: 'orders',
  workContacts: 'work_contacts',
  workGoals: 'work_goals',
};

/**
 * Заавал биш: өөрийн AI endpoint-ийн хаяг (жишээ нь LLM-ийг серверийн
 * түлхүүрээр дууддаг Supabase Edge Function). Хийх хүртлээ хоосон орхи.
 * Хүсэлт/хариултын формат README.md → "AI загвар холбох" хэсэгт бий.
 * Хоосон үед Туслах нь тодорхой шошготой энгийн дүрмүүдээр ажиллана.
 */
export const AI_ENDPOINT = 'https://cztdncdfhyrctqzpfwob.supabase.co/functions/v1/life-os-ai'; // supabase/functions/life-os-ai

export function isSupabaseConfigured() {
  return SUPABASE_URL.trim() !== '' && SUPABASE_ANON_KEY.trim() !== '';
}

export function isAiConfigured() {
  // AI функц нэвтэрсэн хэрэглэгчийн токен шаарддаг тул Supabase холбогдсон байх ёстой.
  return AI_ENDPOINT.trim() !== '' && isSupabaseConfigured();
}
