import { ApplicationError, type IDataObject } from 'n8n-workflow';
import { contract, relationshipTypes, type Field } from './types';

export function identifier(value: unknown): string {
	if (value && typeof value === 'object' && 'value' in value)
		return String(value.value ?? '').trim();
	return String(value ?? '').trim();
}
export function resolvePath(template: string, owner: string, id?: string): string {
	if (template.includes('{owner_slug}') && !/^[a-zA-Z0-9_-]+$/.test(owner))
		throw new ApplicationError(
			'Enter a valid owner slug (letters, numbers, hyphens or underscores)',
		);
	if (template.includes('{id}') && !/^\d+$/.test(id ?? ''))
		throw new ApplicationError('Enter a numeric resource ID');
	return template.replace('{owner_slug}', owner).replace('{id}', id ?? '');
}
function coerce(field: Field, value: unknown): IDataObject[string] {
	if (
		['country_code', 'target_country'].includes(field.name) &&
		value &&
		typeof value === 'object' &&
		'value' in value
	)
		value = identifier(value);
	if (value === null) {
		if (!field.nullable) throw new ApplicationError(`${field.name} cannot be null`);
		return null;
	}
	if (field.enum && !field.enum.includes(value as string))
		throw new ApplicationError(`Invalid value for ${field.name}`);
	if (field.type === 'number' || field.type === 'integer') {
		if (
			value === '' ||
			typeof value === 'boolean' ||
			!Number.isFinite(Number(value)) ||
			(field.type === 'integer' && !Number.isInteger(Number(value)))
		)
			throw new ApplicationError(`${field.name} must be a valid ${field.type}`);
		return Number(value);
	}
	if (field.type === 'boolean') {
		if (typeof value !== 'boolean') throw new ApplicationError(`${field.name} must be a boolean`);
		return value;
	}
	if (field.type === 'array') {
		const values = Array.isArray(value)
			? value
			: String(value)
					.split(',')
					.map((v) => v.trim())
					.filter(Boolean);
		return values.map((v) =>
			coerce(
				{ ...field, type: field.itemType ?? 'string', format: field.itemFormat, enum: undefined },
				v,
			),
		);
	}
	if (typeof value !== 'string' && typeof value !== 'number')
		throw new ApplicationError(`${field.name} must be text`);
	const str = String(value);
	if (
		field.format === 'date' &&
		(!/^\d{4}-\d{2}-\d{2}$/.test(str) ||
			!Number.isFinite(Date.parse(str + 'T00:00:00Z')) ||
			new Date(str + 'T00:00:00Z').toISOString().slice(0, 10) !== str)
	)
		throw new ApplicationError(`${field.name} must use YYYY-MM-DD`);
	return str;
}
function attributes(fields: Field[], values: IDataObject): IDataObject {
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(values)) {
		const field = fields.find((f) => f.name === key);
		if (!field) throw new ApplicationError(`${key} is not writable for this operation`);
		if (value !== undefined) result[key] = coerce(field, value);
	}
	return result;
}
function linkage(name: string, value: unknown): IDataObject {
	const id = identifier(value);
	if (!/^\d+$/.test(id)) throw new ApplicationError(`Enter a numeric ID for ${name}`);
	const type = relationshipTypes[name];
	if (!type) throw new ApplicationError(`Unsupported relationship: ${name}`);
	return { id, type };
}
export function buildBody(
	resource: string,
	operation: string,
	values: IDataObject,
	links: IDataObject = {},
	lineItems?: IDataObject[],
	clearFields: string[] = [],
	clearRelationships: string[] = [],
): IDataObject {
	const op = contract.resources[resource]?.operations[operation];
	if (!op) throw new ApplicationError('Unsupported resource operation');
	const allowed = op.attributes.filter(
		(f) => !(operation === 'update' && (f.name === 'kind' || f.name === 'filing_number')),
	);
	const attrs = attributes(allowed, values);
	for (const name of clearFields) {
		if (!allowed.find((f) => f.name === name)?.nullable)
			throw new ApplicationError(`${name} is not nullable and cannot be cleared`);
		if (name in values) throw new ApplicationError(`Choose either a value or Clear for ${name}`);
		attrs[name] = null;
	}
	const relationships: IDataObject = {};
	for (const [name, value] of Object.entries(links)) {
		const field = op.relationships.find((r) => r.name === name);
		if (!field || name === 'items')
			throw new ApplicationError(`${name} is not a writable relationship`);
		if (value === null) {
			if (!field.nullable) throw new ApplicationError(`${name} is not nullable`);
			relationships[name] = null;
		} else if (field.multiple) {
			const ids = Array.isArray(value)
				? value
				: String(value)
						.split(',')
						.map((v) => v.trim())
						.filter(Boolean);
			relationships[name] = { data: ids.map((v) => linkage(name, v)) };
		} else relationships[name] = { data: linkage(name, value) };
	}
	for (const name of clearRelationships) {
		if (!op.relationships.find((r) => r.name === name)?.nullable)
			throw new ApplicationError(`${name} is not nullable`);
		if (name in links) throw new ApplicationError(`Choose either a value or null for ${name}`);
		relationships[name] = null;
	}
	if (lineItems !== undefined) {
		if (!op.relationships.some((r) => r.name === 'items'))
			throw new ApplicationError('This resource does not support line items');
		relationships.items = {
			data: lineItems.map((row) => {
				const {
					id,
					accounting_category,
					accounting_subcategory,
					clearRelationships: clearItemLinks = [],
					...item
				} = row;
				const data: IDataObject = {
					type: 'book_entry_items',
					attributes: attributes(contract.itemFields, item),
				};
				if (id !== undefined && id !== '') data.id = linkage('items', id).id;
				if (
					resource === 'paysheets' &&
					(accounting_category !== undefined ||
						accounting_subcategory !== undefined ||
						(clearItemLinks as string[]).length)
				)
					throw new ApplicationError('Paysheet line items do not support category relationships');
				if (
					accounting_category !== undefined ||
					accounting_subcategory !== undefined ||
					(clearItemLinks as string[]).length
				) {
					data.relationships = {};
					for (const [name, value] of Object.entries({
						accounting_category,
						accounting_subcategory,
					}))
						if (value !== undefined)
							(data.relationships as IDataObject)[name] =
								value === null ? null : { data: linkage(name, value) };
					for (const name of clearItemLinks as string[]) {
						if (!['accounting_category', 'accounting_subcategory'].includes(name))
							throw new ApplicationError('Unsupported line item relationship');
						if (name in (data.relationships as IDataObject))
							throw new ApplicationError(`Choose either a value or null for ${name}`);
						(data.relationships as IDataObject)[name] = null;
					}
				}
				return data;
			}),
		};
	}
	if (operation === 'create') {
		for (const field of op.attributes)
			if (
				field.required &&
				(attrs[field.name] === undefined || attrs[field.name] === '' || attrs[field.name] === null)
			)
				throw new ApplicationError(`${field.name} is required`);
		if (
			attrs.kind === 'expenses' &&
			['invoices', 'simplified_invoices'].includes(resource) &&
			!attrs.issue_date
		)
			throw new ApplicationError('issue_date is required for expenses');
		if (
			resource === 'simplified_invoices' &&
			attrs.kind === 'income' &&
			!relationships.contact &&
			!attrs.recipient_name
		)
			throw new ApplicationError(
				'Provide a contact or recipient_name for an income simplified invoice',
			);
		if (resource === 'paysheets' && !relationships.contact)
			throw new ApplicationError('A contact (employee with a tax ID) is required for a paysheet');
	}
	if (
		attrs.operation_date &&
		attrs.issue_date &&
		String(attrs.operation_date) > String(attrs.issue_date)
	)
		throw new ApplicationError('operation_date must not be later than issue_date');
	const data: IDataObject = { type: resource, attributes: attrs };
	if (Object.keys(relationships).length) data.relationships = relationships;
	return { data };
}
export function buildQuery(values: IDataObject): IDataObject {
	const query: IDataObject = {};
	for (const [name, value] of Object.entries(values)) {
		if (name === 'with_detailed_amounts' && value === false) continue;
		if (value !== undefined && value !== '')
			query[name] = Array.isArray(value)
				? value.join(',')
				: value && typeof value === 'object' && 'value' in value
					? identifier(value)
					: value;
	}
	for (const [a, b] of [
		['filter[operation_date][from]', 'filter[operation_date][to]'],
		['filter[field_query][field]', 'filter[field_query][term]'],
	])
		if (a in query !== b in query)
			throw new ApplicationError(`${a} and ${b} must be sent together`);
	return query;
}
