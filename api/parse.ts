import { readSupabaseConfig } from './_lib/supabase-config.js';
import { ParseError, ParseRequestSchema, parseExpense } from './_lib/parse-core.js';

/**
 * POST /api/parse — turns pasted text or a receipt photo into draft expenses.
 * Requires the household's Supabase session token so that nobody else can
 * spend the Claude API credit.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireHousehold(request);
    const body = ParseRequestSchema.safeParse(await request.json());
    if (!body.success) return json({ error: 'Invalid request.' }, 400);
    const result = await parseExpense(body.data);
    return json(result, 200);
  } catch (error) {
    if (error instanceof ParseError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: 'Something went wrong while reading this. Try again.' }, 500);
  }
}

async function requireHousehold(request: Request): Promise<void> {
  const { url, key, demo, problems } = readSupabaseConfig(process.env);
  if (demo) {
    // Local demo mode only: the dev server sets this flag.
    if (process.env.PARSE_ALLOW_UNAUTHENTICATED === '1') return;
    throw new ParseError('Server is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_KEY.', 500);
  }
  if (problems.length) throw new ParseError(problems[0], 500);
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new ParseError('Not signed in.', 401);
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ParseError('Your session has expired. Unlock the app again.', 401);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
