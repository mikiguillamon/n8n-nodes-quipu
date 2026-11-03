const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildBody, buildQuery, resolvePath } = require('../dist/nodes/Quipu/helpers/payload');
const { simplifyResponse } = require('../dist/nodes/Quipu/helpers/output');

test('line categories preserve explicit null and target countries accept locator values', () => {
	const body = buildBody('invoices', 'update', {}, {}, [
		{ concept: 'Line', clearRelationships: ['accounting_category'] },
	]);
	assert.equal(body.data.relationships.items.data[0].relationships.accounting_category, null);
	assert.throws(
		() =>
			buildBody('paysheets', 'update', {}, {}, [{ clearRelationships: ['accounting_category'] }]),
		/relationship|categor/,
	);
	assert.equal(
		buildBody('additional_incomes', 'update', { target_country: { mode: 'id', value: 'FR' } }, {})
			.data.attributes.target_country,
		'FR',
	);
});

test('nullable relationship values use documented outer null, never a fabricated data:null', () => {
	assert.deepEqual(
		buildBody('contacts', 'update', {}, { income_category: null }).data.relationships,
		{ income_category: null },
	);
	assert.deepEqual(
		buildBody('invoices', 'update', {}, {}, undefined, [], ['contact']).data.relationships,
		{ contact: null },
	);
	assert.throws(
		() => buildBody('invoices', 'update', {}, {}, undefined, [], ['attachments']),
		/nullable/,
	);
	assert.throws(
		() => buildBody('invoices', 'update', {}, { contact: '3' }, undefined, [], ['contact']),
		/either/,
	);
});

test('date fields and date arrays reject impossible calendar dates', () => {
	assert.throws(
		() => buildBody('invoices', 'update', { issue_date: '2026-02-30' }, {}),
		/date|YYYY/,
	);
	assert.throws(
		() => buildBody('invoices', 'update', { due_dates: '2026-11-01, invalid' }, {}),
		/date|YYYY/,
	);
	assert.deepEqual(
		buildBody('invoices', 'update', { due_dates: '2026-11-01, 2026-12-01' }, {}).data.attributes
			.due_dates,
		['2026-11-01', '2026-12-01'],
	);
});
test('paysheet line items do not accept unsupported category relationships', () => {
	assert.throws(
		() =>
			buildBody('paysheets', 'update', {}, {}, [{ concept: 'Salary', accounting_category: '3' }]),
		/categor|relationship/,
	);
});

test('creates contact using exact documented names and preserves false', () => {
	const b = buildBody(
		'contacts',
		'create',
		{ name: 'Acme', country_code: 'ES', equivalence_subcharge: false },
		{},
	);
	assert.deepEqual(b, {
		data: {
			type: 'contacts',
			attributes: { name: 'Acme', country_code: 'ES', equivalence_subcharge: false },
		},
	});
});
test('PATCH distinguishes absence, null, false, zero and empty strings', () => {
	const b = buildBody(
		'invoices',
		'update',
		{ notes: '', equivalence_surcharge: false, last_sent_at: 0 },
		{},
		undefined,
		['paid_at'],
	);
	assert.deepEqual(b.data.attributes, {
		notes: '',
		equivalence_surcharge: false,
		last_sent_at: 0,
		paid_at: null,
	});
	assert.ok(!('relationships' in b.data));
	assert.throws(() => buildBody('invoices', 'update', { kind: 'income' }, {}), /kind/);
	assert.throws(
		() => buildBody('invoices', 'update', {}, {}, undefined, ['notes']),
		/clear|nullable/i,
	);
});
test('replacement items preserve IDs, decimals and category links', () => {
	const b = buildBody('invoices', 'update', {}, { contact: { value: '12', mode: 'id' } }, [
		{
			id: '8',
			concept: 'Consulting',
			unitary_amount: '12.3400',
			quantity: 0,
			vat_percent: 0,
			accounting_category: '3',
		},
	]);
	assert.deepEqual(b.data.relationships.contact, { data: { id: '12', type: 'contacts' } });
	assert.equal(b.data.relationships.items.data[0].attributes.unitary_amount, '12.3400');
	assert.equal(b.data.relationships.items.data[0].attributes.quantity, 0);
	assert.equal(b.data.relationships.items.data[0].id, '8');
	assert.deepEqual(b.data.relationships.items.data[0].relationships.accounting_category, {
		data: { id: '3', type: 'accounting_categories' },
	});
	assert.deepEqual(buildBody('invoices', 'update', {}, {}, []).data.relationships.items, {
		data: [],
	});
});
test('enforces conditional creation requirements without forcing dates on drafts', () => {
	assert.throws(() => buildBody('invoices', 'create', { kind: 'expenses' }, {}), /issue_date/);
	assert.doesNotThrow(() => buildBody('invoices', 'create', { kind: 'income' }, {}));
	assert.throws(
		() => buildBody('simplified_invoices', 'create', { kind: 'income' }, {}),
		/recipient|contact/,
	);
	assert.throws(
		() => buildBody('paysheets', 'create', { issue_date: '2026-11-03' }, {}),
		/contact/,
	);
	assert.throws(() => buildBody('contacts', 'create', { name: 'x' }, {}), /country_code/);
	assert.throws(() => buildBody('numbering_series', 'update', { prefix: 'X' }, {}), /prefix/);
});
test('builds query arrays and presence flags correctly', () => {
	assert.deepEqual(
		buildQuery({
			include: ['items', 'contact'],
			with_detailed_amounts: false,
			'filter[kind]': 'income',
		}),
		{ include: 'items,contact', 'filter[kind]': 'income' },
	);
	assert.deepEqual(buildQuery({ with_detailed_amounts: true }), { with_detailed_amounts: true });
	assert.throws(() => buildQuery({ 'filter[operation_date][from]': '2026-01-01' }), /together/);
});
test('restricts path segments and substitutes IDs safely', () => {
	assert.equal(resolvePath('/{owner_slug}/invoices/{id}', 'company', '8'), '/company/invoices/8');
	for (const s of ['../x', 'https://evil.test', 'a/b', 'a?token=x', '%2e%2e'])
		assert.throws(() => resolvePath('/{owner_slug}/invoices', s), /slug/);
});
test('simplified output retains included identities and relationships', () => {
	const page = {
		data: [
			{
				type: 'invoices',
				id: '1',
				attributes: { number: 'A' },
				relationships: { contact: { data: { type: 'contacts', id: '9' } } },
			},
		],
		included: [
			{ type: 'contacts', id: '9', attributes: { name: 'Acme' } },
			{ type: 'book_entry_items', id: '4', attributes: { quantity: '2' } },
		],
	};
	const [r] = simplifyResponse(page);
	assert.equal(r.id, '1');
	assert.equal(r.number, 'A');
	assert.equal(r.related.contact.name, 'Acme');
	assert.equal(r.included.length, 2);
	assert.equal(r.relationships.contact.data.id, '9');
});
