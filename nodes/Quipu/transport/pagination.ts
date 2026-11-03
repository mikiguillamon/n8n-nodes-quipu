import { ApplicationError, type IDataObject } from 'n8n-workflow';
import { request, type Context, type RequestOptions } from './request';
import type { ApiPage } from '../helpers/types';

export async function getPages(
	context: Context,
	path: string,
	query: IDataObject,
	returnAll: boolean,
	limit: number,
	send: (context: Context, options: RequestOptions) => Promise<unknown> = request,
): Promise<ApiPage[]> {
	if (!returnAll && (!Number.isInteger(limit) || limit < 1))
		throw new ApplicationError('Limit must be a positive integer');
	const start = Number(query['page[number]'] ?? 1),
		size = Number(query['page[size]'] ?? 100);
	if (!Number.isInteger(start) || start < 1 || !Number.isInteger(size) || size < 1 || size > 100)
		throw new ApplicationError('Use a positive page number and page size from 1 to 100');
	const result: ApiPage[] = [];
	let count = 0;
	let previous = '';
	for (let page = start; page < start + 100000; page++) {
		const response = (await send(context, {
			path,
			query: {
				...query,
				'page[number]': page,
				'page[size]': size,
			},
		})) as ApiPage;
		if (!Array.isArray(response.data))
			throw new ApplicationError('Quipu returned an invalid paginated response');
		const meta = response.meta?.pagination_info;
		const fingerprint = response.data.map((r) => `${r.type}:${r.id}`).join(',');
		if ((meta && Number(meta.current_page) !== page) || (fingerprint && fingerprint === previous))
			throw new ApplicationError(
				'Quipu pagination did not advance; stopped to avoid duplicate results',
			);
		previous = fingerprint;
		const data = returnAll ? response.data : response.data.slice(0, limit - count);
		result.push({ ...response, data });
		count += data.length;
		if (!returnAll && count >= limit) return result;
		if (meta && page >= Number(meta.total_pages)) return result;
		if (response.data.length === 0) {
			if (meta && page < Number(meta.total_pages))
				throw new ApplicationError('Quipu returned an empty page before the last page');
			return result;
		}
		if (!meta)
			throw new ApplicationError(
				'Quipu omitted pagination metadata; cannot safely determine whether more results exist',
			);
	}
	throw new ApplicationError('Quipu pagination exceeded 100000 pages; narrow the filters');
}
