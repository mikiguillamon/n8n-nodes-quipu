import type { IDataObject } from 'n8n-workflow';
import type { ApiPage, ApiResource } from './types';

export function simplifyResponse(page: ApiPage): IDataObject[] {
	const data = Array.isArray(page.data) ? page.data : page.data ? [page.data] : [];
	const included = page.included ?? [];
	const flatten = (r: ApiResource): IDataObject => ({
		...r.attributes,
		id: r.id,
		type: r.type,
		...(r.relationships ? { relationships: r.relationships } : {}),
	});
	return data.map((resource) => {
		const related: IDataObject = {};
		for (const [name, link] of Object.entries(resource.relationships ?? {})) {
			const find = (ref: IDataObject): IDataObject => {
				const target = included.find((r) => r.id === ref.id && r.type === ref.type);
				return target ? flatten(target) : ref;
			};
			related[name] = Array.isArray(link.data)
				? link.data.map(find)
				: link.data
					? find(link.data)
					: null;
		}
		return {
			...flatten(resource),
			...(Object.keys(related).length ? { related } : {}),
			...(included.length ? { included: included.map(flatten) } : {}),
		};
	});
}
