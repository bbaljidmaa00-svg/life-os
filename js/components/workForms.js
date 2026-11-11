/**
 * Ажлын маягтууд: ажлын газар, ээлж, орлого, захиалга, хамт ажиллагсад, ойрын зорилго.
 */
import {
  workplacesService, shiftsService, incomeService, ordersService, contactsService, workGoalsService,
  WORK_COLORS, PAY_TYPES, INCOME_KINDS, ORDER_STATUSES, GOAL_METRICS,
  shiftMinutes, shiftRate, money, hoursLabel, isOvernight, weekRange, monthRange, workplaceById,
} from '../services/workService.js';
import { store } from '../state/store.js';
import { openFormModal, confirmDialog, toast, options } from '../lib/ui.js';
import { esc } from '../lib/dom.js';
import { todayKey, addDaysKey, timeToMin, minToTime } from '../lib/dates.js';

let seq = 0;
const fid = (name) => `w-${name}-${++seq}`;

async function removeWithUndo(service, item, label) {
  await service.remove(item.id);
  toast(`“${label}” устгагдлаа`, { action: () => service.create({ ...item }) });
}

/** "12,500" / "12 500" / "12.5k"-гүй энгийн тоо → 12500. Хоосон бол null. */
export function parseAmount(v) {
  if (v === null || v === undefined) return null;
  const clean = String(v).replace(/[\s,₮]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  if (!Number.isFinite(n) || n < 0) throw new Error('Мөнгөн дүнг зөвхөн тоогоор оруулна уу.');
  return n;
}
const amountValue = (n) => (n === null || n === undefined || n === '' ? '' : String(Math.round(Number(n))));

function workplaceOptions(selected, { allowNone = false, noneLabel = 'Ажлын газаргүй' } = {}) {
  const list = [...workplacesService.all()].sort((a, b) => a.name.localeCompare(b.name, 'mn'));
  return `${allowNone ? `<option value="">${esc(noneLabel)}</option>` : ''}${list.map((w) => `<option value="${w.id}" ${w.id === selected ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}`;
}

const dayOptions = (selected) => `<option value="">Байхгүй</option>${Array.from({ length: 31 }, (_, i) => i + 1)
  .map((d) => `<option value="${d}" ${Number(selected) === d ? 'selected' : ''}>${d}-ний өдөр</option>`).join('')}`;

/* ── Ажлын газар ────────────────────────────────────────────────────────── */
export function openWorkplaceForm(wp = null, { onSaved } = {}) {
  const used = new Set(workplacesService.all().map((w) => w.color));
  const w = wp || { name: '', color: WORK_COLORS.find((c) => !used.has(c)) || WORK_COLORS[0], pay_type: 'hourly', hourly_rate: '', monthly_salary: '', payday: '', payday_2: '', notes: '' };
  const id = { name: fid('name'), type: fid('type'), rate: fid('rate'), sal: fid('sal'), p1: fid('p1'), p2: fid('p2'), notes: fid('notes') };
  return openFormModal({
    title: wp ? 'Ажлын газар засах' : 'Ажлын газар нэмэх',
    submitLabel: wp ? 'Хадгалах' : 'Нэмэх',
    fields: `
      <div class="field"><label for="${id.name}">Нэр</label>
        <input id="${id.name}" name="name" class="input" required maxlength="120" value="${esc(w.name)}" placeholder="Жишээ нь: Bloom кофе шоп" ${wp ? '' : 'autofocus'}></div>
      <div class="field"><span class="label">Өнгө</span>
        <div class="color-pick" role="radiogroup" aria-label="Өнгө">
          ${WORK_COLORS.map((c, i) => `<label class="color-dot" style="--dot:${c}"><input type="radio" name="color" value="${c}" ${c === w.color ? 'checked' : ''} aria-label="Өнгө ${i + 1}"><span></span></label>`).join('')}
        </div></div>
      <div class="field"><label for="${id.type}">Цалингийн төрөл</label><select id="${id.type}" name="pay_type" class="select">${options(PAY_TYPES, w.pay_type)}</select></div>
      <div class="field" data-pay="hourly"><label for="${id.rate}">Цагийн хөлс (₮)</label>
        <input id="${id.rate}" name="hourly_rate" class="input" inputmode="numeric" value="${amountValue(w.hourly_rate)}" placeholder="Жишээ нь: 9500"></div>
      <div class="field" data-pay="fixed"><label for="${id.sal}">Сарын цалин (₮)</label>
        <input id="${id.sal}" name="monthly_salary" class="input" inputmode="numeric" value="${amountValue(w.monthly_salary)}" placeholder="Жишээ нь: 1200000"></div>
      <div class="field-row" data-pay="paid">
        <div class="field"><label for="${id.p1}">Цалингийн өдөр</label><select id="${id.p1}" name="payday" class="select">${dayOptions(w.payday)}</select></div>
        <div class="field"><label for="${id.p2}">Урьдчилгааны өдөр</label><select id="${id.p2}" name="payday_2" class="select">${dayOptions(w.payday_2)}</select></div>
      </div>
      <div class="field"><label for="${id.notes}">Тэмдэглэл</label><textarea id="${id.notes}" name="notes" class="textarea" rows="2" placeholder="Хаяг, менежерийн утас, дүрэм…">${esc(w.notes)}</textarea></div>`,
    onMount(form) {
      const type = form.querySelector('[name=pay_type]');
      const sync = () => {
        form.querySelector('[data-pay=hourly]').hidden = type.value !== 'hourly';
        form.querySelector('[data-pay=fixed]').hidden = type.value !== 'fixed';
        form.querySelector('[data-pay=paid]').hidden = type.value === 'none';
      };
      type.addEventListener('change', sync);
      sync();
    },
    async onSubmit(data) {
      const payload = {
        name: data.name,
        color: data.color || w.color,
        pay_type: data.pay_type,
        hourly_rate: data.pay_type === 'hourly' ? parseAmount(data.hourly_rate) : null,
        monthly_salary: data.pay_type === 'fixed' ? parseAmount(data.monthly_salary) : null,
        payday: data.pay_type !== 'none' && data.payday ? Number(data.payday) : null,
        payday_2: data.pay_type !== 'none' && data.payday_2 ? Number(data.payday_2) : null,
        notes: data.notes,
      };
      const saved = wp ? await workplacesService.update(wp.id, payload) : await workplacesService.create(payload);
      toast(wp ? 'Ажлын газар шинэчлэгдлээ' : `“${saved.name}” нэмэгдлээ`);
      onSaved?.(saved);
    },
    onDelete: wp ? async () => {
      const shifts = shiftsService.all().filter((s) => s.workplace_id === wp.id).length;
      const ok = await confirmDialog({
        title: `“${wp.name}”-ийг устгах уу?`,
        message: `${shifts ? `Энэ газрын ${shifts} ээлж хамт устна. ` : ''}Орлогын бүртгэл, хамт ажиллагсад, зорилго үлдэнэ (ажлын газаргүй болно).`,
      });
      if (!ok) return;
      await workplacesService.remove(wp.id);
      // Сан дээр ээлж CASCADE-ээр устаж, бусдын workplace_id нь NULL болно — санах ойд ч мөн адил.
      store.set('workShifts', store.get('workShifts').filter((x) => x.workplace_id !== wp.id));
      ['income', 'workContacts', 'workGoals'].forEach((key) => store.set(key, store.get(key).map((x) => (x.workplace_id === wp.id ? { ...x, workplace_id: null } : x))));
      toast('Ажлын газар устгагдлаа');
    } : null,
  });
}

/* ── Ээлж ───────────────────────────────────────────────────────────────── */
const BREAKS = [0, 15, 30, 45, 60, 90];
const REPEATS = [{ value: '0', label: 'Давтахгүй' }, { value: '2', label: '2 долоо хоног' }, { value: '4', label: '4 долоо хоног' }, { value: '8', label: '8 долоо хоног' }];

export function openShiftForm(shift = null, defaults = {}, { onSaved } = {}) {
  if (!workplacesService.all().length) {
    toast('Эхлээд ажлын газраа нэмнэ үү.');
    return openWorkplaceForm(null, { onSaved: () => openShiftForm(shift, defaults, { onSaved }) });
  }
  const last = [...shiftsService.all()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const s = shift || {
    workplace_id: last?.workplace_id || workplacesService.all()[0].id,
    shift_date: todayKey(), start_time: last?.start_time || '09:00', end_time: last?.end_time || '17:00',
    break_minutes: last?.break_minutes ?? 0, hourly_rate: '', extra_pay: '', notes: '', ...defaults,
  };
  const id = { wp: fid('wp'), date: fid('date'), start: fid('start'), end: fid('end'), brk: fid('brk'), rate: fid('rate'), extra: fid('extra'), notes: fid('notes'), rep: fid('rep') };
  const breakValues = BREAKS.includes(Number(s.break_minutes)) ? BREAKS : [...BREAKS, Number(s.break_minutes)].sort((a, b) => a - b);
  return openFormModal({
    title: shift ? 'Ээлж засах' : 'Ээлж нэмэх',
    submitLabel: shift ? 'Хадгалах' : 'Нэмэх',
    fields: `
      <div class="field"><label for="${id.wp}">Ажлын газар</label><select id="${id.wp}" name="workplace_id" class="select" required>${workplaceOptions(s.workplace_id)}</select></div>
      <div class="field-row">
        <div class="field"><label for="${id.date}">Огноо</label><input id="${id.date}" name="shift_date" type="date" class="input" required value="${s.shift_date || ''}"></div>
        ${shift ? '' : `<div class="field"><label for="${id.rep}">Долоо хоног бүр давтах</label><select id="${id.rep}" name="repeat" class="select">${options(REPEATS, '0')}</select></div>`}
      </div>
      <div class="field-row">
        <div class="field"><label for="${id.start}">Эхлэх</label><input id="${id.start}" name="start_time" type="time" class="input" required value="${s.start_time || ''}"></div>
        <div class="field"><label for="${id.end}">Дуусах</label><input id="${id.end}" name="end_time" type="time" class="input" required value="${s.end_time || ''}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="${id.brk}">Завсарлага</label><select id="${id.brk}" name="break_minutes" class="select">${breakValues.map((m) => `<option value="${m}" ${Number(s.break_minutes) === m ? 'selected' : ''}>${m ? `${m} мин` : 'Байхгүй'}</option>`).join('')}</select></div>
        <div class="field"><label for="${id.extra}">Нэмэгдэл / урамшуулал (₮)</label><input id="${id.extra}" name="extra_pay" class="input" inputmode="numeric" value="${s.extra_pay ? amountValue(s.extra_pay) : ''}" placeholder="0"></div>
      </div>
      <div class="field" data-rate><label for="${id.rate}">Энэ ээлжийн цагийн хөлс (₮)</label><input id="${id.rate}" name="hourly_rate" class="input" inputmode="numeric" value="${amountValue(s.hourly_rate)}" placeholder=""></div>
      <p class="shift-preview" data-preview aria-live="polite"></p>
      <div class="field"><label for="${id.notes}">Тэмдэглэл</label><textarea id="${id.notes}" name="notes" class="textarea" rows="2" placeholder="Хэнтэй хамт, юу хийх…">${esc(s.notes)}</textarea></div>`,
    onMount(form) {
      const q = (n) => form.querySelector(`[name=${n}]`);
      const start = q('start_time');
      const end = q('end_time');
      let lastStart = start.value;
      start.addEventListener('change', () => {
        if (lastStart && end.value && start.value) end.value = minToTime((timeToMin(end.value) - timeToMin(lastStart) + timeToMin(start.value) + 1440) % 1440);
        lastStart = start.value;
      });
      const update = () => {
        const wp = workplaceById(q('workplace_id').value);
        const rateField = form.querySelector('[data-rate]');
        rateField.hidden = wp?.pay_type !== 'hourly';
        q('hourly_rate').placeholder = wp?.hourly_rate ? `Ердийн: ${money(wp.hourly_rate)}` : 'Ажлын газрын хөлсийг ашиглана';
        const preview = form.querySelector('[data-preview]');
        if (!start.value || !end.value || start.value === end.value) { preview.textContent = ''; return; }
        let rate = 0;
        let extra = 0;
        try { rate = parseAmount(q('hourly_rate').value) ?? 0; extra = parseAmount(q('extra_pay').value) ?? 0; } catch { /* оруулж байх үед */ }
        const draft = { workplace_id: wp?.id, start_time: start.value, end_time: end.value, break_minutes: Number(q('break_minutes').value) || 0, hourly_rate: rate || null };
        const mins = shiftMinutes(draft);
        const pay = (mins / 60) * shiftRate(draft) + extra;
        preview.innerHTML = `<b>${hoursLabel(mins)}</b>${isOvernight(draft) ? ' · дараагийн өглөө дуусна' : ''}${pay ? ` · ≈ <b>${money(pay)}</b>` : ''}`;
      };
      form.addEventListener('input', update);
      form.addEventListener('change', update);
      update();
    },
    async onSubmit(data) {
      if (data.start_time === data.end_time) throw new Error('Эхлэх, дуусах цаг ижил байж болохгүй.');
      const payload = {
        workplace_id: data.workplace_id,
        shift_date: data.shift_date,
        start_time: data.start_time,
        end_time: data.end_time,
        break_minutes: Number(data.break_minutes) || 0,
        hourly_rate: workplaceById(data.workplace_id)?.pay_type === 'hourly' ? parseAmount(data.hourly_rate) : null,
        extra_pay: parseAmount(data.extra_pay) ?? 0,
        notes: data.notes,
      };
      if (shiftMinutes(payload) <= 0) throw new Error('Завсарлага ээлжийн хугацаанаас урт байна.');
      if (shift) {
        await shiftsService.update(shift.id, payload);
        toast('Ээлж шинэчлэгдлээ');
      } else {
        const weeks = Math.max(1, Number(data.repeat) || 1);
        for (let i = 0; i < weeks; i++) await shiftsService.create({ ...payload, shift_date: addDaysKey(payload.shift_date, i * 7) });
        toast(weeks > 1 ? `${weeks} ээлж нэмэгдлээ (долоо хоног бүр)` : 'Ээлж нэмэгдлээ');
      }
      onSaved?.();
    },
    onDelete: shift ? () => removeWithUndo(shiftsService, shift, 'Ээлж') : null,
  });
}

/* ── Орлого ─────────────────────────────────────────────────────────────── */
export function openIncomeForm(entry = null, defaults = {}, { onSaved } = {}) {
  const e = entry || { amount: '', received_date: todayKey(), kind: 'salary', workplace_id: workplacesService.all()[0]?.id || '', note: '', ...defaults };
  const id = { amt: fid('amt'), date: fid('date'), kind: fid('kind'), wp: fid('wp'), note: fid('note') };
  return openFormModal({
    title: entry ? 'Орлого засах' : 'Орлого бүртгэх',
    submitLabel: entry ? 'Хадгалах' : 'Бүртгэх',
    fields: `
      <div class="field-row">
        <div class="field"><label for="${id.amt}">Дүн (₮)</label><input id="${id.amt}" name="amount" class="input" inputmode="numeric" required value="${amountValue(e.amount)}" placeholder="Жишээ нь: 450000" ${entry ? '' : 'autofocus'}></div>
        <div class="field"><label for="${id.date}">Хүлээн авсан өдөр</label><input id="${id.date}" name="received_date" type="date" class="input" required value="${e.received_date || ''}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="${id.kind}">Төрөл</label><select id="${id.kind}" name="kind" class="select">${options(INCOME_KINDS, e.kind)}</select></div>
        <div class="field"><label for="${id.wp}">Хаанаас</label><select id="${id.wp}" name="workplace_id" class="select">${workplaceOptions(e.workplace_id, { allowNone: true, noneLabel: 'Бусад эх үүсвэр' })}</select></div>
      </div>
      <p class="form-hint small muted" data-hint></p>
      <div class="field"><label for="${id.note}">Тэмдэглэл</label><input id="${id.note}" name="note" class="input" maxlength="200" value="${esc(e.note)}" placeholder="Заавал биш"></div>`,
    onMount(form) {
      const hint = form.querySelector('[data-hint]');
      const sync = () => {
        const wp = workplaceById(form.querySelector('[name=workplace_id]').value);
        const kind = form.querySelector('[name=kind]').value;
        hint.textContent = wp?.pay_type === 'hourly' && (kind === 'salary' || kind === 'advance')
          ? 'Цагийн хөлстэй ажлын цалинг ээлжээс аль хэдийн тооцдог тул энэ бүртгэл «Хүлээн авсан»-д харагдаж, орлогын нийлбэрт давхар нэмэгдэхгүй.'
          : '';
        hint.hidden = !hint.textContent;
      };
      form.addEventListener('change', sync);
      sync();
    },
    async onSubmit(data) {
      const amount = parseAmount(data.amount);
      if (!amount) throw new Error('Дүн 0-ээс их байх ёстой.');
      const payload = { amount, received_date: data.received_date, kind: data.kind, workplace_id: data.workplace_id || null, note: data.note };
      const saved = entry ? await incomeService.update(entry.id, payload) : await incomeService.create(payload);
      toast(entry ? 'Орлого шинэчлэгдлээ' : `${money(saved.amount)} бүртгэгдлээ`);
      onSaved?.(saved);
    },
    onDelete: entry ? () => removeWithUndo(incomeService, entry, money(entry.amount)) : null,
  });
}

/* ── Захиалга ───────────────────────────────────────────────────────────── */
export function openOrderForm(order = null, defaults = {}, { onSaved } = {}) {
  const o = order || { customer_name: '', customer_contact: '', items: '', quantity: 1, price: '', paid_amount: '', status: 'new', due_date: addDaysKey(todayKey(), 1), due_time: '', delivery: '', notes: '', ...defaults };
  const id = { cust: fid('cust'), contact: fid('contact'), items: fid('items'), qty: fid('qty'), price: fid('price'), paid: fid('paid'), status: fid('status'), dd: fid('dd'), dt: fid('dt'), del: fid('del'), notes: fid('notes') };
  return openFormModal({
    title: order ? 'Захиалга засах' : 'Шинэ захиалга',
    submitLabel: order ? 'Хадгалах' : 'Нэмэх',
    fields: `
      <div class="field"><label for="${id.items}">Юу захиалсан</label>
        <input id="${id.items}" name="items" class="input" required maxlength="500" value="${esc(o.items)}" placeholder="Жишээ нь: Гүзээлзгэнэтэй бялуу, 20 см" ${order ? '' : 'autofocus'}></div>
      <div class="field-row">
        <div class="field"><label for="${id.cust}">Захиалагч</label><input id="${id.cust}" name="customer_name" class="input" required maxlength="120" value="${esc(o.customer_name)}" placeholder="Нэр"></div>
        <div class="field"><label for="${id.contact}">Утас / хаяг (сошиал)</label><input id="${id.contact}" name="customer_contact" class="input" maxlength="120" value="${esc(o.customer_contact)}" placeholder="9911…, @instagram"></div>
      </div>
      <div class="field-row field-row-3">
        <div class="field"><label for="${id.qty}">Тоо</label><input id="${id.qty}" name="quantity" type="number" min="1" step="1" class="input" value="${o.quantity || 1}"></div>
        <div class="field"><label for="${id.price}">Нийт үнэ (₮)</label><input id="${id.price}" name="price" class="input" inputmode="numeric" value="${amountValue(o.price)}" placeholder="0"></div>
        <div class="field"><label for="${id.paid}">Төлсөн (₮)</label><input id="${id.paid}" name="paid_amount" class="input" inputmode="numeric" value="${amountValue(o.paid_amount)}" placeholder="0"></div>
      </div>
      <p class="shift-preview" data-balance aria-live="polite"></p>
      <div class="field-row">
        <div class="field"><label for="${id.dd}">Хүргэх өдөр</label><input id="${id.dd}" name="due_date" type="date" class="input" value="${o.due_date || ''}"></div>
        <div class="field"><label for="${id.dt}">Цаг</label><input id="${id.dt}" name="due_time" type="time" class="input" value="${o.due_time || ''}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="${id.status}">Төлөв</label><select id="${id.status}" name="status" class="select">${options(ORDER_STATUSES, o.status)}</select></div>
        <div class="field"><label for="${id.del}">Хүргэлт</label><input id="${id.del}" name="delivery" class="input" maxlength="200" value="${esc(o.delivery)}" placeholder="Хаяг эсвэл «Өөрөө авна»"></div>
      </div>
      <div class="field"><label for="${id.notes}">Тэмдэглэл</label><textarea id="${id.notes}" name="notes" class="textarea" rows="2" placeholder="Бичээс, өнгө, хэмжээ…">${esc(o.notes)}</textarea></div>`,
    onMount(form) {
      const out = form.querySelector('[data-balance]');
      const sync = () => {
        let price = 0;
        let paid = 0;
        try { price = parseAmount(form.querySelector('[name=price]').value) ?? 0; paid = parseAmount(form.querySelector('[name=paid_amount]').value) ?? 0; } catch { out.textContent = ''; return; }
        if (!price) { out.textContent = ''; return; }
        const left = price - paid;
        out.innerHTML = left > 0 ? `Үлдэгдэл: <b class="is-raspberry">${money(left)}</b>` : left === 0 ? '<b>Бүрэн төлөгдсөн</b>' : `Илүү төлсөн: <b>${money(-left)}</b>`;
      };
      form.addEventListener('input', sync);
      sync();
    },
    async onSubmit(data) {
      const price = parseAmount(data.price) ?? 0;
      const paid = parseAmount(data.paid_amount) ?? 0;
      const quantity = Math.max(1, Math.round(Number(data.quantity) || 1));
      const payload = {
        customer_name: data.customer_name, customer_contact: data.customer_contact, items: data.items, quantity, price, paid_amount: paid,
        status: data.status, due_date: data.due_date || null, due_time: data.due_time || null, delivery: data.delivery, notes: data.notes,
        delivered_at: data.status === 'delivered' ? (order?.delivered_at || new Date().toISOString()) : null,
      };
      const saved = order ? await ordersService.update(order.id, payload) : await ordersService.create(payload);
      toast(order ? 'Захиалга шинэчлэгдлээ' : `${saved.customer_name}-ийн захиалга нэмэгдлээ`);
      onSaved?.(saved);
    },
    onDelete: order ? () => removeWithUndo(ordersService, order, `${order.customer_name}-ийн захиалга`) : null,
  });
}

/* ── Хамт ажиллагсад ────────────────────────────────────────────────────── */
export function openContactForm(contact = null, defaults = {}, { onSaved } = {}) {
  const c = contact || { name: '', role: '', contact: '', notes: '', workplace_id: workplacesService.all()[0]?.id || '', ...defaults };
  const id = { name: fid('name'), role: fid('role'), wp: fid('wp'), contact: fid('contact'), notes: fid('notes') };
  return openFormModal({
    title: contact ? 'Хамт ажиллагч засах' : 'Хамт ажиллагч нэмэх',
    submitLabel: contact ? 'Хадгалах' : 'Нэмэх',
    fields: `
      <div class="field-row">
        <div class="field"><label for="${id.name}">Нэр</label><input id="${id.name}" name="name" class="input" required maxlength="120" value="${esc(c.name)}" placeholder="Нэр" ${contact ? '' : 'autofocus'}></div>
        <div class="field"><label for="${id.role}">Албан тушаал</label><input id="${id.role}" name="role" class="input" maxlength="80" value="${esc(c.role)}" placeholder="Менежер, ахлах…"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="${id.wp}">Ажлын газар</label><select id="${id.wp}" name="workplace_id" class="select">${workplaceOptions(c.workplace_id, { allowNone: true })}</select></div>
        <div class="field"><label for="${id.contact}">Холбоо барих</label><input id="${id.contact}" name="contact" class="input" maxlength="120" value="${esc(c.contact)}" placeholder="Утас, имэйл"></div>
      </div>
      <div class="field"><label for="${id.notes}">Тэмдэглэл</label><textarea id="${id.notes}" name="notes" class="textarea" rows="3" placeholder="Юунд туслах, юу ярилцсан, анхаарах зүйл…">${esc(c.notes)}</textarea></div>`,
    async onSubmit(data) {
      const payload = { name: data.name, role: data.role, contact: data.contact, notes: data.notes, workplace_id: data.workplace_id || null };
      const saved = contact ? await contactsService.update(contact.id, payload) : await contactsService.create(payload);
      toast(contact ? 'Шинэчлэгдлээ' : `${saved.name} нэмэгдлээ`);
      onSaved?.(saved);
    },
    onDelete: contact ? () => removeWithUndo(contactsService, contact, contact.name) : null,
  });
}

/* ── Ойрын зорилго ──────────────────────────────────────────────────────── */
const PERIODS = [{ value: 'week', label: 'Энэ 7 хоног' }, { value: 'month', label: 'Энэ сар' }, { value: 'custom', label: 'Өөрөө сонгох' }];

function periodDates(period) {
  if (period === 'week') return weekRange();
  if (period === 'month') return monthRange();
  return null;
}

export function openWorkGoalForm(goal = null, defaults = {}, { onSaved } = {}) {
  const week = weekRange();
  const g = goal || { title: '', metric: 'hours', target: '', unit: '', workplace_id: '', manual_progress: 0, start_date: week.from, end_date: week.to, period: 'week', ...defaults };
  if (!goal && g.period && g.period !== 'custom') Object.assign(g, { start_date: periodDates(g.period).from, end_date: periodDates(g.period).to });
  const id = { title: fid('title'), metric: fid('metric'), target: fid('target'), unit: fid('unit'), wp: fid('wp'), period: fid('period'), sd: fid('sd'), ed: fid('ed'), manual: fid('manual') };
  return openFormModal({
    title: goal ? 'Зорилго засах' : 'Ойрын зорилго',
    submitLabel: goal ? 'Хадгалах' : 'Нэмэх',
    fields: `
      <div class="field"><label for="${id.title}">Зорилго</label>
        <input id="${id.title}" name="title" class="input" required maxlength="200" value="${esc(g.title)}" placeholder="Жишээ нь: Энэ 7 хоногт 20 цаг ажиллах" ${goal ? '' : 'autofocus'}></div>
      <div class="field-row">
        <div class="field"><label for="${id.metric}">Юугаар хэмжих</label><select id="${id.metric}" name="metric" class="select">${options(GOAL_METRICS, g.metric)}</select></div>
        <div class="field"><label for="${id.target}">Зорилт <span data-unit-label></span></label><input id="${id.target}" name="target" class="input" inputmode="decimal" required value="${g.target ? (g.metric === 'income' ? amountValue(g.target) : g.target) : ''}" placeholder="20"></div>
      </div>
      <div class="field-row" data-custom>
        <div class="field"><label for="${id.unit}">Нэгж</label><input id="${id.unit}" name="unit" class="input" maxlength="30" value="${esc(g.unit)}" placeholder="кейс, хуудас, удаа…"></div>
        <div class="field"><label for="${id.manual}">Одоогийн явц</label><input id="${id.manual}" name="manual_progress" type="number" min="0" step="any" class="input" value="${g.manual_progress || 0}"></div>
      </div>
      <div class="field" data-wp><label for="${id.wp}">Ажлын газар</label><select id="${id.wp}" name="workplace_id" class="select">${workplaceOptions(g.workplace_id, { allowNone: true, noneLabel: 'Бүх ажил' })}</select></div>
      ${goal ? '' : `<div class="field"><label for="${id.period}">Хугацаа</label><select id="${id.period}" name="period" class="select">${options(PERIODS, g.period || 'custom')}</select></div>`}
      <div class="field-row" data-dates>
        <div class="field"><label for="${id.sd}">Эхлэх</label><input id="${id.sd}" name="start_date" type="date" class="input" required value="${g.start_date || ''}"></div>
        <div class="field"><label for="${id.ed}">Дуусах</label><input id="${id.ed}" name="end_date" type="date" class="input" required value="${g.end_date || ''}"></div>
      </div>
      <p class="form-hint small muted" data-auto></p>`,
    onMount(form) {
      const q = (n) => form.querySelector(`[name=${n}]`);
      const sync = () => {
        const m = q('metric').value;
        form.querySelector('[data-custom]').hidden = m !== 'custom';
        form.querySelector('[data-wp]').hidden = m === 'custom' || m === 'orders';
        form.querySelector('[data-unit-label]').textContent = m === 'income' ? '(₮)' : m === 'hours' ? '(цаг)' : m === 'orders' ? '(тоо)' : '';
        form.querySelector('[data-auto]').textContent = {
          hours: 'Дууссан ээлжүүдийн цагаас автоматаар тоологдоно.',
          income: 'Ээлжийн цалин, урамшуулал, хүргэсэн захиалга зэргээс автоматаар тоологдоно.',
          orders: '«Хүргэсэн» болсон захиалгуудаас автоматаар тоологдоно.',
          custom: 'Явцаа зорилгын карт дээрх −/+ товчоор тэмдэглэнэ.',
        }[m];
        const period = q('period');
        if (period) {
          const dates = periodDates(period.value);
          form.querySelector('[data-dates]').hidden = Boolean(dates);
          if (dates) { q('start_date').value = dates.from; q('end_date').value = dates.to; }
        }
      };
      form.addEventListener('change', (e) => { if (['metric', 'period'].includes(e.target.name)) sync(); });
      sync();
    },
    async onSubmit(data) {
      const target = data.metric === 'income' ? parseAmount(data.target) : Number(String(data.target).replace(',', '.'));
      if (!target || target <= 0) throw new Error('Зорилт 0-ээс их тоо байх ёстой.');
      if (data.end_date < data.start_date) throw new Error('Дуусах өдөр эхлэх өдрөөс хойш байх ёстой.');
      const payload = {
        title: data.title, metric: data.metric, target,
        unit: data.metric === 'custom' ? data.unit : null,
        manual_progress: data.metric === 'custom' ? Math.max(0, Number(data.manual_progress) || 0) : 0,
        workplace_id: data.metric === 'hours' || data.metric === 'income' ? (data.workplace_id || null) : null,
        start_date: data.start_date, end_date: data.end_date,
      };
      const saved = goal ? await workGoalsService.update(goal.id, payload) : await workGoalsService.create({ ...payload, status: 'active' });
      toast(goal ? 'Зорилго шинэчлэгдлээ' : `“${saved.title}” зорилго нэмэгдлээ`);
      onSaved?.(saved);
    },
    onDelete: goal ? () => removeWithUndo(workGoalsService, goal, goal.title) : null,
  });
}
