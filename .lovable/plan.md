# Show GST breakdown on receipts

## Changes
- Treat receipt prices as GST-inclusive at the Australian 10% rate.
- Add separate Net, GST, and Total paid/refunded lines to downloadable receipts.
- Keep refund values clearly marked as refunds while preserving the same tax breakdown.
- Verify the PDF output visually with an A$11.00 example: Net A$10.00, GST A$1.00, Total A$11.00.

## Technical details
- Calculate GST from the inclusive amount as total / 11, using integer cents to avoid floating-point display errors.
- Keep payment history list totals unchanged; only the receipt detail gains the tax breakdown.
