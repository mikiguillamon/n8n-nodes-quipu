import type { INodeProperties } from 'n8n-workflow';
import { contract, relationshipTypes } from '../helpers/types';
import { fieldProperty, label, locator, lookupMethods, resourceLabels } from './fields';

const operationLabels: Record<string, string> = {
	getAll: 'Get Many',
	get: 'Get',
	create: 'Create',
	update: 'Update',
	delete: 'Delete',
	download: 'Download PDF',
	downloadEphemeral: 'Download PDF With Token',
	upload: 'Upload',
};
function actionLabel(action: string, resource: string): string {
	const singular = resourceLabels[resource].toLowerCase();
	const plural = singular.endsWith('category')
		? singular.slice(0, -1) + 'ies'
		: singular.endsWith('entry')
			? singular.slice(0, -1) + 'ies'
			: singular.endsWith('series')
				? singular
				: singular + 's';
	if (action === 'getAll') return `Get many ${plural}`;
	if (action === 'download') return `Download ${singular} PDF`;
	if (action === 'downloadEphemeral') return `Download ${singular} PDF with a token`;
	return `${operationLabels[action]} ${/^[aeiou]/.test(singular) ? 'an' : 'a'} ${singular}`;
}
const collection = (
	name: string,
	displayName: string,
	options: INodeProperties[],
): INodeProperties => ({
	displayName,
	name,
	type: 'collection',
	placeholder: 'Add Field',
	default: {},
	options: options.sort((a, b) => a.displayName.localeCompare(b.displayName)),
});
export function createProperties(): INodeProperties[] {
	const properties: INodeProperties[] = [
		{
			displayName: 'Resource',
			name: 'resource',
			type: 'options',
			noDataExpression: true,
			default: 'invoices',
			options: [
				...Object.keys(contract.resources).map((value) => ({ name: resourceLabels[value], value })),
				{ name: 'Custom API Request', value: 'custom' },
			].sort((a, b) => a.name.localeCompare(b.name)),
		},
	];
	for (const [resource, definition] of Object.entries(contract.resources)) {
		properties.push({
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show: { resource: [resource] } },
			default: 'get',
			options: Object.keys(definition.operations)
				.map((value) => ({
					name: operationLabels[value],
					value,
					action: actionLabel(value, resource),
					description: `${operationLabels[value]} ${resourceLabels[resource].toLowerCase()}`,
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		});
		properties[properties.length - 1].default = definition.operations.getAll ? 'getAll' : 'get';
		for (const [action, op] of Object.entries(definition.operations)) {
			const show = { resource: [resource], operation: [action] };
			const add = (p: INodeProperties, extra: Record<string, Array<string | boolean>> = {}) =>
				properties.push({ ...p, displayOptions: { show: { ...show, ...extra } } });
			if (op.path.includes('{id}'))
				add(
					lookupMethods[resource]
						? locator('resourceId', resourceLabels[resource], resource, true)
						: {
								displayName: `${resourceLabels[resource]} ID`,
								name: 'resourceId',
								type: 'string',
								default: '',
								required: true,
							},
				);
			if (action === 'getAll') {
				add({
					displayName: 'Return All',
					name: 'returnAll',
					type: 'boolean',
					default: false,
					description: 'Whether to return all results or only up to a given limit',
				});
				add(
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						default: 50,
						typeOptions: { minValue: 1, maxValue: 100000 },
						description: 'Max number of results to return',
					},
					{ returnAll: [false] },
				);
			}
			if (action === 'downloadEphemeral')
				add({
					displayName: 'Ephemeral Token',
					name: 'ephemeralToken',
					type: 'string',
					typeOptions: { password: true },
					default: '',
					required: true,
					description:
						'Token from ephemeral_open_download_pdf_url. Uses token authentication without sending OAuth credentials.',
				});
			if (action.startsWith('download') || action === 'upload')
				add({
					displayName: action === 'upload' ? 'Input Binary Field' : 'Put Output File in Field',
					name: 'binaryProperty',
					type: 'string',
					default: 'data',
					required: true,
					description:
						action === 'upload'
							? 'Name of the incoming binary property containing the file'
							: 'Name of the binary property for the downloaded PDF',
				});
			if (action === 'upload') add(locator('bookEntryId', 'Book Entry', 'book_entries', true));
			const query = op.parameters
				.filter((f) => f.name !== 'token')
				.map((f) => {
					if (f.name === 'include') {
						const choices = [
							'items',
							'accounting_category',
							'accounting_subcategory',
							'items.accounting_category',
							'items.accounting_subcategory',
						];
						if (['invoices', 'book_entries'].includes(resource)) choices.push('contact');
						if (resource === 'paysheets')
							choices.splice(
								0,
								choices.length,
								'contact',
								'accounting_category',
								'accounting_subcategory',
							);
						return {
							displayName: 'Include Related Data',
							name: 'include',
							type: 'multiOptions',
							options: choices
								.map((value) => ({ name: label(value.replace(/\./g, '_')), value }))
								.sort((a, b) => a.name.localeCompare(b.name)),
							default: [],
						} as INodeProperties;
					}
					if (f.name === 'filter[contact_id]') return locator(f.name, 'Contact', 'contacts');
					if (f.name === 'filter[kind]' && resource === 'accounting_categories')
						return {
							displayName: 'Category Types',
							name: f.name,
							type: 'multiOptions',
							default: [],
							options: ['expenses', 'income', 'assets', 'capital', 'creditor_debitor', 'financial']
								.map((value) => ({ name: label(value), value }))
								.sort((a, b) => a.name.localeCompare(b.name)),
						} as INodeProperties;
					const p = fieldProperty(f);
					if (f.name === 'page[number]') {
						p.default = 1;
						p.typeOptions = { minValue: 1 };
					}
					if (f.name === 'page[size]') {
						p.default = 100;
						p.typeOptions = { minValue: 1, maxValue: 100 };
					}
					return p;
				});
			if (query.length)
				add(collection('query', action === 'getAll' ? 'Filters and Options' : 'Options', query));
			if (['create', 'update'].includes(action)) {
				add({
					displayName: 'Input Mode',
					name: 'inputMode',
					type: 'options',
					default: 'fields',
					options: [
						{ name: 'Fields', value: 'fields' },
						{ name: 'JSON', value: 'json' },
					],
					description: 'Use guided fields or provide the complete JSON:API request body',
				});
				add(
					{
						displayName: 'JSON Body',
						name: 'jsonBody',
						type: 'json',
						default: '{\n  "data": {}\n}',
						required: true,
						description: 'Complete JSON:API body. Replaces all guided fields; it is not merged.',
					},
					{ inputMode: ['json'] },
				);
				const attributes = op.attributes.filter(
					(f) => !(action === 'update' && ['kind', 'filing_number'].includes(f.name)),
				);
				const required = attributes.filter((f) => action === 'create' && f.required);
				for (const f of required)
					add({ ...fieldProperty(f), required: true }, { inputMode: ['fields'] });
				const optional = attributes.filter((f) => !required.includes(f));
				if (optional.length)
					add(
						collection(
							'fields',
							action === 'update' ? 'Fields to Update' : 'Additional Fields',
							optional.map(fieldProperty),
						),
						{ inputMode: ['fields'] },
					);
				const relations = op.relationships.filter((r) => r.name !== 'items');
				const nullableLinks = relations.filter((r) => r.nullable);
				if (nullableLinks.length)
					add(
						{
							displayName: 'Set Relationships to Null',
							name: 'clearRelationships',
							type: 'multiOptions',
							default: [],
							options: nullableLinks.map((r) => ({ name: label(r.name), value: r.name })),
							description:
								'Send null for these relationships, as allowed by the public schema. Check the returned relationship: Quipu determines whether this removes the link.',
						},
						{ inputMode: ['fields'] },
					);
				if (relations.length)
					add(
						collection(
							'relationships',
							'Relationships',
							relations.map((r) => {
								const target = relationshipTypes[r.name];
								if (!r.multiple && lookupMethods[target])
									return locator(r.name, label(r.name), target);
								return {
									displayName: `${label(r.name)} ${r.multiple ? 'IDs' : 'ID'}`,
									name: r.name,
									type: 'string',
									default: '',
									description: r.multiple
										? 'Comma-separated IDs. Replaces the complete relationship list; an empty value removes all links.'
										: 'ID of the related resource. The API does not provide a searchable catalog for this relationship.',
								};
							}),
						),
						{ inputMode: ['fields'] },
					);
				if (op.relationships.some((r) => r.name === 'items')) {
					add(
						{
							displayName: action === 'update' ? 'Replace Line Items' : 'Add Line Items',
							name: 'sendItems',
							type: 'boolean',
							default: false,
							description:
								action === 'update'
									? 'Whether to replace the entire line item list. Omitted items are deleted. Send category and subcategory again to preserve them.'
									: 'Whether to include line items in the document',
						},
						{ inputMode: ['fields'] },
					);
					const fields: INodeProperties[] = [
						{ displayName: 'Concept', name: 'concept', type: 'string', default: '' },
						{
							displayName: 'Unit Price',
							name: 'unitary_amount',
							type: 'string',
							default: '0.00',
							description: 'Unit price as a decimal string',
						},
						{ displayName: 'Quantity', name: 'quantity', type: 'number', default: 1 },
						collection(
							'additionalFields',
							'Additional Fields',
							contract.itemFields
								.filter((f) => !['concept', 'unitary_amount', 'quantity'].includes(f.name))
								.map(fieldProperty)
								.concat(
									resource === 'paysheets'
										? []
										: [
												{
													displayName: 'Set Relationships to Null',
													name: 'clearRelationships',
													type: 'multiOptions',
													default: [],
													options: [
														{ name: 'Accounting Category', value: 'accounting_category' },
														{ name: 'Accounting Subcategory', value: 'accounting_subcategory' },
													],
													description:
														'Send a documented null relationship value for these line item links',
												},
												locator(
													'accounting_category',
													'Accounting Category',
													'accounting_categories',
												),
												locator(
													'accounting_subcategory',
													'Accounting Subcategory',
													'accounting_subcategories',
												),
											],
								),
						),
					];
					if (action === 'update')
						fields.unshift({
							displayName: 'Existing Item ID',
							name: 'id',
							type: 'string',
							default: '',
							description: 'Keep an existing item by its ID, or leave blank to add a new item',
						});
					add(
						{
							displayName: 'Line Items',
							name: 'lineItems',
							type: 'fixedCollection',
							default: {},
							typeOptions: { multipleValues: true },
							placeholder: 'Add Line Item',
							options: [{ displayName: 'Item', name: 'items', values: fields }],
						},
						{ inputMode: ['fields'], sendItems: [true] },
					);
				}
				const nullable = attributes.filter((f) => f.nullable);
				if (nullable.length)
					add(
						{
							displayName: 'Clear Fields',
							name: 'clearFields',
							type: 'multiOptions',
							default: [],
							options: nullable.map((f) => ({ name: label(f.name), value: f.name })),
							description:
								'Send null for these fields. Do not also set a value for the same field.',
						},
						{ inputMode: ['fields'] },
					);
				if (
					action === 'update' &&
					['invoices', 'simplified_invoices', 'additional_incomes', 'paysheets'].includes(resource)
				)
					add({
						displayName:
							'Quipu may ignore changes to finalized or locked documents. Line items and attachments replace their full lists; changing a category resets its subcategory unless both are supplied.',
						name: 'updateNotice',
						type: 'notice',
						default: '',
					});
			}
			if (!action.startsWith('download') && action !== 'delete')
				add({
					displayName: 'Output',
					name: 'output',
					type: 'options',
					default: 'simplified',
					options: [
						{ name: 'Simplified', value: 'simplified' },
						{ name: 'Raw JSON:API', value: 'raw' },
					],
					description:
						'Simplified returns one item per resource. Raw returns one complete response envelope per page.',
				});
		}
	}
	properties.push({
		displayName: 'Owner Slug Override',
		name: 'ownerSlug',
		type: 'string',
		default: '',
		description:
			'Leave blank to use the owner slug in your credentials. Enter a different account slug only if your credentials can access it.',
	});
	const custom = { show: { resource: ['custom'] } };
	properties.push(
		{
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			default: 'request',
			options: [{ name: 'Request', value: 'request', action: 'Make a custom API request' }],
			displayOptions: custom,
		},
		{
			displayName: 'Method',
			name: 'method',
			type: 'options',
			default: 'GET',
			options: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((value) => ({ name: value, value })),
			displayOptions: custom,
		},
		{
			displayName: 'Path',
			name: 'path',
			type: 'string',
			default: '',
			placeholder: '/your-owner-slug/contacts',
			required: true,
			description:
				'Relative Quipu path including the owner slug. Query parameters go in Query Parameters.',
			displayOptions: custom,
		},
		{
			displayName: 'Query Parameters',
			name: 'customQuery',
			type: 'fixedCollection',
			default: {},
			typeOptions: { multipleValues: true },
			options: [
				{
					displayName: 'Parameter',
					name: 'parameters',
					values: [
						{ displayName: 'Name', name: 'name', type: 'string', default: '' },
						{ displayName: 'Value', name: 'value', type: 'string', default: '' },
					],
				},
			],
			displayOptions: custom,
		},
		{
			displayName: 'JSON Body',
			name: 'jsonBody',
			type: 'json',
			default: '{}',
			displayOptions: { show: { resource: ['custom'], method: ['POST', 'PATCH', 'PUT'] } },
		},
		{
			displayName: 'Response Format',
			name: 'responseFormat',
			type: 'options',
			default: 'json',
			options: [
				{ name: 'JSON', value: 'json' },
				{ name: 'PDF File', value: 'binary' },
			],
			displayOptions: custom,
		},
		{
			displayName: 'Put Output File in Field',
			name: 'binaryProperty',
			type: 'string',
			default: 'data',
			displayOptions: { show: { resource: ['custom'], responseFormat: ['binary'] } },
		},
	);
	return properties;
}
