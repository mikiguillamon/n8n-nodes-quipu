import type { INodeProperties } from 'n8n-workflow';
import type { Field } from '../helpers/types';

export const resourceLabels: Record<string, string> = {
	users: 'User',
	contacts: 'Contact',
	book_entries: 'Book Entry',
	invoices: 'Invoice',
	simplified_invoices: 'Simplified Invoice',
	additional_incomes: 'Additional Income',
	paysheets: 'Paysheet',
	numbering_series: 'Numbering Series',
	accounting_categories: 'Accounting Category',
	accounting_subcategories: 'Accounting Subcategory',
	attachments: 'Attachment',
};
export const lookupMethods: Record<string, string> = {
	contacts: 'searchContacts',
	book_entries: 'searchBookEntries',
	invoices: 'searchInvoices',
	simplified_invoices: 'searchSimplifiedInvoices',
	additional_incomes: 'searchAdditionalIncomes',
	paysheets: 'searchPaysheets',
	numbering_series: 'searchNumberingSeries',
	accounting_categories: 'searchCategories',
	accounting_subcategories: 'searchSubcategories',
};
const names: Record<string, string> = {
	numeration: 'Numbering Series',
	tax_id: 'Tax ID',
	unitary_amount: 'Unit Price',
	vat_percent: 'VAT (%)',
	retention_percent: 'Withholding (%)',
	discount_percent: 'Discount (%)',
	paid_at: 'Payment Date',
	issue_date: 'Issue Date',
	operation_date: 'Operation Date',
	country_code: 'Country',
	equivalence_subcharge: 'Equivalence Surcharge',
	a3_nom_id: 'A3 Payroll ID',
	bank_account_swift_bic: 'SWIFT / BIC',
	last_sent_at: 'Last Sent At (Unix Seconds)',
	net_pay: 'Net Pay',
	employee_ss_amount: 'Employee Social Security',
	employee_retention: 'Employee Withholding',
	company_ss_amount: 'Company Social Security',
	recipient_name: 'Recipient Name',
	with_detailed_amounts: 'Include Detailed Amounts',
	'filter[q]': 'Search',
	'page[number]': 'Start Page',
	'page[size]': 'Page Size',
};
export function label(name: string): string {
	return (
		names[name] ??
		name
			.replace(/^filter\[/, '')
			.replace(/\]/g, '')
			.replace(/\[/g, '_')
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase())
			.replace(/\bId\b/g, 'ID')
			.replace(/\bVat\b/g, 'VAT')
			.replace(/\bPdf\b/g, 'PDF')
	);
}
export function locator(
	name: string,
	displayName: string,
	resource: string,
	required = false,
): INodeProperties {
	return {
		displayName,
		name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: lookupMethods[resource], searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 123',
				validation: [
					{ type: 'regex', properties: { regex: '^[0-9]+$', errorMessage: 'Enter a numeric ID' } },
				],
			},
		],
		description: 'Choose from the list, enter an ID, or use an expression',
	};
}
export function fieldProperty(field: Field): INodeProperties {
	const prop: INodeProperties = {
		displayName: label(field.name),
		name: field.name,
		type: 'string',
		default: '',
		description: field.description?.replace(/`/g, '').replace(/\n/g, ' ').slice(0, 900),
	};
	if (field.enum) {
		prop.type = 'options';
		prop.options = field.enum
			.filter((v) => v !== null)
			.map((value) => ({
				name: label(String(value)),
				value: typeof value === 'boolean' ? String(value) : (value as string | number),
			}));
		prop.default = (field.enum.find((v) => v !== null) as string | number) ?? '';
	} else if (field.type === 'boolean') {
		prop.type = 'boolean';
		prop.default = false;
		prop.description = `Whether to ${label(field.name).toLowerCase()}. ${prop.description ?? ''}`;
	} else if (field.type === 'integer' || field.type === 'number') {
		prop.type = 'number';
		prop.default = 0;
		prop.typeOptions = field.type === 'integer' ? { numberPrecision: 0 } : {};
	} else if (field.type === 'array') {
		prop.placeholder = field.itemType === 'integer' ? 'e.g. 30, 60' : 'e.g. 2026-11-03, 2026-12-03';
		prop.description = 'Comma-separated values. ' + (prop.description ?? '');
	}
	if (field.format === 'date') {
		prop.placeholder = 'YYYY-MM-DD';
		prop.description = 'Date in YYYY-MM-DD format. ' + (prop.description ?? '');
	}
	if (['country_code', 'target_country'].includes(field.name))
		return {
			...prop,
			type: 'resourceLocator',
			default: { mode: 'list', value: '' },
			modes: [
				{
					displayName: 'From List',
					name: 'list',
					type: 'list',
					typeOptions: { searchListMethod: 'searchCountries', searchable: true },
				},
				{
					displayName: 'By Code',
					name: 'id',
					type: 'string',
					placeholder: 'e.g. ES',
					validation: [
						{
							type: 'regex',
							properties: {
								regex: '^[A-Z]{2}$',
								errorMessage: 'Enter a two-letter uppercase country code',
							},
						},
					],
				},
			],
		};
	if (['notes', 'description'].includes(field.name)) prop.typeOptions = { rows: 3 };
	if (field.name === 'payment_method' || field.name.endsWith('_payment_method')) {
		prop.placeholder = 'e.g. bank_transfer';
		prop.description =
			'Payment method code. Quipu does not publish a complete list of accepted codes.';
	}
	if (['vat_percent', 'retention_percent', 'discount_percent'].includes(field.name)) {
		prop.description =
			'Percentage accepted by Quipu. No account-specific tax catalog is available through the public API.';
	}
	if (field.name === 'unitary_amount') {
		prop.placeholder = 'e.g. 125.50';
		prop.description = 'Unit price as a decimal string, before taxes and discounts';
	}
	if (field.name === 'last_sent_at')
		prop.description =
			'Unix timestamp in seconds. Records when a document was sent; this does not send an email.';
	return prop;
}
