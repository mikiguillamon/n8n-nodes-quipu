import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse } = require('yaml');
const spec = parse(fs.readFileSync('docs/api/quipu-public-2026-11-03.openapi.yaml', 'utf8'));
function resolve(schema = {}) {
	if (schema.$ref)
		return resolve(
			schema.$ref
				.split('/')
				.slice(1)
				.reduce((v, k) => v[k], spec),
		);
	if (!schema.allOf) return schema;
	return schema.allOf.map(resolve).reduce(
		(a, b) => ({
			...a,
			...b,
			properties: { ...a.properties, ...b.properties },
			required: [...(a.required || []), ...(b.required || [])],
		}),
		{},
	);
}
function fields(schema = {}) {
	schema = resolve(schema);
	return Object.entries(schema.properties || {}).map(([name, value]) => {
		const s = resolve(value),
			types = Array.isArray(s.type) ? s.type : [s.type];
		return {
			name,
			type: types.find((t) => t !== 'null') || 'string',
			nullable: s.nullable === true || types.includes('null'),
			...(s.enum ? { enum: s.enum } : {}),
			...(s.format ? { format: s.format } : {}),
			...(s.description ? { description: s.description.trim() } : {}),
			required: (schema.required || []).includes(name),
			...(s.items
				? {
						itemType: resolve(s.items).type,
						...(resolve(s.items).format ? { itemFormat: resolve(s.items).format } : {}),
					}
				: {}),
		};
	});
}
// Merge allOf properties recursively: create schemas add required fields inside attributes.
function mergeSchema(schema = {}) {
	if (schema.$ref)
		return mergeSchema(
			schema.$ref
				.split('/')
				.slice(1)
				.reduce((v, k) => v[k], spec),
		);
	const result = {
		...schema,
		properties: { ...schema.properties },
		required: [...(schema.required || [])],
	};
	for (const part of schema.allOf || []) {
		const p = mergeSchema(part);
		result.required.push(...(p.required || []));
		for (const [k, v] of Object.entries(p.properties || {}))
			result.properties[k] = result.properties[k] ? { allOf: [result.properties[k], v] } : v;
	}
	delete result.allOf;
	return result;
}
const resources = {};
const operations = [];
for (const [path, item] of Object.entries(spec.paths))
	for (const [method, op] of Object.entries(item)) {
		if (!op.operationId) continue;
		operations.push(op.operationId);
		if (path === '/oauth/token') continue;
		const resource = path.startsWith('/users') ? 'users' : path.split('/')[2];
		const action = path.endsWith('/ephemeral_open_download')
			? 'downloadEphemeral'
			: path.endsWith('/download')
				? 'download'
				: method === 'post'
					? resource === 'attachments'
						? 'upload'
						: 'create'
					: method === 'patch'
						? 'update'
						: method === 'delete'
							? 'delete'
							: path.endsWith('/{id}')
								? 'get'
								: 'getAll';
		const body =
			op.requestBody?.content?.['application/vnd.quipu.v1+json']?.schema?.properties?.data;
		const s = mergeSchema(body),
			attrs = mergeSchema(s.properties?.attributes),
			rels = mergeSchema(s.properties?.relationships);
		const parameters = (op.parameters || []).map(resolve).filter((p) => p.in === 'query');
		const descriptor = {
			operationId: op.operationId,
			method: method.toUpperCase(),
			path,
			description: op.description || '',
			attributes: fields(attrs),
			relationships: Object.entries(rels.properties || {}).map(([name, r]) => ({
				name,
				nullable: resolve(r).nullable === true,
				multiple: resolve(r).properties?.data?.type === 'array',
			})),
			parameters: parameters.map((p) => ({
				...fields({ properties: { [p.name]: p.schema }, required: p.required ? [p.name] : [] })[0],
				description: p.description || '',
			})),
		};
		(resources[resource] ??= { name: resource, operations: {} }).operations[action] = descriptor;
	}
const result = {
	source: 'https://quipuapp.github.io/api-v1-docs/openapi.yaml',
	retrieved: '2026-11-03',
	operationIds: operations,
	resources,
	itemFields: fields(spec.components.schemas.ItemWritableAttributes),
};
const output = JSON.stringify(result, null, 2) + '\n';
const dest = 'nodes/Quipu/contract.json';
if (process.argv.includes('--check')) {
	if (fs.readFileSync(dest, 'utf8') !== output)
		throw Error('Contract differs from the public API snapshot');
} else fs.writeFileSync(dest, output);
console.log(
	`${operations.length} operations; ${Object.keys(resources).length} business resources; contract ${process.argv.includes('--check') ? 'verified' : 'generated'}`,
);
