import contractData from '../contract.json';
import type { IDataObject } from 'n8n-workflow';

export interface Field {
	name: string;
	type: string;
	nullable: boolean;
	required: boolean;
	enum?: Array<string | number | boolean | null>;
	format?: string;
	description?: string;
	itemType?: string;
	itemFormat?: string;
}
export interface Operation {
	operationId: string;
	method: string;
	path: string;
	description: string;
	attributes: Field[];
	relationships: Array<{ name: string; multiple: boolean; nullable?: boolean }>;
	parameters: Field[];
}
export interface Resource {
	name: string;
	operations: Record<string, Operation>;
}
export interface ApiResource extends IDataObject {
	id: string;
	type: string;
	attributes?: IDataObject;
	relationships?: Record<string, { data: IDataObject | IDataObject[] | null }>;
}
export interface ApiPage extends IDataObject {
	data?: ApiResource | ApiResource[];
	included?: ApiResource[];
	meta?: { pagination_info?: { current_page: number; total_pages: number; total_results: number } };
}
export const contract = contractData as unknown as {
	operationIds: string[];
	resources: Record<string, Resource>;
	itemFields: Field[];
};
export const relationshipTypes: Record<string, string> = {
	contact: 'contacts',
	numeration: 'numbering_series',
	accounting_category: 'accounting_categories',
	accounting_subcategory: 'accounting_subcategories',
	expense_category: 'accounting_categories',
	expense_subcategory: 'accounting_subcategories',
	income_category: 'accounting_categories',
	income_subcategory: 'accounting_subcategories',
	attachments: 'attachments',
	project: 'projects',
	book_entry_draft: 'book_entry_drafts',
	items: 'book_entry_items',
};
