# Audits

Read-only audit scripts that query the live Base44 backend.

## Anonymous record audit

`2026-05-anonymous-audit.ts` queries every Base44 entity for records
with `created_by="anonymous"`. The script is read-only; it does not
modify any data.

### Running locally

    BASE44_TOKEN=<token> BASE44_APP_URL=<https://your-app.base44.app> \
      npm run audit:anonymous

Or set both values in `.env.local` and run `npm run audit:anonymous`
with no inline env vars.

### Running via GitHub Actions

Trigger the `Anonymous record audit` workflow from the Actions tab
with the workflow_dispatch button. The output JSON is uploaded as a
workflow artifact and retained for 90 days.

Required repo secrets: `BASE44_TOKEN`, `BASE44_APP_URL`.

### Output

The script writes `2026-05-anonymous-audit-output.json` to this
directory. Output files are gitignored and must not be committed.
