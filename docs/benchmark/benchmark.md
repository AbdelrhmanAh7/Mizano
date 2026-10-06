# Extraction benchmark (rules)

> SYNTHETIC CORPUS. These numbers exercise the harness and the rule extractor on
> hand-written fixtures. They are not an accuracy measurement on real invoices.

| Field         | Precision | Recall | Exact match |
| ------------- | --------- | ------ | ----------- |
| invoiceNumber | 100.0%    | 100.0% | 100.0%      |
| date          | 100.0%    | 100.0% | 100.0%      |
| dueDate       | 100.0%    | 100.0% | 100.0%      |
| vendorTaxId   | 100.0%    | 100.0% | 100.0%      |
| currency      | 100.0%    | 85.7%  | 87.5%       |
| subtotal      | 100.0%    | 100.0% | 100.0%      |
| tax           | 100.0%    | 85.7%  | 87.5%       |
| total         | 100.0%    | 100.0% | 100.0%      |

Documents: 8 | all fields exact: 87.5% | NEEDS_REVIEW: 37.5%
Latency p50 0.2 ms | p95 30.8 ms | max 30.8 ms | peak RSS 323 MB

| Document              | Latency (ms) | NEEDS_REVIEW | Fields matched | Mismatched fields |
| --------------------- | ------------ | ------------ | -------------- | ----------------- |
| en-sa-standard.txt    | 2.3          | no           | 8/8            | -                 |
| en-eg-thousands.txt   | 0.2          | yes          | 8/8            | -                 |
| en-ae-trn.txt         | 0.2          | no           | 8/8            | -                 |
| ar-sa-labels.txt      | 2.9          | no           | 8/8            | -                 |
| en-missing-total.txt  | 0.1          | yes          | 8/8            | -                 |
| en-ambiguous-date.txt | 0.1          | yes          | 8/8            | -                 |
| en-usd-no-tax-id.txt  | 0.1          | no           | 6/8            | currency, tax     |
| en-eg-text-layer.pdf  | 30.8         | no           | 8/8            | -                 |
