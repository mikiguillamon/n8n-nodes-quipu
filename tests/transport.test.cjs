const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTransport, safePath } = require('../dist/nodes/Quipu/transport/request');
const { getPages } = require('../dist/nodes/Quipu/transport/pagination');
const { QuipuOAuth2Api } = require('../dist/credentials/QuipuOAuth2Api.credentials');
const context = (handler) => ({
	getCredentials: async () => ({
		clientId: 'client',
		clientSecret: 'SECRET',
		oauthTokenData: { access_token: 'TOKEN' },
	}),
	getNode: () => ({ name: 'Quipu', credentials: { quipuOAuth2Api: { id: '1' } } }),
	helpers: {
		httpRequestWithAuthentication: async (name, opts) => {
			assert.equal(name, 'quipuOAuth2Api');
			return handler(opts);
		},
		httpRequest: handler,
	},
});
const transport = () => {
	let time = 0;
	return createTransport({
		now: () => time,
		sleep: async (ms) => {
			time += ms;
		},
	});
};

test('page size remains stable when the final page is trimmed to Limit', async () => {
	const requested = [];
	const send = async (_, o) => {
		const page = o.query['page[number]'],
			size = o.query['page[size]'];
		requested.push([page, size]);
		return {
			data: Array.from({ length: size }, (_, i) => ({
				id: String((page - 1) * size + i + 1),
				type: 'contacts',
			})),
			meta: { pagination_info: { current_page: page, total_pages: 5, total_results: 500 } },
		};
	};
	const result = await getPages({}, '/acme/contacts', {}, false, 150, send);
	assert.deepEqual(requested, [
		[1, 100],
		[2, 100],
	]);
	assert.deepEqual(
		result.flatMap((p) => p.data.map((r) => r.id)),
		Array.from({ length: 150 }, (_, i) => String(i + 1)),
	);
	const later = await getPages(
		{},
		'/acme/contacts',
		{ 'page[number]': 2, 'page[size]': 100 },
		false,
		3,
		send,
	);
	assert.deepEqual(
		later.flatMap((p) => p.data.map((r) => r.id)),
		['101', '102', '103'],
	);
});
test('native OAuth uses fixed client credentials grant, Basic header and ecommerce scope', () => {
	const c = new QuipuOAuth2Api();
	const f = Object.fromEntries(c.properties.map((p) => [p.name, p.default]));
	assert.deepEqual(c.extends, ['oAuth2Api']);
	assert.equal(f.grantType, 'clientCredentials');
	assert.equal(f.authentication, 'header');
	assert.equal(f.scope, 'ecommerce');
	assert.equal(f.accessTokenUrl, 'https://getquipu.com/oauth/token');
});
test('fixed origin and no redirects prevent credential leakage', async () => {
	for (const p of [
		'https://evil.test/x',
		'//evil.test',
		'/a/../b',
		'/a/%2e%2e/b',
		'/a?x=y',
		'/a\\b',
		'/oauth/token',
	])
		assert.throws(() => safePath(p));
	let seen;
	await transport().request(
		context((o) => {
			seen = o;
			return { data: [] };
		}),
		{ path: '/acme/contacts' },
	);
	assert.equal(seen.url, 'https://getquipu.com/acme/contacts');
	assert.equal(seen.disableFollowRedirect, true);
	assert.equal(seen.headers.Accept, 'application/vnd.quipu.v1+json');
});
test('429 is retried with bounded waits and mutation timeout is never retried', async () => {
	let attempts = 0;
	await transport().request(
		context(() => {
			if (++attempts === 1)
				throw { statusCode: 429, response: { headers: { 'retry-after': '2' } } };
			return { data: [] };
		}),
		{ path: '/acme/contacts', method: 'POST', body: { data: {} } },
	);
	assert.equal(attempts, 2);
	attempts = 0;
	await assert.rejects(
		() =>
			transport().request(
				context(() => {
					attempts++;
					throw new Error('timeout SECRET TOKEN');
				}),
				{ path: '/acme/invoices', method: 'POST' },
			),
		(e) => !e.message.includes('SECRET') && !e.message.includes('TOKEN'),
	);
	assert.equal(attempts, 1);
});
test('rate-limit exhaustion and hostile retry header terminate', async () => {
	let attempts = 0;
	await assert.rejects(
		() =>
			transport().request(
				context(() => {
					attempts++;
					throw { statusCode: 429, response: { headers: { 'retry-after': '999999999' } } };
				}),
				{ path: '/acme/contacts' },
			),
		/429|rate/i,
	);
	assert.ok(attempts <= 4);
});
test('ephemeral downloads omit OAuth and retain binary response', async () => {
	const c = context(() => Buffer.from('%PDF'));
	c.helpers.httpRequestWithAuthentication = () => {
		throw Error('must not use OAuth');
	};
	const b = await transport().request(c, {
		path: '/acme/invoices/1/ephemeral_open_download',
		query: { token: 'private' },
		anonymous: true,
		binary: true,
	});
	assert.ok(Buffer.isBuffer(b));
});
test('pagination respects API pages, exact limit and retains included metadata', async () => {
	const pages = [];
	const fn = async (_, o) => {
		pages.push(o.query);
		const n = o.query['page[number]'];
		return {
			data: [
				{ id: String(n * 2 - 1), type: 'contacts' },
				{ id: String(n * 2), type: 'contacts' },
			],
			included: [{ id: 'a', type: 'items' }],
			meta: { pagination_info: { current_page: n, total_pages: 2, total_results: 4 } },
		};
	};
	const result = await getPages({}, '/acme/contacts', {}, false, 3, fn);
	assert.equal(result.length, 2);
	assert.equal(result[1].data.length, 1);
	assert.equal(result[1].included.length, 1);
	assert.equal(pages[1]['page[number]'], 2);
	const all = await getPages({}, '/acme/contacts', {}, true, 1, fn);
	assert.equal(all.flatMap((p) => p.data).length, 4);
});
test('pagination refuses repeated pages rather than looping or truncating silently', async () => {
	await assert.rejects(
		() =>
			getPages({}, '/acme/contacts', {}, true, 1, async () => ({
				data: [{ id: '1', type: 'contacts' }],
				meta: { pagination_info: { current_page: 1, total_pages: 3 } },
			})),
		/pagination|page/i,
	);
});
