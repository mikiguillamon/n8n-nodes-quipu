import {
	NodeConnectionTypes,
	NodeOperationError,
	UserError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { contract, type ApiPage } from './helpers/types';
import { buildBody, buildQuery, identifier, resolvePath } from './helpers/payload';
import { simplifyResponse } from './helpers/output';
import { multipartFile } from './helpers/multipart';
import { createProperties } from './descriptions/properties';
import { listSearch } from './methods/lookups';
import { request, type RequestOptions } from './transport/request';
import { getPages } from './transport/pagination';

function parseBody(value: unknown): IDataObject {
	const parsed = typeof value === 'string' ? JSON.parse(value) : value;
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
		throw new UserError('JSON Body must be an object');
	return parsed as IDataObject;
}
export class Quipu implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Quipu',
		name: 'quipu',
		icon: { light: 'file:quipu.svg', dark: 'file:quipu.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Manage Quipu invoices, contacts, accounting and attachments',
		defaults: { name: 'Quipu' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'quipuOAuth2Api', required: true }],
		properties: createProperties(),
	};
	methods = { listSearch };
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const output: INodeExecutionData[] = [];
		const items = this.getInputData();
		for (let index = 0; index < items.length; index++) {
			const param = (name: string, fallback: unknown = '') =>
				this.getNodeParameter(name, index, fallback as string);
			try {
				const resource = String(param('resource')),
					operation = String(param('operation'));
				const creds = await this.getCredentials('quipuOAuth2Api');
				const owner = String(param('ownerSlug') || creds.ownerSlug);
				const id = identifier(param('resourceId'));
				const options: RequestOptions = { path: '' };
				let pages: ApiPage[] | undefined;
				if (resource === 'custom') {
					options.path = String(param('path'));
					options.method = String(param('method', 'GET')) as IHttpRequestMethods;
					if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(options.method))
						throw new UserError('Unsupported HTTP method');
					const entries =
						(param('customQuery', {}) as { parameters?: Array<{ name: string; value: string }> })
							.parameters ?? [];
					options.query = Object.fromEntries(entries.map((e) => [e.name, e.value]));
					if (['POST', 'PATCH', 'PUT'].includes(options.method))
						options.body = parseBody(param('jsonBody', '{}'));
					options.binary = param('responseFormat', 'json') === 'binary';
				} else {
					const op = contract.resources[resource]?.operations[operation];
					if (!op) throw new UserError('Unsupported resource or operation');
					options.path = resolvePath(op.path, owner, id);
					options.method = op.method as IHttpRequestMethods;
					options.query = buildQuery(param('query', {}) as IDataObject);
					if (operation === 'getAll')
						pages = await getPages(
							this,
							options.path,
							options.query,
							Boolean(param('returnAll', false)),
							Number(param('limit', 50)),
						);
					if (operation === 'create' || operation === 'update') {
						if (param('inputMode', 'fields') === 'json') {
							const body = parseBody(param('jsonBody'));
							if (
								!body.data ||
								typeof body.data !== 'object' ||
								Array.isArray(body.data) ||
								(body.data as IDataObject).type !== resource
							)
								throw new UserError(`JSON Body must contain data.type = "${resource}"`);
							options.body = body;
						} else {
							const fields = { ...(param('fields', {}) as IDataObject) };
							if (operation === 'create')
								for (const f of op.attributes.filter((f) => f.required))
									fields[f.name] = param(f.name) as IDataObject[string];
							const rows = (param('lineItems', {}) as { items?: IDataObject[] }).items ?? [];
							const lineItems =
								Boolean(param('sendItems', false)) &&
								op.relationships.some((r) => r.name === 'items')
									? rows.map((row) => {
											const { additionalFields, ...rest } = row;
											return { ...rest, ...(additionalFields as IDataObject) };
										})
									: undefined;
							options.body = buildBody(
								resource,
								operation,
								fields,
								param('relationships', {}) as IDataObject,
								lineItems,
								param('clearFields', []) as string[],
								param('clearRelationships', []) as string[],
							);
						}
					}
					if (operation === 'upload') {
						const property = String(param('binaryProperty', 'data'));
						const binary = this.helpers.assertBinaryData(index, property);
						const data = await this.helpers.getBinaryDataBuffer(index, property);
						const bookId = identifier(param('bookEntryId'));
						if (!/^\d+$/.test(bookId)) throw new UserError('Enter a numeric Book Entry ID');
						const form = multipartFile(
							data,
							binary.fileName ?? 'attachment',
							binary.mimeType ?? 'application/octet-stream',
							bookId,
						);
						options.body = form.body;
						options.multipart = true;
						options.contentType = form.contentType;
					}
					options.binary = operation === 'download' || operation === 'downloadEphemeral';
					if (operation === 'downloadEphemeral') {
						const token = String(param('ephemeralToken'));
						if (!token) throw new UserError('Enter the ephemeral download token');
						options.anonymous = true;
						options.query = { token };
					}
				}
				if (options.binary) {
					const response = await request(this, options);
					if (!Buffer.isBuffer(response)) throw new UserError('Quipu did not return a binary PDF');
					const property = String(param('binaryProperty', 'data'));
					if (!property) throw new UserError('Enter an output binary field name');
					output.push({
						json: { id, resource },
						binary: {
							[property]: await this.helpers.prepareBinaryData(
								response,
								`${resource}-${id || 'download'}.pdf`,
								'application/pdf',
							),
						},
						pairedItem: { item: index },
					});
				} else {
					if (!pages) {
						const response = await request(this, options);
						pages = [(response ?? {}) as ApiPage];
					}
					if (operation === 'delete') {
						output.push({ json: { id, resource, deleted: true }, pairedItem: { item: index } });
						continue;
					}
					for (const page of pages) {
						const results =
							resource === 'custom' || param('output', 'simplified') === 'raw'
								? [page]
								: simplifyResponse(page);
						for (const json of results) output.push({ json, pairedItem: { item: index } });
					}
				}
			} catch (error) {
				// Transport errors already carry a sanitized message. Do not attach request objects.
				const message = error instanceof Error ? error.message : 'Quipu operation failed';
				if (this.continueOnFail())
					output.push({ json: { error: message }, pairedItem: { item: index } });
				else throw new NodeOperationError(this.getNode(), message, { itemIndex: index });
			}
		}
		return [output];
	}
}
