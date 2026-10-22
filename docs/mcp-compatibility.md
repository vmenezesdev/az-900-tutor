# Remote MCP client compatibility

Last checked: **2026-10-22**. No named end-user client has completed the full
validation below. Discovery alone is insufficient to call a client compatible.
This matrix records this deployment's evidence, not every client's capabilities.

Endpoint under test: `https://az-900-tutor-mcp.luminiware.workers.dev/mcp`.

| Client / environment | Date and evidence | Discovery | OAuth completed | Profile / progress reads | Assessment write and readback | New conversation / reconnection | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Claude custom remote connector; app version, plan, OS and browser version not recorded | Operator capture on 2026-10-21, [#17](https://github.com/vmenezesdev/az-900-tutor/issues/17); same error reported again during the 2026-10-22 review | Form displayed; OAuth and published identity (CIMD) detected | **Blocked:** `invalid_client`, `Client metadata retrieval or validation failed` | Not tested | Not tested | Not tested | **Partial observation; compatibility not validated** |
| Claude using “Register automatically” (DCR) | Follow-up proposed in #17 | Not tested in this mode | Not tested | Not tested | Not tested | Not tested | Untested fallback |
| TypeScript MCP SDK in local workerd with isolated D1 | [2026-10-22 local run](validation/mcp-2026-10-22.md) | Local metadata and tools exercised | **Not tested:** integration tests issue synthetic signed tokens | Passed locally | Passed locally | New SDK connection reads the stored synthetic event | Server integration evidence only; not Claude validation |
| Other end-user clients | No completed run recorded | Not tested | Not tested | Not tested | Not tested | Not tested | Untested |

## Claude failure and current limits

The operator received this response when attempting to link the connector:

```json
{"error":"invalid_client","error_description":"Client metadata retrieval or validation failed"}
```

In `mcp-worker/src/auth.ts`, the CIMD branch of `/authorize` returns this message
from a catch block covering fetch, response streaming, JSON parsing and the D1
client-cache write. It runs before the Google authorization redirect. The message
does not isolate the cause or establish a Google credential problem.

The exact `client_id` metadata URL, response status/content type from that URL,
and Worker diagnostic stage were not captured. Local synthetic cases reproduce
the same message for both a thrown fetch and a non-JSON HTTP 200 response. Neither
is established as the production cause. Do not disable callback validation or
authentication to make the test pass.

The review browser reached Claude's sign-in page without an authenticated session.
Independent HTTP probes from the execution environment received `403` with
`error code: 1010` from the deployed endpoint. These are separate environment
limits; they do not describe a successful test from Anthropic's infrastructure.

## Next real-client run

Track completion in [#12](https://github.com/vmenezesdev/az-900-tutor/issues/12)
and the Claude-specific evidence in #17. Use a maintainer-owned test identity
and synthetic assessment content, with no real learner answers in public records.

1. Record Claude surface (web/Desktop), version where available, plan, OS,
   browser version, date, endpoint and selected OAuth mode.
2. Retry CIMD with safe stage diagnostics or test **Register automatically**
   (DCR), keeping **Sign in now**. Treat DCR as a separate run. Complete Google
   sign-in and the server consent; reaching the Google page alone is insufficient.
3. Call `get_profile` and `get_progress`. If needed, initialize the test profile
   with `update_profile`. Record actual tool success/error statuses.
4. Retrieve `get_study_plan`, `get_lesson`, and `get_question`; check that the
   question does not expose the answer key before an attempt.
5. In the explicit synthetic test, use `record_assessment` with a valid stable
   competency ID and a unique test marker. Confirm `saved: true`, then find that
   same marker and event fields in `get_progress`. A tutor's prose claim is not
   sufficient evidence.
6. End the conversation, open a new one, enable the connector and read the same
   event. Disconnect/reconnect with the same Google test identity and repeat.
   Where possible, repeat with a second client and the same identity.
7. Test revocation and deletion only for the disposable test profile, following
   #12. Record these results separately from read/write continuity.

For the minimum OAuth/tools/persistence claim, steps 2, 3, 5 and 6 must succeed
in the actual client. Leave broader #12 criteria open until individually tested.
Record failures as well as successes; keep tokens, authorization codes, state,
PKCE verifiers, account identifiers and learner exports out of public evidence.

## Testing the Worker locally

Run from `mcp-worker/`:

```sh
npm ci
npm run typecheck
npm test
```

The local `workerd` tests use a disposable D1 and mocked client metadata. They
can isolate server behavior without Google credentials or a production database.
They do not complete a real Google login or validate Claude's published CIMD.

For an interactive local Worker, apply `npm run migrate:local` and run
`npm run dev`. To exercise **Claude's custom remote connector** against that
Worker, expose it through a public HTTPS tunnel: the remote connector originates
from Anthropic's cloud, so `localhost:8787` is insufficient. Set the local
Worker's `PUBLIC_BASE_URL` to that HTTPS origin, register its
`/oauth/google/callback` in a separate Google test OAuth client, supply test-only
secrets through ignored local configuration, and restart the Worker. Use local
D1 and a disposable identity. A tunnel and real login were **not** run in this review.
Claude Desktop's local MCP mechanism is a separate integration; this repository's
Worker exposes Streamable HTTP, not a native stdio server.

Source: [Anthropic's custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp),
checked 2026-10-22, documents the cloud-origin requirement and OAuth-mode choices.
