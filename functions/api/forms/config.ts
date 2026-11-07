import { getDeliveryConfiguration, jsonResponse, type FormContext } from '../forms.ts';

export function onRequest({ request, env }: FormContext): Response {
  if (request.method !== 'GET') return jsonResponse({ available: false }, 405, { Allow: 'GET' });
  const configuration = getDeliveryConfiguration(env);
  return configuration
    ? jsonResponse({ available: true, turnstileSiteKey: configuration.siteKey })
    : jsonResponse({ available: false }, 503);
}
