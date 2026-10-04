import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

export const MODEL = 'claude-opus-5-5';

const PAYMENT_METHODS = ['Card', 'Cash', 'Bank transfer', 'Mobile wallet', 'Other'] as const;
const NECESSITY = ['necessary', 'discretionary'] as const;

// ---- Request ---------------------------------------------------------------

export const ParseRequestSchema = z.object({
  text: z.string().max(20000).optional(),
  image: z
    .object({
      mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
      data: z.string(),
    })
    .optional(),
  today: z.string(),
  categories: z.array(
    z.object({ id: z.string(), label: z.string(), necessity: z.enum(NECESSITY) }),
  ),
  merchantRules: z
    .array(z.object({ merchant: z.string(), categoryId: z.string(), necessity: z.enum(NECESSITY) }))
    .default([]),
  examples: z
    .array(z.object({ description: z.string(), categoryId: z.string(), necessity: z.enum(NECESSITY) }))
    .default([]),
});
export type ParseRequest = z.infer<typeof ParseRequestSchema>;

// ---- Response (what Claude returns) ----------------------------------------

const ParsedLineItem = z.object({
  description: z.string(),
  amount: z.number().nullable(),
  category_id: z.string().nullable(),
  category_confident: z.boolean(),
  alternative_category_ids: z.array(z.string()),
  necessity: z.enum(NECESSITY),
  necessity_confident: z.boolean(),
});

const ParsedTransaction = z.object({
  kind: z.enum(['expense', 'refund']),
  date: z.string().nullable(),
  merchant: z.string().nullable(),
  total_amount: z.number().nullable(),
  currency: z.string().nullable(),
  payment_method: z.enum(PAYMENT_METHODS).nullable(),
  line_items: z.array(ParsedLineItem),
});

export const ParseResultSchema = z.object({
  transactions: z.array(ParsedTransaction),
  message: z.string().nullable(),
});
export type ParseResult = z.infer<typeof ParseResultSchema>;
export type ParsedTransactionT = z.infer<typeof ParsedTransaction>;
export type ParsedLineItemT = z.infer<typeof ParsedLineItem>;

// ---- Prompt ----------------------------------------------------------------

const INSTRUCTIONS = `You turn receipts, bank/card SMS alerts, emails, screenshots and short notes into structured expense records for a household in Pakistan. The household currency is PKR (written as Rs, Rs., PKR). The records feed a budgeting app that separates necessary from discretionary spending, so item-level categorisation matters.

How to read the input:
- Output one transaction per separate payment. A pasted list of several SMS alerts is several transactions; one receipt is one transaction.
- Record expenses and refunds only. Skip OTPs, balance notices, salary or other incoming credits, and promotional messages. If nothing qualifies, return no transactions and explain why in "message".
- For bank/card alerts use the charged amount, never the available balance. Amounts are positive numbers in the original currency; set kind to "refund" for refunds or reversals.
- Resolve relative dates ("yesterday", "last Friday") against the date given in the request. Dates are YYYY-MM-DD. Use null when there's no date at all.
- Use the cleaned-up merchant name ("Imtiaz Super Market", not "IMTIAZ SUPER MKT-0042").

Line items:
- Every transaction has at least one line item, and line item amounts should add up to total_amount.
- When a receipt lists items, split them by category so necessary and discretionary items are separated. Combine items that share a subcategory into one line item whose description names them ("Bread, eggs, milk"). Keep descriptions short.
- Put tax, delivery or service charges on their own line item in the most related category; apply discounts by reducing the related line item.
- If the input gives only a total, return a single line item for the full amount.

Categories:
- category_id must be one of the subcategory ids listed below, or null if you can't tell. Set category_confident to false when the merchant or item is ambiguous (e.g. a marketplace like Daraz or Amazon with no item detail, or a generic bank transfer), and list up to 3 plausible alternative_category_ids.
- The household's own merchant rules and past categorisations, when given, take priority over your own judgement.
- Start necessity from the subcategory default, then judge the actual item: chocolate bought at a pharmacy is discretionary, a work lunch is necessary. Set necessity_confident to false when it genuinely depends on context you don't have.
- Use null for any field the input doesn't contain. Don't guess amounts.`;

function categoryBlock(req: ParseRequest): string {
  const lines = req.categories.map((c) => `${c.id} | ${c.label} | default ${c.necessity}`);
  return `Subcategories (id | name | default necessity):\n${lines.join('\n')}`;
}

function contextBlock(req: ParseRequest): string {
  const parts = [`Today's date: ${req.today} (Asia/Karachi).`];
  if (req.merchantRules.length) {
    parts.push(
      'Merchant rules set by the household (merchant → category, necessity):\n' +
        req.merchantRules.map((r) => `${r.merchant} → ${r.categoryId}, ${r.necessity}`).join('\n'),
    );
  }
  if (req.examples.length) {
    parts.push(
      'Recent items as the household categorised them:\n' +
        req.examples.map((e) => `${e.description} → ${e.categoryId}, ${e.necessity}`).join('\n'),
    );
  }
  return parts.join('\n\n');
}

// ---- Call ------------------------------------------------------------------

export class ParseError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

export async function parseExpense(req: ParseRequest, client?: Anthropic): Promise<ParseResult> {
  if (!req.text?.trim() && !req.image) throw new ParseError('Nothing to read: add text or a photo.', 400);
  if (!client && !process.env.ANTHROPIC_API_KEY) {
    throw new ParseError('AI reading is not set up yet: add ANTHROPIC_API_KEY in Vercel (see docs/SETUP.md).', 500);
  }
  client ??= new Anthropic();

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (req.image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: req.image.mediaType, data: req.image.data },
    });
  }
  content.push({ type: 'text', text: contextBlock(req) });
  content.push({
    type: 'text',
    text: req.text?.trim()
      ? `Input to record:\n<input>\n${req.text.trim()}\n</input>`
      : 'Record the expense shown in the image.',
  });

  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(ParseResultSchema) },
      system: [
        { type: 'text', text: INSTRUCTIONS },
        { type: 'text', text: categoryBlock(req), cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ParseError('The Claude API key is missing or invalid. Check ANTHROPIC_API_KEY in Vercel.', 500);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ParseError('Claude is busy right now. Try again in a minute.', 429);
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new ParseError(`Claude couldn't process this input: ${error.message}`, 400);
    }
    if (error instanceof Anthropic.APIError) {
      throw new ParseError(`Claude API error (${error.status ?? 'network'}). Try again.`, 502);
    }
    throw error;
  }

  if (response.stop_reason === 'refusal') {
    throw new ParseError("Claude declined to read this input. Try adding the expense manually.", 422);
  }
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
    throw new ParseError("Couldn't read a result from Claude. Try again or add it manually.", 502);
  }
  return response.parsed_output;
}
