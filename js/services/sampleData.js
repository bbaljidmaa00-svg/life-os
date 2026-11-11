/**
 * Жишээ өгөгдөл — ЗӨВХӨН session горимд туршихад зориулсан.
 * Энгийн сервисүүдээр дамжин үүсдэг тул бодит өгөгдөл шиг ажиллаж,
 * дахин ачаалахад алга болно. Supabase холбогдсон үед энэ сонголт
 * харагдахгүй тул таны өгөгдлийн санд хэзээ ч орохгүй.
 */
import { store } from '../state/store.js';
import { tasksService } from './tasksService.js';
import { eventsService } from './eventsService.js';
import { goalsService, projectsService } from './goalsService.js';
import { journalService } from './journalService.js';
import { birthdaysService } from './birthdaysService.js';
import { aiService } from './aiService.js';
import { todayKey, addDaysKey, fromKey } from '../lib/dates.js';

export async function loadSampleData() {
  if (store.meta().mode !== 'session') throw new Error('Жишээ өгөгдлийг зөвхөн session горимд ачаална.');
  const T = todayKey();
  const d = (n) => addDaysKey(T, n);
  const doneAt = (n, hour = 16) => { const x = fromKey(d(n)); x.setHours(hour, 15); return x.toISOString(); };

  /* Зорилго → төслүүд */
  const fit = await goalsService.create({ title: 'Зуны аялалд бэлтгэж биеэ чийрэгжүүлэх', description: '20 км уулын замыг зогсолтгүй туулах тэсвэр хатуужил олох.', target_date: d(60), status: 'active' });
  const biz = await goalsService.create({ title: 'Чөлөөт дизайны бизнесээ өргөжүүлэх', description: 'Тогтмол хоёр шинэ харилцагч, сүүлийн ажлуудаа харуулсан портфолио.', target_date: d(90), status: 'active' });
  await goalsService.create({ title: 'Энэ жил 12 ном унших', description: 'Сард нэг ном, голдуу баримтат.', target_date: d(55), status: 'paused' });

  const run = await projectsService.create({ goal_id: fit.id, title: '8 долоо хоногийн гүйлтийн хөтөлбөр', description: 'Долоо хоногт гурван удаа, 12 км хүртэл нэмэгдүүлнэ.', due_date: d(40), status: 'active' });
  const meal = await projectsService.create({ goal_id: fit.id, title: 'Хоолоо урьдчилан бэлдэх дадал', due_date: d(21), status: 'active' });
  const site = await projectsService.create({ goal_id: biz.id, title: 'Портфолио вэбсайт шинэчлэх', description: 'Шинэ кейс судалгаа, хурдан нүүр хуудас.', due_date: d(14), status: 'active' });
  const outreach = await projectsService.create({ goal_id: biz.id, title: 'Харилцагч хайх', due_date: d(30), status: 'active' });
  const office = await projectsService.create({ goal_id: null, title: 'Гэрийн ажлын булан засах', status: 'active' });

  /* Ажлууд */
  const tasks = [
    { title: 'Номин Студид нэхэмжлэх илгээх', due_date: d(-2), priority: 'high', category: 'Санхүү', estimated_minutes: 15, project_id: outreach.id },
    { title: 'Шүдний эмчид цаг авах', due_date: d(-1), priority: 'medium', category: 'Эрүүл мэнд', estimated_minutes: 10 },
    { title: 'Портфолиогийн кейсийн танилцуулга бичих', due_date: T, due_time: '11:00', priority: 'high', category: 'Ажил', estimated_minutes: 90, project_id: site.id },
    { title: '30 минутын хөнгөн гүйлт', due_date: T, due_time: '07:00', priority: 'medium', category: 'Эрүүл мэнд', estimated_minutes: 30, project_id: run.id },
    { title: 'Хамтын ажиллагааны талаар Ануд хариу бичих', due_date: T, priority: 'medium', category: 'Ажил', estimated_minutes: 15 },
    { title: 'Хоол бэлдэхэд хүнс авах', due_date: T, priority: 'low', category: 'Гэр', estimated_minutes: 45, project_id: meal.id },
    { title: 'Сайтын бүдүүвч загварыг хянах', due_date: d(1), due_time: '14:00', priority: 'high', category: 'Ажил', estimated_minutes: 60, project_id: site.id },
    { title: 'Интервал дасгал', due_date: d(1), priority: 'medium', category: 'Эрүүл мэнд', estimated_minutes: 45, project_id: run.id },
    { title: 'Харилцагчид илгээх имэйлийн загвар бэлдэх', due_date: d(3), priority: 'medium', category: 'Ажил', estimated_minutes: 45, project_id: outreach.id },
    { title: 'Зогсож ажиллах ширээ захиалах', due_date: d(4), priority: 'low', category: 'Гэр', estimated_minutes: 20, project_id: office.id },
    { title: 'Амралтын өдрийн явган аяллын маршрут гаргах', due_date: d(5), priority: 'low', category: 'Хувийн', estimated_minutes: 30 },
    { title: 'Улирлын татварын тайлан бэлдэх', due_date: d(9), priority: 'high', category: 'Санхүү', estimated_minutes: 120 },
    { title: 'Хуучин дизайны файлуудаа цэгцлэх', priority: 'low', category: 'Ажил', estimated_minutes: 60 },
    { title: 'Эргономик сандал судлах', priority: 'medium', category: 'Гэр', estimated_minutes: 30, project_id: office.id },
    { title: 'LinkedIn профайлаа шинэчлэх', priority: 'low', category: 'Ажил', estimated_minutes: 15, project_id: outreach.id },
    // дууссан түүх (Шинжилгээ хуудсанд)
    { title: 'Портфолиогийн фонт сонгох', due_date: d(-2), priority: 'medium', category: 'Ажил', estimated_minutes: 45, project_id: site.id, status: 'done', completed_at: doneAt(-2) },
    { title: 'Урт гүйлт — 8 км', due_date: d(-3), priority: 'medium', category: 'Эрүүл мэнд', estimated_minutes: 60, project_id: run.id, status: 'done', completed_at: doneAt(-3, 8) },
    { title: 'Хүслэн кафены логог эцэслэх', due_date: d(-4), priority: 'high', category: 'Ажил', estimated_minutes: 120, status: 'done', completed_at: doneAt(-5) },
    { title: 'Фитнесст хүч чадлын дасгал', due_date: d(-4), priority: 'low', category: 'Эрүүл мэнд', estimated_minutes: 50, status: 'done', completed_at: doneAt(-4, 19) },
    { title: 'Долоо хоногийн тойм', due_date: d(-7), priority: 'medium', category: 'Хувийн', estimated_minutes: 30, status: 'done', completed_at: doneAt(-7) },
    { title: 'Ээж рүү залгах', due_date: d(-1), priority: 'medium', category: 'Хувийн', estimated_minutes: 20, status: 'done', completed_at: doneAt(-1, 20) },
    { title: '10-р сарын баримтуудаа ангилах', due_date: d(-9), priority: 'low', category: 'Санхүү', estimated_minutes: 40, status: 'done', completed_at: doneAt(-8) },
    { title: 'Хоолны сав бэлдэх', due_date: d(-6), priority: 'low', category: 'Гэр', estimated_minutes: 30, project_id: meal.id, status: 'done', completed_at: doneAt(-6) },
    { title: 'Харилцагчдаас сэтгэгдэл цуглуулах', due_date: d(-3), priority: 'high', category: 'Ажил', estimated_minutes: 45, project_id: site.id, status: 'done', completed_at: doneAt(-3) },
    { title: '“Гүн ажил” номоос 40 хуудас унших', due_date: d(-1), priority: 'low', category: 'Сурлага', estimated_minutes: 45, status: 'done', completed_at: doneAt(-1, 22) },
    { title: 'Хөнгөн гүйлт — 5 км', due_date: d(-10), priority: 'medium', category: 'Эрүүл мэнд', estimated_minutes: 35, project_id: run.id, status: 'done', completed_at: doneAt(-10, 7) },
  ];
  for (const t of tasks) await tasksService.create(t);

  /* Үйл явдлууд */
  const events = [
    { title: 'Багийн өглөөний уулзалт', event_date: T, start_time: '09:00', end_time: '09:30', category: 'work' },
    { title: 'Маятай үдийн хоол', event_date: T, start_time: '12:30', end_time: '13:30', category: 'social', location: 'Номад кафе' },
    { title: 'Харилцагчтай дуудлага — Номин Студи', event_date: T, start_time: '16:00', end_time: '17:00', category: 'work', location: 'Google Meet' },
    { title: 'Йогийн хичээл', event_date: d(1), start_time: '08:00', end_time: '09:00', category: 'health', location: 'Лотус студи' },
    { title: 'Шүдний эмч', event_date: d(1), start_time: '15:30', end_time: '16:15', category: 'health' },
    { title: 'Дизайны чуулган', event_date: d(2), all_day: true, category: 'work', location: 'Чуулганы төв' },
    { title: 'Номын клуб', event_date: d(3), start_time: '19:00', end_time: '21:00', category: 'social' },
    { title: 'Зөвлөгчтэй портфолио хянах', event_date: d(4), start_time: '10:00', end_time: '11:00', category: 'work' },
    { title: 'Аялалд бэлтгэх алхалт', event_date: d(5), start_time: '09:30', end_time: '11:30', category: 'personal' },
    { title: 'Сургалт: ажлаа үнэлэх нь', event_date: d(-2), start_time: '14:00', end_time: '16:00', category: 'work' },
    { title: 'Лхагватай оройн хоол', event_date: d(8), start_time: '19:30', end_time: '21:30', category: 'social' },
  ];
  for (const e of events) await eventsService.create({ all_day: false, ...e });

  /* Тэмдэглэл */
  const entries = [
    { entry_date: d(-1), mood: 4, title: 'Тайван өдөр', reflection: 'Төлөвлөсөн номоо уншиж, ээж рүүгээ залгалаа. Оройн алхалтын дараа сэтгэл амар болсон.', gratitude: 'Ээжтэйгээ удаан ярилцсан.' },
    { entry_date: d(-2), mood: 5, title: 'Портфолио бүтэж эхэллээ', reflection: 'Фонтоо сонгосны дараа сайт яг минийх шиг санагдаж эхэллээ. Үдээс өмнө хоёр удаа төвлөрч ажилласан.', gratitude: 'Нам гүм өглөөний цаг.' },
    { entry_date: d(-3), mood: 3, title: '', reflection: 'Өглөө сайхан гүйсэн ч үдээс хойш жижиг хүсэлтүүдэд цаг алдсан.', gratitude: 'Хоёр харилцагчийн сайхан сэтгэгдэл.' },
    { entry_date: d(-5), mood: 2, title: 'Хэт олон уулзалт', reflection: 'Гүн ажил бараг хийж чадсангүй. Өглөөний цагаа хамгаалах хэрэгтэй.', gratitude: 'Найзтайгаа кофе уусан.' },
    { entry_date: d(-6), mood: 4, title: '', reflection: 'Хоолоо урьдчилан бэлдсэн нь долоо хоногийг хамаагүй хялбар болгосон.', gratitude: 'Нартай сайхан өдөр.' },
  ];
  for (const e of entries) await journalService.create(e);

  /* Төрсөн өдрүүд (сануулга харагдахаар өнөөдрөөс хамааруулав) */
  const bday = (n) => { const x = fromKey(d(n)); return { birth_month: x.getMonth() + 1, birth_day: x.getDate() }; };
  const people = [
    { name: 'Ээж', ...bday(5), birth_year: 1968, relationship: 'Гэр бүл', reminder_enabled: true, reminder_days: 7, notes: 'Цэцэг, гараар бичсэн ил захидалд дуртай.' },
    { name: 'Тэмүүлэн', ...bday(1), birth_year: 1995, relationship: 'Найз', reminder_enabled: true, reminder_days: 3, notes: 'Зурагт ном.' },
    { name: 'Саруул', ...bday(18), relationship: 'Хамт ажиллагч', reminder_enabled: true, reminder_days: 1 },
    { name: 'Өвөө', ...bday(-20), birth_year: 1946, relationship: 'Гэр бүл', reminder_enabled: true, reminder_days: 14 },
    { name: 'Энхжин', ...bday(45), birth_year: 1998, relationship: 'Хань', reminder_enabled: true, reminder_days: 14, notes: 'Тоглолтын тасалбар?' },
  ];
  for (const p of people) await birthdaysService.create(p);

  await aiService.memories.create({ content: 'Би үдээс өмнө хамгийн сайн төвлөрч ажилладаг.', source: 'user' });
  await aiService.memories.create({ content: 'Баасан гарагийн үдээс хойш бичиг цаасны ажилд зориулна.', source: 'user' });
}
