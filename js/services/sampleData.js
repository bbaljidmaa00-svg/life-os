/**
 * Жишээ өгөгдөл — ЗӨВХӨН session горимд туршихад зориулсан.
 * Энгийн сервисүүдээр дамжин үүсдэг тул бодит өгөгдөл шиг ажиллаж,
 * дахин ачаалахад алга болно. Supabase холбогдсон үед энэ сонголт
 * харагдахгүй тул таны өгөгдлийн санд хэзээ ч орохгүй.
 */
import { store } from '../state/store.js';
import { tasksService } from './tasksService.js';
import { eventsService } from './eventsService.js';
import { goalsService, projectsService, wishesService, reflectionsService } from './goalsService.js';
import { journalService } from './journalService.js';
import { birthdaysService } from './birthdaysService.js';
import { aiService } from './aiService.js';
import { subjectsService, classSessionsService, homeworkService } from './schoolService.js';
import { workplacesService, shiftsService, incomeService, ordersService, contactsService, workGoalsService, weekRange, monthRange } from './workService.js';
import { todayKey, addDaysKey, fromKey } from '../lib/dates.js';

export async function loadSampleData() {
  if (store.meta().mode !== 'session') throw new Error('Жишээ өгөгдлийг зөвхөн session горимд ачаална.');
  const T = todayKey();
  const d = (n) => addDaysKey(T, n);
  const doneAt = (n, hour = 16) => { const x = fromKey(d(n)); x.setHours(hour, 15); return x.toISOString(); };

  /* Хүсэл мөрөөдөл (хугацаагүй) → зорилго → төсөл */
  const wHike = await wishesService.create({ category: 'do', title: 'Хөвсгөл нуурыг тойрч явган аялах', note: 'Найзуудтайгаа майхан, гал, од…' });
  await wishesService.create({ category: 'do', title: 'Японд сакура цэцэглэхийг харах' });
  await wishesService.create({ category: 'do', title: 'Шумбаж сурах' });
  const wStudio = await wishesService.create({ category: 'have', title: 'Өөрийн гэсэн дизайны студитэй болох', note: 'Гэрэлтэй, цэцэгтэй, өөрийн өнгөтэй жижиг өрөө.' });
  await wishesService.create({ category: 'have', title: 'Фото аппарат' });
  const wWise = await wishesService.create({ category: 'be', title: 'Олон ном уншдаг, мэдлэгтэй хүн болох' });
  await wishesService.create({ category: 'be', title: 'Өөртөө итгэлтэй илтгэгч болох' });
  await wishesService.create({ category: 'be', title: 'Англиар чөлөөтэй ярьдаг болох', achieved_at: doneAt(-40) });
  await wishesService.create({ category: 'give', title: 'Ээждээ далайн эргийн аялал бэлэглэх', note: 'Ээж далай үзэж байгаагүй.' });
  await wishesService.create({ category: 'give', title: 'Хүүхдийн асрамжийн газарт сайн дурын ажил хийх' });

  /* Зорилго → төслүүд */
  const fit = await goalsService.create({ wish_id: wHike.id, title: 'Зуны аялалд бэлтгэж биеэ чийрэгжүүлэх', description: '20 км уулын замыг зогсолтгүй туулах тэсвэр хатуужил олох.', target_date: d(60), status: 'active' });
  const biz = await goalsService.create({ wish_id: wStudio.id, title: 'Чөлөөт дизайны бизнесээ өргөжүүлэх', description: 'Тогтмол хоёр шинэ харилцагч, сүүлийн ажлуудаа харуулсан портфолио.', target_date: d(90), status: 'active' });
  await goalsService.create({ wish_id: wWise.id, title: 'Энэ жил 12 ном унших', description: 'Сард нэг ном, голдуу баримтат.', target_date: d(55), status: 'paused' });

  const run = await projectsService.create({ kind: 'long', goal_id: fit.id, title: '8 долоо хоногийн гүйлтийн хөтөлбөр', description: 'Долоо хоногт гурван удаа, 12 км хүртэл нэмэгдүүлнэ.', due_date: d(40), status: 'active' });
  const meal = await projectsService.create({ kind: 'long', goal_id: fit.id, title: 'Хоолоо урьдчилан бэлдэх дадал', due_date: d(21), status: 'active' });
  const site = await projectsService.create({ goal_id: biz.id, title: 'Портфолио вэбсайт шинэчлэх', description: 'Шинэ кейс судалгаа, хурдан нүүр хуудас.', due_date: d(14), status: 'active' });
  const outreach = await projectsService.create({ goal_id: biz.id, title: 'Харилцагч хайх', due_date: d(30), status: 'active' });
  const office = await projectsService.create({ goal_id: null, title: 'Гэрийн ажлын булан засах', status: 'active' });
  const sleep = await projectsService.create({ kind: 'long', goal_id: fit.id, title: 'Эрт унтдаг болох', description: '23:00 гэхэд орондоо орох — 21 хоног дараалан.', status: 'active' });
  const bag = await projectsService.create({ kind: 'quick', goal_id: null, title: 'Шинэ цүнх авах', due_date: d(10), status: 'active' });

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
  tasks.push(
    { title: '22:30-д утсаа унтраах', due_date: T, due_time: '22:30', priority: 'medium', category: 'Эрүүл мэнд', estimated_minutes: 5, project_id: sleep.id },
    { title: '22:30-д утсаа унтраах', due_date: d(-1), due_time: '22:30', priority: 'medium', category: 'Эрүүл мэнд', estimated_minutes: 5, project_id: sleep.id, status: 'done', completed_at: doneAt(-1, 22) },
    { title: 'Оройн 18 цагаас хойш кофе уухгүй', due_date: d(-2), priority: 'low', category: 'Эрүүл мэнд', project_id: sleep.id, status: 'done', completed_at: doneAt(-2, 18) },
    { title: 'Цүнхний загвар, үнэ харьцуулах', due_date: d(2), priority: 'medium', category: 'Хувийн', estimated_minutes: 30, project_id: bag.id },
    { title: 'Цүнх худалдаж авах', due_date: d(10), priority: 'low', category: 'Хувийн', estimated_minutes: 60, project_id: bag.id },
  );
  for (const t of tasks) await tasksService.create(t);

  /* «Юу сурсан бэ?» тэмдэглэлүүд */
  const findTask = (title, done = true) => tasksService.all().find((t) => t.title === title && (t.status === 'done') === done);
  const reflections = [
    { project: sleep, task: findTask('22:30-д утсаа унтраах'), mood: 4, learned: 'Утсаа өөр өрөөнд цэнэглэвэл гараа сунгахгүй юм байна.', feeling: 'Өглөө 7-д амархан сэрлээ. Өөрөөрөө бахархаж байна.' },
    { project: sleep, task: findTask('Оройн 18 цагаас хойш кофе уухгүй'), mood: 3, learned: 'Кофеноос татгалзахад эхний өдөр толгой өвдсөн.', feeling: '' },
    { project: run, task: findTask('Урт гүйлт — 8 км'), mood: 5, learned: 'Эхний 2 км-т удаан гүйвэл дуустал тэсэж чадна.', feeling: 'Анх удаа 8 км гүйлээ! 🎉' },
    { project: meal, task: findTask('Хоолны сав бэлдэх'), mood: 4, learned: 'Ням гарагт 1 цаг бэлдэхэд 3 өдрийн хоол болдог.', feeling: 'Мөнгө ч хэмнэгдэж байна.' },
  ];
  for (const r of reflections) {
    if (r.task) await reflectionsService.create({ project_id: r.project.id, task_id: r.task.id, task_title: r.task.title, mood: r.mood, learned: r.learned, feeling: r.feeling });
  }

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

  /* Сургууль: хичээл → хуваарь → гэрийн даалгавар */
  const math = await subjectsService.create({ name: 'Бизнесийн математик', teacher: 'Б. Төмөрбаатар', color: '#1F6FB5' });
  const phil = await subjectsService.create({ name: 'Философи', teacher: 'Д. Сарангэрэл', color: '#7357D9' });
  const mkt = await subjectsService.create({ name: 'Маркетинг', teacher: 'Г. Анужин', color: '#DB2E72' });
  const eng = await subjectsService.create({ name: 'Англи хэл', teacher: 'J. Miller', color: '#14A09C' });
  const sessions = [
    [math, 1, '08:00', '09:20', '305 тоот', 'lecture'], [math, 3, '09:40', '11:00', '214 тоот', 'seminar'],
    [phil, 2, '11:20', '12:40', 'А байр 401', 'lecture'], [phil, 4, '14:00', '15:20', 'А байр 210', 'seminar'],
    [mkt, 1, '11:20', '12:40', '507 тоот', 'lecture'], [mkt, 5, '09:40', '11:00', 'Лаб 2', 'workshop'],
    [eng, 2, '08:00', '09:20', '118 тоот', 'seminar'], [eng, 4, '08:00', '09:20', '118 тоот', 'seminar'],
  ];
  // Өнөөдөр ч хичээл харагдахаар нэг цаг нэмнэ (жишээ өгөгдөлд л)
  const wd = fromKey(T).getDay();
  if (!sessions.some((s) => s[1] === wd)) sessions.push([eng, wd, '15:40', '17:00', '118 тоот', 'seminar']);
  for (const [subject, weekday, start_time, end_time, room, kind] of sessions) {
    await classSessionsService.create({ subject_id: subject.id, weekday, start_time, end_time, room, kind });
  }
  const homework = [
    { subject_id: math.id, title: 'Хүүгийн бодлого 1–12 (3-р бүлэг)', start_date: d(0), start_time: '19:00', due_date: d(1), due_time: '09:40', estimated_minutes: 90, status: 'in_progress' },
    { subject_id: phil.id, title: 'Семинарын эссэ: «Хүн гэж хэн бэ?»', start_date: d(1), start_time: '16:00', due_date: d(3), due_time: '14:00', estimated_minutes: 120, status: 'todo' },
    { subject_id: mkt.id, title: 'Брэндийн SWOT шинжилгээ (багийн ажил)', start_date: d(2), due_date: d(6), due_time: '23:59', estimated_minutes: 180, status: 'todo' },
    { subject_id: eng.id, title: 'Unit 5 vocabulary + essay', start_date: d(-2), due_date: d(-1), due_time: '08:00', estimated_minutes: 45, status: 'todo' },
    { subject_id: eng.id, title: 'Listening practice 4', due_date: d(-3), due_time: '08:00', estimated_minutes: 30, status: 'submitted', completed_at: doneAt(-4, 21) },
  ];
  for (const h of homework) await homeworkService.create({ assigned_date: d(-3), ...h });

  /* Ажил: ажлын газар → ээлж → орлого, захиалга, хамт ажиллагсад, ойрын зорилго */
  const cafe = await workplacesService.create({ name: 'Bloom кофе шоп', color: '#E8508F', pay_type: 'hourly', hourly_rate: 9500, payday: 25, payday_2: 10, notes: 'Сөүлийн гудамж 12. Ээлж солих бол 1 өдрийн өмнө Энхжинд хэлнэ.' });
  const studio = await workplacesService.create({ name: 'Номин Студи', color: '#2E8FD0', pay_type: 'fixed', monthly_salary: 900000, payday: 5, notes: 'Хагас цагийн дизайнер.' });
  const shifts = [
    [cafe, -6, '17:00', '22:00', 0], [cafe, -4, '17:00', '22:00', 0], [cafe, -2, '10:00', '16:00', 30], [cafe, -1, '17:00', '22:00', 0],
    [cafe, 0, '18:00', '23:00', 0], [cafe, 2, '17:00', '22:00', 0], [cafe, 4, '12:00', '18:00', 30], [cafe, 6, '17:00', '22:00', 0],
    [studio, -5, '10:00', '14:00', 0], [studio, -3, '10:00', '14:00', 0], [studio, 1, '10:00', '14:00', 0], [studio, 3, '13:00', '17:00', 0],
  ];
  for (const [wp, n, start_time, end_time, break_minutes] of shifts) {
    await shiftsService.create({ workplace_id: wp.id, shift_date: d(n), start_time, end_time, break_minutes, extra_pay: n === -2 ? 15000 : 0 });
  }
  await incomeService.create({ workplace_id: cafe.id, amount: 380000, received_date: d(-12), kind: 'salary', note: '10-р сарын 2-р хагас' });
  await incomeService.create({ workplace_id: studio.id, amount: 900000, received_date: d(-6), kind: 'salary' });
  await incomeService.create({ workplace_id: cafe.id, amount: 25000, received_date: d(-1), kind: 'tips' });

  const orders = [
    { customer_name: 'Сараа', customer_contact: '9911-4455', items: 'Гүзээлзгэнэтэй бялуу, 20 см', price: 85000, paid_amount: 40000, status: 'preparing', due_date: d(1), due_time: '14:00', delivery: 'Хан-Уул, 15-р хороо', notes: '«Happy birthday, Ээж» гэж бичих' },
    { customer_name: 'Тэмүүжин', customer_contact: '@temuujin.b', items: 'Нэртэй керамик аяга', quantity: 2, price: 36000, paid_amount: 36000, status: 'new', due_date: d(3), delivery: 'Өөрөө авна' },
    { customer_name: 'Оюука', customer_contact: '8800-1122', items: 'Төрсөн өдрийн cupcake', quantity: 12, price: 60000, paid_amount: 0, status: 'ready', due_date: d(-1), due_time: '18:00', delivery: 'Сансар, 32-р байр' },
    { customer_name: 'Батаа', items: 'Шоколадтай cookie хайрцаг', price: 28000, paid_amount: 28000, status: 'delivered', due_date: d(-3), delivered_at: doneAt(-3, 15) },
    { customer_name: 'Мишээл', items: 'Macaron', quantity: 24, price: 72000, paid_amount: 72000, status: 'delivered', due_date: d(-6), delivered_at: doneAt(-6, 12) },
    { customer_name: 'Анар', items: 'Цэцгийн баглаа + бялуу', price: 120000, paid_amount: 0, status: 'cancelled', due_date: d(-2) },
  ];
  for (const o of orders) await ordersService.create({ quantity: 1, ...o });

  await contactsService.create({ workplace_id: cafe.id, name: 'Энхжин', role: 'Менежер', contact: '9911-2233', notes: 'Ээлж солих бол 1 өдрийн өмнө хэлэх. Баасан бүр хуваарь гаргадаг.' });
  await contactsService.create({ workplace_id: cafe.id, name: 'Тэмүүлэн', role: 'Ахлах бариста', contact: '9505-7788', notes: 'Латте арт заана гэсэн 🙂' });
  await contactsService.create({ workplace_id: studio.id, name: 'Номин', role: 'Студийн захирал', contact: 'nomin@studio.mn', notes: 'Баасан бүр 16:00-д долоо хоногийн тайлан.' });

  const wk = weekRange();
  const mo = monthRange();
  await workGoalsService.create({ title: 'Энэ 7 хоногт 20 цаг ажиллах', metric: 'hours', target: 20, start_date: wk.from, end_date: wk.to, status: 'active' });
  await workGoalsService.create({ title: 'Энэ сард 1,500,000₮ олох', metric: 'income', target: 1500000, start_date: mo.from, end_date: mo.to, status: 'active' });
  await workGoalsService.create({ title: 'Энэ сард 10 захиалга хүргэх', metric: 'orders', target: 10, start_date: mo.from, end_date: mo.to, status: 'active' });
  await workGoalsService.create({ title: 'Портфолиод 3 шинэ ажил нэмэх', metric: 'custom', target: 3, manual_progress: 1, unit: 'ажил', start_date: d(-5), end_date: d(10), status: 'active' });
}
