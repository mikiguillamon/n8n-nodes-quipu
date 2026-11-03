import {
	NodeOperationError,
	sleep,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type IDataObject,
	type IHttpRequestMethods,
	type IHttpRequestOptions,
} from 'n8n-workflow';

export type Context = IExecuteFunctions | ILoadOptionsFunctions;
export interface RequestOptions {
	path: string;
	method?: IHttpRequestMethods;
	query?: IDataObject;
	body?: IHttpRequestOptions['body'];
	binary?: boolean;
	anonymous?: boolean;
	multipart?: boolean;
	contentType?: string;
}
export function safePath(path: string): string {
	if (!/^\/[A-Za-z0-9_/-]+$/.test(path) || path.includes('//') || path.startsWith('/oauth/'))
		throw new Error(
			'Use a relative Quipu resource path without a host, query string or encoded characters',
		);
	return path;
}
function statusOf(error: unknown): number {
	const e = error as {
		statusCode?: number;
		httpCode?: number;
		response?: { status?: number; statusCode?: number };
	};
	return Number(
		e?.statusCode ?? e?.httpCode ?? e?.response?.status ?? e?.response?.statusCode ?? 0,
	);
}
export function createTransport(clock = { now: () => Date.now(), sleep }) {
	const slots = new Map<string, number>();
	async function pace(key: string) {
		const now = clock.now();
		const next = Math.max(now, slots.get(key) ?? 0);
		slots.set(key, next + 1100);
		if (slots.size > 1000) for (const [k, time] of slots) if (time < now) slots.delete(k);
		if (next > now) await clock.sleep(next - now);
	}
	async function request(context: Context, options: RequestOptions): Promise<unknown> {
		const path = safePath(options.path);
		const credentials = options.anonymous ? {} : await context.getCredentials('quipuOAuth2Api');
		const key = String(
			context.getNode().credentials?.quipuOAuth2Api?.id ?? credentials.clientId ?? 'anonymous',
		);
		const oauth = credentials.oauthTokenData as IDataObject | undefined;
		const secrets = [
			credentials.clientSecret,
			credentials.clientId,
			oauth?.access_token,
			oauth?.refresh_token,
			options.query?.token,
		].filter((v): v is string => typeof v === 'string' && v.length > 0);
		const method = options.method ?? 'GET';
		for (let attempt = 0; attempt < 4; attempt++) {
			await pace(key);
			try {
				const requestOptions: IHttpRequestOptions = {
					url: `https://getquipu.com${path}`,
					method,
					qs: options.query,
					body: options.body,
					headers: {
						...(options.contentType ? { 'Content-Type': options.contentType } : {}),
						Accept: options.binary ? 'application/pdf' : 'application/vnd.quipu.v1+json',
						...(!options.multipart && options.body !== undefined
							? { 'Content-Type': 'application/vnd.quipu.v1+json' }
							: {}),
					},
					json: !options.binary && !options.multipart,
					encoding: options.binary ? 'arraybuffer' : 'json',
					timeout: 60000,
					disableFollowRedirect: true,
				};
				return options.anonymous
					? await context.helpers.httpRequest(requestOptions)
					: await context.helpers.httpRequestWithAuthentication.call(
							context,
							'quipuOAuth2Api',
							requestOptions,
						);
			} catch (error) {
				const status = statusOf(error);
				const e = error as {
					response?: { headers?: Record<string, string>; body?: unknown; data?: unknown };
					error?: unknown;
				};
				const retryHeader = e.response?.headers?.['retry-after'];
				const retryMs = retryHeader
					? Number.isFinite(Number(retryHeader))
						? Number(retryHeader) * 1000
						: Date.parse(retryHeader) - clock.now()
					: 5000;
				const retryable = status === 429 || (method === 'GET' && [502, 503, 504].includes(status));
				if (
					retryable &&
					attempt < 3 &&
					Number.isFinite(retryMs) &&
					retryMs >= 0 &&
					retryMs <= 60000
				) {
					await clock.sleep(Math.max(1100, retryMs));
					continue;
				}
				let body = e.response?.body ?? e.response?.data ?? e.error;
				if (typeof body === 'string') {
					try {
						body = JSON.parse(body);
					} catch {
						body = undefined;
					}
				}
				const errors = (
					body as
						| { errors?: Array<{ detail?: string; title?: string; source?: { pointer?: string } }> }
						| undefined
				)?.errors;
				let detail = Array.isArray(errors)
					? errors
							.map((v) => [v.source?.pointer, v.detail ?? v.title].filter(Boolean).join(': '))
							.join('; ')
					: '';
				for (const secret of secrets) detail = detail.split(secret).join('[redacted]');
				detail = detail.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 1000);
				const advice: Record<number, string> = {
					400: 'Check the selected fields and document numbering.',
					401: 'Reconnect your Quipu credentials.',
					403: 'Check account access and whether the document is locked.',
					404: 'Check the owner slug, resource ID or ephemeral token.',
					422: 'Check the field values and Quipu document rules.',
					429: 'Quipu rate limit reached. Reduce concurrent workflows and try again.',
				};
				throw new NodeOperationError(
					context.getNode(),
					`Quipu ${status || 'connection'} error. ${advice[status] ?? 'The request failed. Check Quipu before repeating a write operation.'}${detail ? ' ' + detail : ''}`,
				);
			}
		}
		throw new NodeOperationError(context.getNode(), 'Quipu retry limit reached');
	}
	return { request };
}
export const request = createTransport().request;
