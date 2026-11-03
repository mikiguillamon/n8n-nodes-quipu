const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const YAML = require('yaml');
const { NodeHelpers } = require('n8n-workflow');
const { Quipu } = require('../dist/nodes/Quipu/Quipu.node');
const { contract } = require('../dist/nodes/Quipu/helpers/types');
const spec = YAML.parse(fs.readFileSync('docs/api/quipu-public-2026-11-03.openapi.yaml', 'utf8'));
const paths = Object.entries(spec.paths).flatMap(([path, methods]) =>
	Object.entries(methods)
		.filter(([, op]) => op.operationId)
		.map(([method, op]) => ({ path, method: method.toUpperCase(), id: op.operationId })),
);
test('public contract retains exactly 49 operations without private endpoints', () => {
	assert.equal(paths.length, 49);
	assert.deepEqual([...contract.operationIds].sort(), paths.map((p) => p.id).sort());
});
for (const [resource, r] of Object.entries(contract.resources))
	for (const [action, op] of Object.entries(r.operations))
		test(`public route executes: ${op.operationId}`, async () => {
			const source = paths.find((p) => p.id === op.operationId);
			const node = new Quipu();
			const supplied = {
				resource,
				operation: action,
				resourceId: { mode: 'id', value: '7' },
				inputMode: 'fields',
				sendItems: false,
				bookEntryId: '7',
				ephemeralToken: 'temporary',
				binaryProperty: 'data',
				relationships: ['paysheets', 'simplified_invoices'].includes(resource)
					? { contact: { mode: 'id', value: '12' } }
					: {},
			};
			for (const f of op.attributes.filter((f) => f.required))
				supplied[f.name] =
					f.name === 'country_code'
						? { mode: 'id', value: 'ES' }
						: f.enum
							? f.enum[0]
							: f.format === 'date'
								? '2026-11-03'
								: 'Example';
			const parameters = NodeHelpers.getNodeParameters(
				node.description.properties,
				supplied,
				true,
				false,
				{ typeVersion: 1 },
				node.description,
			);
			let sent;
			const http = async (options) => {
				sent = options;
				if (action.startsWith('download')) return Buffer.from('%PDF-1.7');
				if (action === 'delete') return undefined;
				return {
					data:
						action === 'getAll'
							? [{ id: '7', type: resource, attributes: { name: 'Example' } }]
							: { id: '7', type: resource, attributes: { name: 'Example' } },
					meta: { pagination_info: { current_page: 1, total_pages: 1, total_results: 1 } },
				};
			};
			const context = {
				getInputData: () => [{ json: {} }],
				getNodeParameter: (n, i, def) => parameters[n] ?? def,
				getCredentials: async () => ({ ownerSlug: 'acme', clientId: op.operationId }),
				getNode: () => ({ name: 'Quipu' }),
				continueOnFail: () => false,
				helpers: {
					httpRequestWithAuthentication: async (_, o) => http(o),
					httpRequest: http,
					assertBinaryData: () => ({ fileName: 'invoice.pdf', mimeType: 'application/pdf' }),
					getBinaryDataBuffer: async () => Buffer.from('%PDF'),
					prepareBinaryData: async (b, n, m) => ({
						data: b.toString('base64'),
						fileName: n,
						mimeType: m,
					}),
				},
			};
			const [out] = await node.execute.call(context);
			assert.equal(
				sent.url,
				'https://getquipu.com' + source.path.replace('{owner_slug}', 'acme').replace('{id}', '7'),
			);
			assert.equal(sent.method, source.method);
			assert.equal(out.length, 1);
			assert.deepEqual(out[0].pairedItem, { item: 0 });
			if (['create', 'update'].includes(action)) {
				assert.equal(sent.body.data.type, resource);
				for (const f of op.attributes.filter((f) => f.required))
					assert.notEqual(sent.body.data.attributes[f.name], undefined);
			}
		});
test('n8n parameter resolver keeps update fields absent until explicitly added', () => {
	const d = new Quipu().description;
	const p = NodeHelpers.getNodeParameters(
		d.properties,
		{
			resource: 'invoices',
			operation: 'update',
			resourceId: { mode: 'id', value: '7' },
			fields: { notes: '', equivalence_surcharge: false, last_sent_at: 0 },
		},
		true,
		false,
		{ typeVersion: 1 },
		d,
	);
	assert.deepEqual(p.fields, { notes: '', equivalence_surcharge: false, last_sent_at: 0 });
	assert.equal(p.sendItems, false);
	assert.ok(!('lineItems' in p));
});
