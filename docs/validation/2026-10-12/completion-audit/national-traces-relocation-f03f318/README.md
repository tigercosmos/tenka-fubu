# Verified relocation of old national browser traces

The old task directory `/tmp/tenka-national-current-headless-artifacts` was streamed to an exclusively created directory on `sim2`:

`/tmp/tenka-retained-national-traces-10277b4a96544765bec8b7244a8c8d9c/tenka-national-current-headless-artifacts`

The inventory contains 17,006 entries and 1,644,571,085 file bytes. It records file SHA-256, size and mode, directory modes, and symlink targets. Its SHA-256 is `ab99618435e18191c5e8ec92ac696bdfd0b1c3853756c1d57a18194840014e47`. The remote verifier compared every entry with this manifest. A fresh local comparison and open-handle check preceded deletion of only the original local directory. The final summary records successful remote verification, unchanged local bytes, no open handles and completion of that deletion.

This package preserves the original producer, manifest, commands, logs, removal plan and summaries. It adds a new external location; it does not alter historical indexed packages or claim that the old local path still exists. No bulk traces are duplicated here. This verified relocation is separate from the earlier unrecovered scratch-transfer files disclosed in the color normalization package.

Run `python3 verify.py` to verify this local proof and its recorded outcomes. It does not re-read the remote archive or prove future availability. Future use must verify the retained remote files against the manifest before relying on them.

The first local package check failed because its hash table included itself while empty. That original table and failed check remain preserved; the corrected table excludes its own file. This packaging error did not affect the relocation manifest or the prior remote verification.
