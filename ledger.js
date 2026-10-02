export const MAX_ENTRIES = 10000;
const MAX_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

function fail(message) { throw new Error(message); }
function record(value, keys, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: بيانات غير صحيحة.`);
    const actual = Object.keys(value);
    if (actual.length !== keys.length || !actual.every(key => keys.includes(key))) fail(`${label}: حقول غير مطابقة للصيغة.`);
}

export function parseAmount(value) {
    if (typeof value !== 'string') fail('أدخل المبلغ كنص عشري.');
    const normalized = value.trim().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)).replace(/٫/g, '.');
    if (!/^\d{1,14}(?:\.\d{1,2})?$/.test(normalized)) fail('استخدم مبلغًا موجبًا مع منزلتين عشريتين كحد أقصى، مثل 25.50.');
    const [whole, fraction = ''] = normalized.split('.');
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (minor <= 0n || minor > MAX_MINOR) fail('المبلغ خارج النطاق الدقيق المسموح.');
    return Number(minor);
}

export function formatAmount(minor) {
    if (!Number.isSafeInteger(minor)) fail('المبلغ ليس عددًا صحيحًا دقيقًا.');
    const signed = BigInt(minor);
    const absolute = signed < 0n ? -signed : signed;
    return `${signed < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function validateDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('التاريخ غير صحيح.');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('التاريخ غير موجود في التقويم.');
}

function validateEntry(value) {
    record(value, ['id', 'date', 'type', 'amountMinor', 'note'], 'الحركة');
    if (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.id)) fail('معرّف الحركة غير صحيح.');
    validateDate(value.date);
    if (!['income', 'expense'].includes(value.type)) fail('نوع الحركة غير صحيح.');
    if (!Number.isSafeInteger(value.amountMinor) || value.amountMinor <= 0) fail('المبلغ يجب أن يكون عددًا صحيحًا موجبًا بوحدة القرش.');
    if (typeof value.note !== 'string' || value.note.length > 160) fail('الوصف يجب ألا يتجاوز 160 حرفًا.');
    return {id: value.id, date: value.date, type: value.type, amountMinor: value.amountMinor, note: value.note.trim()};
}

export function emptyLedger() { return {version: 1, currency: 'EGP', entries: []}; }

export function summarize(ledger) {
    let income = 0n;
    let expense = 0n;
    for (const entry of ledger.entries) {
        if (entry.type === 'income') income += BigInt(entry.amountMinor);
        else expense += BigInt(entry.amountMinor);
    }
    if (income > MAX_MINOR || expense > MAX_MINOR) fail('مجموع الحركات تجاوز النطاق الدقيق المسموح.');
    return {incomeMinor: Number(income), expenseMinor: Number(expense), balanceMinor: Number(income - expense)};
}

export function validateLedger(value) {
    record(value, ['version', 'currency', 'entries'], 'الدفتر');
    if (value.version !== 1 || value.currency !== 'EGP') fail('يدعم هذا الإصدار الصيغة 1 والجنيه المصري EGP فقط.');
    if (!Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES) fail(`يسمح الدفتر بحد أقصى ${MAX_ENTRIES} حركة.`);
    const entries = value.entries.map(validateEntry);
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) fail('توجد معرّفات حركات مكررة.');
    const ledger = {version: 1, currency: 'EGP', entries};
    summarize(ledger);
    return ledger;
}

export function createEntry({date, type, amount, note}, id = crypto.randomUUID()) {
    return validateEntry({id, date, type, amountMinor: parseAmount(amount), note: note ?? ''});
}

export function addEntry(ledger, entry) {
    return validateLedger({...ledger, entries: [...ledger.entries, entry]});
}

export function removeEntry(ledger, id) {
    if (!ledger.entries.some(entry => entry.id === id)) fail('الحركة لم تعد موجودة. حدّث العرض.');
    return validateLedger({...ledger, entries: ledger.entries.filter(entry => entry.id !== id)});
}

export function importLedger(text) {
    if (typeof text !== 'string' || text.length > 5 * 1024 * 1024) fail('حجم الملف أكبر من الحد المسموح (5MB).');
    let parsed;
    try { parsed = JSON.parse(text); } catch { fail('الملف ليس JSON صالحًا.'); }
    return validateLedger(parsed);
}

export function exportLedger(ledger) {
    return JSON.stringify(validateLedger(ledger), null, 2) + '\n';
}
