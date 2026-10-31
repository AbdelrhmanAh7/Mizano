-- Item 3: the digits Arabic quote, bill and invoice PDFs print: Western "latn" (0123) or
-- Arabic-Indic "arab". Additive with a default, so existing organizations keep Western digits.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "documentDigits" TEXT NOT NULL DEFAULT 'latn';
