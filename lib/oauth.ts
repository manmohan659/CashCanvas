import type { NextApiRequest } from 'next';

/**
 * Builds the Chase OAuth consent URL.
 */
export function buildChaseAuthUrl(clientId: string, redirect: string) {
  const base = 'https://api.chase.com/aggregator-oauth/authorize';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'ais:consents:AccountAggregation',
  });
  return `${base}?${params.toString()}`;
}

/**
 * Extracts the OAuth code from a callback request.
 */
export function getAuthCode(req: NextApiRequest): string | undefined {
  const { code } = req.query;
  return typeof code === 'string' ? code : undefined;
}
