// Run inside an isolated n8n container. All credentials and API responses are synthetic.
const assert = require('node:assert/strict');
const http = require('node:http');
const { createRequire } = require('node:module');
const path = require('node:path');
const n8nRoot = process.env.N8N_MODULE_ROOT || '/usr/local/lib/node_modules/n8n';
const fromN8n = createRequire(path.join(n8nRoot, 'package.json'));
const coreRoot = path.dirname(fromN8n.resolve('n8n-core/package.json'));
const { requestOAuth2 } = require(
	path.join(
		coreRoot,
		'dist/execution-engine/node-execution-context/utils/request-helpers/oauth.js',
	),
);
const { Container } = fromN8n('@n8n/di');
const { LockService } = fromN8n('@n8n/backend-common');
Container.set(LockService, { withLease: async (_namespace, _key, fn) => fn() });
const packageRoot =
	process.env.QUIPU_PACKAGE_ROOT ||
	'/home/node/.n8n/nodes/node_modules/@mikiguillamon/n8n-nodes-quipu';
const { QuipuOAuth2Api } = require(
	path.join(packageRoot, 'dist/credentials/QuipuOAuth2Api.credentials.js'),
);
const { createTransport } = require(
	path.join(packageRoot, 'dist/nodes/Quipu/transport/request.js'),
);

(async () => {
	let tokenCalls = 0,
		failToken = false,
		requests = 0,
		writes = 0;
	const server = http.createServer((req, res) => {
		const chunks = [];
		req.on('data', (chunk) => chunks.push(chunk));
		req.on('end', () => {
			try {
				assert.equal(req.url, '/oauth/token');
				assert.equal(req.method, 'POST');
				assert.equal(
					req.headers.authorization,
					'Basic ' + Buffer.from('fixture-client:fixture-secret').toString('base64'),
				);
				const body = new URLSearchParams(Buffer.concat(chunks).toString());
				assert.equal(body.get('grant_type'), 'client_credentials');
				assert.equal(body.get('scope'), 'ecommerce');
				assert.equal(body.has('client_secret'), false);
				assert.equal(body.has('client_id'), false);
				tokenCalls++;
				res.setHeader('Content-Type', 'application/json');
				if (failToken) {
					res.statusCode = 401;
					res.end(
						JSON.stringify({
							error: 'invalid_client',
							error_description: 'fixture-secret must never escape',
						}),
					);
				} else
					res.end(
						JSON.stringify({
							access_token: `fixture-token-${tokenCalls}`,
							token_type: 'Bearer',
							expires_in: 7200,
							scope: 'ecommerce',
						}),
					);
			} catch (error) {
				res.statusCode = 500;
				res.end(JSON.stringify({ error: error.message }));
			}
		});
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	try {
		const defaults = Object.fromEntries(
			new QuipuOAuth2Api().properties.map((p) => [p.name, p.default]),
		);
		const credentials = {
			...defaults,
			clientId: 'fixture-client',
			clientSecret: 'fixture-secret',
			accessTokenUrl: `http://127.0.0.1:${server.address().port}/oauth/token`,
		};
		const node = {
			name: 'Quipu',
			credentials: { quipuOAuth2Api: { id: 'native-test', name: 'Synthetic Quipu' } },
		};
		let unauthorized = 0;
		const ctx = {
			getCredentials: async () => credentials,
			getNode: () => node,
			getMode: () => 'manual',
			logger: { debug() {}, warn() {} },
			helpers: {
				httpRequest: async (options) => {
					requests++;
					assert.match(options.headers.Authorization, /^Bearer fixture-token-/);
					if (unauthorized > 0) {
						unauthorized--;
						throw { response: { status: 401 } };
					}
					return { data: [] };
				},
			},
		};
		const additionalData = {
			credentialsHelper: {
				runPreAuthentication: async () => undefined,
				getDecrypted: async () => credentials,
				updateCredentialsOauthTokenData: async () => {
					writes++;
				},
			},
		};
		const native = (options) =>
			requestOAuth2.call(ctx, 'quipuOAuth2Api', options, node, additionalData, undefined, true);
		await native({ url: 'https://getquipu.com/acme/contacts', method: 'GET' });
		assert.equal(tokenCalls, 1);
		assert.equal(writes, 1);
		assert.ok(Number(credentials.oauthTokenData.n8n_expires_at) > Date.now());
		await native({ url: 'https://getquipu.com/acme/contacts', method: 'GET' });
		assert.equal(tokenCalls, 1, 'reuse connected token');
		unauthorized = 1;
		await native({ url: 'https://getquipu.com/acme/contacts', method: 'GET' });
		assert.equal(tokenCalls, 2);
		assert.equal(writes, 2);
		assert.equal(credentials.oauthTokenData.access_token, 'fixture-token-2');
		unauthorized = 2;
		await assert.rejects(() =>
			native({ url: 'https://getquipu.com/acme/contacts', method: 'GET' }),
		);
		assert.equal(tokenCalls, 3, 'only one refresh for a persistent 401');
		delete credentials.oauthTokenData;
		failToken = true;
		unauthorized = 0;
		ctx.helpers.httpRequestWithAuthentication = async (_type, options) => native(options);
		let time = 0;
		const transport = createTransport({
			now: () => time,
			sleep: async (ms) => {
				time += ms;
			},
		});
		await assert.rejects(
			() => transport.request(ctx, { path: '/acme/contacts' }),
			(error) =>
				!error.message.includes('fixture-secret') && !error.message.includes('fixture-token'),
		);
		console.log(
			JSON.stringify({
				nativeOAuth: 'passed',
				tokenRequests: tokenCalls,
				businessRequests: requests,
				persistedTokenUpdates: writes,
				checks: [
					'Basic token authentication',
					'mandatory ecommerce scope',
					'client_credentials grant',
					'token reuse',
					'401 renewal',
					'bounded refresh',
					'expiry persisted',
					'acquisition error redaction',
				],
			}),
		);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
