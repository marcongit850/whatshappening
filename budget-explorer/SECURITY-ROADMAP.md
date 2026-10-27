# Security roadmap

Follow-ups from Warden for Budget Explorer. Low means the item can wait. Not done means the code does not have the fix yet.

The repository did not already contain a list of Warden items G1 to G4. This file is where those follow-ups go. G1 to G4 are not restated here, because their text was not in the tree.

## Low, not done

- Chunked request body size cap. Read the body with a byte-counting reader that stops at 20 KB. The form check today looks at Content-Length only, so a chunked body is not capped.
- Count-then-insert rate-limit race. Make the per-network limit and the global caps atomic. Today the Worker counts rows and then inserts.
- A separate HMAC salt secret for IP hashes, and purge IP hashes after about 90 days. Hashes currently use the session secret. Nothing deletes old hashes.
- Strip control characters and null bytes from stored text before the row is written.
- Nits: the two public forms share the `be_form` cookie. `www.howtheyspendmytaxes.com` is not sent to the apex host with a 301.
