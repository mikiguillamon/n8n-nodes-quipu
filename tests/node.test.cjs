const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Quipu } = require('../dist/nodes/Quipu/Quipu.node');
const { contract } = require('../dist/nodes/Quipu/helpers/types');
function leaves(properties) {
	return properties.flatMap((p) => [
		p,
		...(p.options || []).flatMap((o) => (o.values ? leaves(o.values) : o.type ? leaves([o]) : [])),
	]);
}
test('all business operations and writable fields have guided UI', () => {
	const props = new Quipu().description.properties;
	for (const [resource, r] of Object.entries(contract.resources))
		for (const [action, op] of Object.entries(r.operations)) {
			const scoped = props.filter(
				(p) =>
					p.displayOptions?.show?.resource?.includes(resource) &&
					p.displayOptions?.show?.operation?.includes(action),
			);
			const operation = props.find(
				(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes(resource),
			);
			assert.ok(
				operation.options.some((o) => o.value === action),
				op.operationId,
			);
			if (action === 'upload') continue;
			const fields = leaves(scoped);
			for (const f of op.attributes) {
				if (action === 'update' && ['kind', 'filing_number'].includes(f.name)) continue;
				assert.ok(
					fields.some((p) => p.name === f.name),
					`${op.operationId}: ${f.name}`,
				);
			}
			for (const r of op.relationships)
				assert.ok(
					r.name === 'items'
						? fields.some((p) => p.name === 'lineItems')
						: fields.some((p) => p.name === r.name),
					`${op.operationId}: relationship ${r.name}`,
				);
			for (const q of op.parameters)
				assert.ok(
					fields.some((p) => p.name === q.name) ||
						(q.name === 'token' && fields.some((p) => p.name === 'ephemeralToken')),
					`${op.operationId}: query ${q.name}`,
				);
		}
});
function ctx(params, handler, count = 1) {
	return {
		getInputData: () => Array.from({ length: count }, () => ({ json: {} })),
		getNodeParameter: (n, i, def) => params[n] ?? def,
		getCredentials: async () => ({ ownerSlug: 'acme', clientId: 'test' }),
		getNode: () => ({ name: 'Quipu' }),
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async (_, o) => handler(o),
			httpRequest: async (o) => handler(o),
			prepareBinaryData: async (b, n, m) => ({
				data: b.toString('base64'),
				fileName: n,
				mimeType: m,
			}),
			getBinaryDataBuffer: async () => Buffer.from('upload'),
			assertBinaryData: () => ({ fileName: 'file.pdf', mimeType: 'application/pdf' }),
		},
	};
}
test('executes document download into an n8n binary property', async () => {
	let url;
	const c = ctx(
		{ resource: 'invoices', operation: 'download', resourceId: '7', binaryProperty: 'pdf' },
		(o) => {
			url = o.url;
			return Buffer.from('%PDF');
		},
	);
	const [out] = await new Quipu().execute.call(c);
	assert.equal(url, 'https://getquipu.com/acme/invoices/7/download');
	assert.equal(out[0].binary.pdf.mimeType, 'application/pdf');
	assert.deepEqual(out[0].pairedItem, { item: 0 });
});
test('executes create, get and delete against exact public paths', async () => {
	let req;
	const run = async (p) =>
		new Quipu().execute.call(
			ctx(p, (o) => {
				req = o;
				return o.method === 'DELETE'
					? undefined
					: { data: { id: '5', type: p.resource, attributes: { name: 'Acme' } } };
			}),
		);
	const [created] = await run({
		resource: 'contacts',
		operation: 'create',
		name: 'Acme',
		country_code: 'ES',
	});
	assert.equal(req.method, 'POST');
	assert.equal(req.body.data.attributes.name, 'Acme');
	assert.equal(created[0].json.id, '5');
	await run({ resource: 'users', operation: 'get', resourceId: '5' });
	assert.equal(req.url, 'https://getquipu.com/users/5');
	const [deleted] = await run({ resource: 'contacts', operation: 'delete', resourceId: '5' });
	assert.equal(deleted[0].json.deleted, true);
});
test('multiple inputs retain pairing and Continue On Fail is item-local', async () => {
	const c = ctx(
		{ resource: 'users', operation: 'get', resourceId: '7' },
		() => ({ data: { id: '7', type: 'users', attributes: { name: 'A' } } }),
		2,
	);
	c.getNodeParameter = (name, i, def) =>
		name === 'resourceId'
			? i === 0
				? 'bad'
				: '7'
			: ({ resource: 'users', operation: 'get' }[name] ?? def);
	c.continueOnFail = () => true;
	const [out] = await new Quipu().execute.call(c);
	assert.ok(out[0].json.error);
	assert.equal(out[1].json.id, '7');
	assert.deepEqual(
		out.map((i) => i.pairedItem),
		[{ item: 0 }, { item: 1 }],
	);
});
test('upload consumes incoming binary and sends multipart without JSON header', async () => {
	let req;
	await new Quipu().execute.call(
		ctx(
			{ resource: 'attachments', operation: 'upload', bookEntryId: '2', binaryProperty: 'data' },
			(o) => {
				req = o;
				return { data: { id: '5', type: 'attachments' } };
			},
		),
	);
	assert.ok(Buffer.isBuffer(req.body));
	assert.match(req.body.toString(), /name="book_entry_id"\r\n\r\n2/);
	assert.match(req.body.toString(), /filename="file.pdf"/);
	assert.match(req.headers['Content-Type'], /^multipart\/form-data; boundary=/);
});
test('lookup uses server contact search and returns continuation', async () => {
	const c = ctx({}, (o) => {
		assert.equal(o.qs['filter[q]'], 'acme');
		return {
			data: [{ id: '1', type: 'contacts', attributes: { name: 'Acme', tax_id: 'A' } }],
			meta: { pagination_info: { current_page: 1, total_pages: 2 } },
		};
	});
	const result = await new Quipu().methods.listSearch.searchContacts.call(c, 'acme');
	assert.equal(result.results[0].value, '1');
	assert.equal(result.paginationToken, '2');
});
module.exports = { ctx };
