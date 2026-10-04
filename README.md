# Household Expenses

A phone-friendly web app for logging household expenses in seconds and
tracking necessary vs discretionary spending against monthly budgets.

- **Add expenses three ways:** quick manual entry, pasted text (bank SMS, emails, notes), or a receipt photo. Claude reads the last two.
- **Two-level data:** each expense is split into line items, so one grocery bill can hold both necessary and discretionary items.
- **Asks when unsure:** missing or unclear details become one-tap questions, and saving is never blocked.
- **Budget alerts** at 50/75/90/100% of a monthly budget.
- Installs on Android and iPhone home screens (PWA), works offline for manual entries, exports to CSV.

📄 [Requirements](docs/REQUIREMENTS.md) · 🛠️ [Setup guide](docs/SETUP.md)

## Tech

React + TypeScript + Vite, Mantine UI, vite-plugin-pwa · Supabase (Postgres, auth, storage) · Claude API via a Vercel function (`api/parse.ts`).

```bash
npm install
npm run dev     # demo mode if Supabase isn't configured in .env
npm test
npm run build
```
