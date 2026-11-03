import type { ICredentialType, INodeProperties, ICredentialTestRequest } from 'n8n-workflow';

export class QuipuOAuth2Api implements ICredentialType {
	name = 'quipuOAuth2Api';
	extends = ['oAuth2Api'];
	displayName = 'Quipu OAuth2 API';
	documentationUrl = 'https://quipuapp.github.io/api-v1-docs/';
	icon = 'file:quipu.svg' as const;
	properties: INodeProperties[] = [
		{ displayName: 'Grant Type', name: 'grantType', type: 'hidden', default: 'clientCredentials' },
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://getquipu.com/oauth/token',
		},
		{ displayName: 'Scope', name: 'scope', type: 'hidden', default: 'ecommerce' },
		{ displayName: 'Authentication', name: 'authentication', type: 'hidden', default: 'header' },
		{
			displayName: 'Owner Slug',
			name: 'ownerSlug',
			type: 'string',
			default: '',
			required: true,
			description:
				'Account identifier from your Quipu account URL. Enter only the slug, not the full URL.',
		},
	];
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://getquipu.com',
			url: '={{ "/" + encodeURIComponent($credentials.ownerSlug) + "/contacts" }}',
			method: 'GET',
			headers: { Accept: 'application/vnd.quipu.v1+json' },
			qs: { 'page[size]': 1 },
		},
	};
}
