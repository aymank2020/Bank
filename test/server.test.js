import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.js';

test('actual HTTP entrypoint serves all module assets but no repository files', async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const home = await fetch(base);
        assert.equal(home.status, 200);
        const html = await home.text();
        assert.match(html, /id="entry-form"/);
        assert.match(html, /type="module" src="app.js"/);
        assert.match(home.headers.get('content-security-policy'), /connect-src 'none'/);
        for (const resource of ['styles.css', 'app.js', 'ledger.js']) {
            const response = await fetch(`${base}/${resource}`);
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
            assert.ok((await response.text()).length > 100);
        }
        for (const resource of ['package.json', '.git/config', 'server.js', 'test/ledger.test.js', '%2e%2e/package.json']) {
            assert.equal((await fetch(`${base}/${resource}`)).status, 404);
        }
        assert.equal((await fetch(`${base}/%`)).status, 400);
        assert.equal((await fetch(base, {method: 'POST'})).status, 405);
        const head = await fetch(base, {method: 'HEAD'});
        assert.equal(head.status, 200);
        assert.equal(await head.text(), '');
    } finally { await new Promise(resolve => server.close(resolve)); }
});
