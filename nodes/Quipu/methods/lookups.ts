import {
	ApplicationError,
	type ILoadOptionsFunctions,
	type INodeListSearchResult,
	type IDataObject,
} from 'n8n-workflow';
import { request } from '../transport/request';
import { resolvePath } from '../helpers/payload';
import type { ApiPage } from '../helpers/types';

function search(resource: string) {
	return async function (
		this: ILoadOptionsFunctions,
		filter = '',
		paginationToken?: string,
	): Promise<INodeListSearchResult> {
		const credentials = await this.getCredentials('quipuOAuth2Api');
		const owner = String(this.getNodeParameter('ownerSlug', '') || credentials.ownerSlug);
		const page = Number(paginationToken ?? 1);
		if (!Number.isInteger(page) || page < 1) throw new ApplicationError('Invalid lookup page');
		const qs: IDataObject = { 'page[number]': page, 'page[size]': 100 };
		const serverSearch = ['contacts', 'invoices', 'book_entries'].includes(resource);
		if (serverSearch && filter) qs['filter[q]'] = filter;
		if (resource === 'numbering_series') {
			const selected = String(this.getNodeParameter('resource', ''));
			if (['invoices', 'simplified_invoices', 'additional_incomes'].includes(selected))
				qs['filter[applicable_to]'] = selected === 'simplified_invoices' ? 'tickets' : selected;
		}
		const response = (await request(this, {
			path: resolvePath(`/{owner_slug}/${resource}`, owner),
			query: qs,
		})) as ApiPage;
		if (!Array.isArray(response.data))
			throw new ApplicationError('Quipu returned an invalid lookup response');
		const results = response.data
			.map((r) => {
				const a = r.attributes ?? {};
				const title = String(
					a.name ??
						a.complete_number ??
						a.number ??
						a.prefix ??
						a.recipient_name ??
						a.counterpart_name ??
						r.id,
				);
				const detail = [a.tax_id, a.issue_date, a.total_amount]
					.filter((v) => v !== undefined && v !== null && v !== '')
					.join(' · ');
				return { name: `${title}${detail ? ' — ' + detail : ''} (#${r.id})`, value: r.id };
			})
			.filter(
				(r) => serverSearch || !filter || r.name.toLowerCase().includes(filter.toLowerCase()),
			);
		const pagination = response.meta?.pagination_info;
		if (!pagination || Number(pagination.current_page) !== page)
			throw new ApplicationError('Quipu omitted or returned invalid lookup pagination metadata');
		return {
			results,
			...(Number(pagination.total_pages) > page ? { paginationToken: String(page + 1) } : {}),
		};
	};
}
const countryCodes =
	'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
		' ',
	);
export const listSearch = {
	searchContacts: search('contacts'),
	searchBookEntries: search('book_entries'),
	searchInvoices: search('invoices'),
	searchSimplifiedInvoices: search('simplified_invoices'),
	searchAdditionalIncomes: search('additional_incomes'),
	searchPaysheets: search('paysheets'),
	searchNumberingSeries: search('numbering_series'),
	searchCategories: search('accounting_categories'),
	searchSubcategories: search('accounting_subcategories'),
	async searchCountries(this: ILoadOptionsFunctions, filter = ''): Promise<INodeListSearchResult> {
		const names = new Intl.DisplayNames(['en'], { type: 'region' });
		return {
			results: countryCodes
				.map((code) => ({ name: `${names.of(code)} (${code})`, value: code }))
				.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
				.sort((a, b) => a.name.localeCompare(b.name)),
		};
	},
};
