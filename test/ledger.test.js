import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAmount, formatAmount, emptyLedger, createEntry, addEntry, removeEntry, summarize, validateLedger, importLedger, exportLedger} from '../ledger.js';

const entry = (amount = '0.10', type = 'income', id = 'receipt-1') => createEntry({date: '2026-10-02', type, amount, note: 'تجربة'}, id);

test('decimal input stays exact including Arabic numerals and safe boundary', () => {
    assert.equal(parseAmount('0.10'), 10);
    assert.equal(parseAmount('0.20'), 20);
    assert.equal(parseAmount('١٢٫٣٤'), 1234);
    assert.equal(parseAmount('۱۲.۳۴'), 1234);
    assert.equal(parseAmount('90071992547409.91'), Number.MAX_SAFE_INTEGER);
    assert.equal(formatAmount(Number.MAX_SAFE_INTEGER), '90071992547409.91');
    assert.equal(formatAmount(-1), '-0.01');
    for (const invalid of ['0', '-1', '0.001', '1e3', '1,000', 'NaN', '90071992547409.92', 'Infinity', '.50']) {
        assert.throws(() => parseAmount(invalid));
    }
});

test('receipts and expenses produce a consistent statement without mutating input', () => {
    const original = emptyLedger();
    let ledger = addEntry(original, entry('0.10'));
    ledger = addEntry(ledger, entry('0.20', 'income', 'receipt-2'));
    ledger = addEntry(ledger, entry('0.05', 'expense', 'expense-1'));
    assert.deepEqual(summarize(ledger), {incomeMinor: 30, expenseMinor: 5, balanceMinor: 25});
    assert.equal(original.entries.length, 0);
    assert.equal(summarize(removeEntry(ledger, 'receipt-1')).balanceMinor, 15);
    assert.throws(() => removeEntry(ledger, 'unknown'));
    assert.equal(summarize(addEntry(emptyLedger(), entry('1', 'expense'))).balanceMinor, -100);
});

test('JSON export and import round trip preserve integer amounts and notes', () => {
    const ledger = addEntry(emptyLedger(), {...entry('123.45'), note: '<img src=x onerror=alert(1)>'});
    assert.deepEqual(importLedger(exportLedger(ledger)), ledger);
    assert.equal(JSON.parse(exportLedger(ledger)).entries[0].amountMinor, 12345);
});

test('import rejects unexpected fields, versions, currencies and malformed entries', () => {
    const ledger = addEntry(emptyLedger(), entry());
    const invalid = [
        null, [], {...ledger, version: 2}, {...ledger, currency: 'USD'}, {...ledger, balance: 10},
        {...ledger, entries: null}, {...ledger, entries: [ledger.entries[0], ledger.entries[0]]},
        {...ledger, entries: [{...ledger.entries[0], amountMinor: 0}]},
        {...ledger, entries: [{...ledger.entries[0], amountMinor: 0.1}]},
        {...ledger, entries: [{...ledger.entries[0], amountMinor: '10'}]},
        {...ledger, entries: [{...ledger.entries[0], date: '2026-02-30'}]},
        {...ledger, entries: [{...ledger.entries[0], type: 'transfer'}]},
        {...ledger, entries: [{...ledger.entries[0], note: 'x'.repeat(161)}]},
        {...ledger, entries: [{...ledger.entries[0], secret: 'extra'}]},
        {...ledger, entries: [{...ledger.entries[0], id: '<script>'}]}
    ];
    for (const value of invalid) assert.throws(() => validateLedger(value));
    assert.throws(() => importLedger('{broken'));
    assert.throws(() => importLedger('x'.repeat(5 * 1024 * 1024 + 1)));
});

test('aggregate overflow is rejected before a new ledger can be saved', () => {
    const ledger = addEntry(emptyLedger(), entry('90071992547409.91'));
    assert.throws(() => addEntry(ledger, entry('0.01', 'income', 'receipt-2')));
    assert.equal(ledger.entries.length, 1);
});

test('calendar validation accepts leap day but rejects a non-leap day', () => {
    assert.equal(createEntry({date: '2024-02-29', type: 'income', amount: '1', note: ''}, 'leap').date, '2024-02-29');
    assert.throws(() => createEntry({date: '2025-02-29', type: 'income', amount: '1', note: ''}, 'leap'));
    assert.throws(() => createEntry({date: '2026-10-02', type: 'income', amount: '1', note: 0}, 'bad-note'));
});

test('entry count bound is checked before accepting a large import', () => {
    assert.throws(() => validateLedger({version: 1, currency: 'EGP', entries: Array(10001).fill(entry())}));
});
