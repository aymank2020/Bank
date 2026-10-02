import {emptyLedger, createEntry, addEntry, removeEntry, summarize, formatAmount, importLedger, exportLedger} from './ledger.js';

const KEY = 'bank.learning-ledger.v1';
const PAGE_SIZE = 50;
const $ = id => document.getElementById(id);
let ledger = emptyLedger();
let storageHealthy = true;
let pendingImport = null;
let importSequence = 0;
let page = 0;

function announce(message, error = false) {
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
}

function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function latest() {
    let value;
    try { value = localStorage.getItem(KEY); }
    catch { throw new Error('تعذر الوصول إلى الحفظ المحلي. راجع إعدادات المتصفح ثم أعد المحاولة.'); }
    return value === null ? emptyLedger() : importLedger(value);
}

function persist(next) {
    const serialized = exportLedger(next);
    try { localStorage.setItem(KEY, serialized); }
    catch { throw new Error('لم تُحفظ الحركة: مساحة المتصفح ممتلئة أو الحفظ محظور. الدفتر السابق لم يتغير.'); }
    ledger = next;
    storageHealthy = true;
    render();
}

function cell(row, text, className = '') {
    const element = document.createElement('td');
    element.textContent = text;
    element.className = className;
    row.append(element);
    return element;
}

function render() {
    const totals = summarize(ledger);
    $('balance').textContent = formatAmount(totals.balanceMinor);
    $('balance').classList.toggle('negative', totals.balanceMinor < 0);
    $('income').textContent = formatAmount(totals.incomeMinor);
    $('expense').textContent = formatAmount(totals.expenseMinor);
    $('entry-count').textContent = ledger.entries.length;
    $('save-entry').disabled = !storageHealthy;
    $('entries').replaceChildren();
    let running = 0n;
    const statement = ledger.entries.map(entry => {
        running += BigInt(entry.amountMinor) * (entry.type === 'income' ? 1n : -1n);
        return {entry, balance: Number(running)};
    }).reverse();
    page = Math.min(page, Math.max(0, Math.ceil(statement.length / PAGE_SIZE) - 1));
    if (!statement.length) {
        const row = document.createElement('tr');
        const empty = cell(row, 'دفترك يبدأ من هنا. أضف أول حركة قبض أو صرف.', 'empty-state');
        empty.colSpan = 6;
        $('entries').append(row);
    }
    for (const {entry, balance} of statement.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
        const row = document.createElement('tr');
        cell(row, entry.date, 'number');
        cell(row, entry.note || '—');
        cell(row, entry.type === 'income' ? 'قبض' : 'صرف', entry.type);
        cell(row, formatAmount(entry.amountMinor), 'number');
        cell(row, formatAmount(balance), 'number');
        const action = cell(row, '');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'delete';
        button.textContent = 'حذف';
        button.setAttribute('aria-label', `حذف حركة ${entry.date} بمبلغ ${formatAmount(entry.amountMinor)}`);
        button.disabled = !storageHealthy;
        button.addEventListener('click', () => {
            try { persist(removeEntry(latest(), entry.id)); announce('حُذفت الحركة وأعيد حساب الدفتر وحفظه.'); }
            catch (error) { announce(error.message, true); }
        });
        action.append(button);
        $('entries').append(row);
    }
    $('pager').hidden = statement.length <= PAGE_SIZE;
    $('newer').disabled = page === 0;
    $('older').disabled = (page + 1) * PAGE_SIZE >= statement.length;
    $('page-info').textContent = `صفحة ${page + 1} من ${Math.max(1, Math.ceil(statement.length / PAGE_SIZE))}`;
}

$('date').value = today();
try { ledger = latest(); }
catch (error) {
    storageHealthy = false;
    announce(`لم يُفتح الدفتر المحفوظ: ${error.message} يمكنك استيراد نسخة سليمة لاستبداله.`, true);
}
render();

$('entry-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
        const entry = createEntry({date: $('date').value, type: $('type').value, amount: $('amount').value, note: $('note').value});
        page = 0;
        persist(addEntry(latest(), entry));
        $('amount').value = '';
        $('note').value = '';
        announce('حُفظت الحركة في هذا المتصفح وحدّث الرصيد.');
        $('amount').focus();
    } catch (error) { announce(error.message, true); }
});

$('export').addEventListener('click', () => {
    try {
        const current = latest();
        const blob = new Blob([exportLedger(current)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `bank-ledger-${today()}.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        announce('جُهّز ملف JSON للتنزيل. احتفظ بالنسخة خارج بيانات المتصفح.');
    } catch (error) { announce(error.message, true); }
});

$('import-file').addEventListener('change', async () => {
    const sequence = ++importSequence;
    const file = $('import-file').files[0];
    pendingImport = null;
    $('import-confirm').disabled = true;
    $('import-preview').textContent = 'يُفحص الملف وتُعرض نتيجته قبل الاستبدال. الحد 5MB.';
    if (!file) return;
    try {
        if (file.size > 5 * 1024 * 1024) throw new Error('حجم الملف أكبر من الحد المسموح (5MB).');
        const parsed = importLedger(await file.text());
        if (sequence !== importSequence) return;
        pendingImport = parsed;
        $('import-preview').textContent = `ملف صالح: ${parsed.entries.length} حركة، رصيد ${formatAmount(summarize(parsed).balanceMinor)} جنيه. اعتماد الملف يستبدل كل الدفتر الحالي.`;
        $('import-confirm').disabled = false;
        announce('فُحص الملف. راجع نتيجته ثم اضغط اعتماد الملف إذا أردت الاستبدال.');
    } catch (error) {
        if (sequence !== importSequence) return;
        $('import-preview').textContent = `لم يُقبل الملف: ${error.message}`;
        announce('الدفتر الحالي لم يتغير. اختر ملف JSON صالحًا.', true);
    }
});

$('import-confirm').addEventListener('click', () => {
    if (!pendingImport) return;
    try {
        page = 0;
        persist(pendingImport);
        pendingImport = null;
        $('import-file').value = '';
        $('import-confirm').disabled = true;
        $('import-preview').textContent = 'اكتمل الاستيراد والحفظ. يمكنك اختيار نسخة أخرى عند الحاجة.';
        announce('استُبدل الدفتر بالملف المُتحقَّق منه وحُفظ في هذا المتصفح.');
    } catch (error) { announce(error.message, true); }
});

$('newer').addEventListener('click', () => { page--; render(); });
$('older').addEventListener('click', () => { page++; render(); });

window.addEventListener('storage', event => {
    if (event.key !== KEY && event.key !== null) return;
    try {
        ledger = latest();
        storageHealthy = true;
        render();
        announce('تحدّث الدفتر من نافذة أخرى في هذا المتصفح. استخدم نافذة واحدة للإدخال المتزامن.');
    } catch (error) {
        storageHealthy = false;
        render();
        announce(`تغير الحفظ المحلي إلى بيانات غير مقبولة: ${error.message}`, true);
    }
});
