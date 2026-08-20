# Fixtures

JSON *data*, not modules: these are files a CI job would have produced, read for
real by the tests. Nothing here is imported as code.

| File | What it is |
| --- | --- |
| `preview.json` | A preview with one of everything: an update with a detailed diff, a three-step replacement chain, a create carrying a secret, a delete, unchanged resources, a warning diagnostic, and a `config` block that must never reach a report |
| `no-changes.json` | A preview where nothing changed |
| `failed.json` | A preview that emitted an `error` diagnostic |
| `not-pulumi.json` | Deliberately not a preview digest — it is vitest output — to exercise the "you pointed me at the wrong file" path. Do not "fix" it |

`preview.json` is hand-written rather than captured, so that it can hold every
case at once and so that no real account id, ami or credential is committed. To
recapture a real one for comparison:

```sh
pulumi preview --json --stack <stack> > preview.json
```

Two things to check before committing anything captured that way: `config` and
every `plaintext` under pulumi's secret signature
(`4dabf18193072939515e22adb298388d`) hold real values in a real digest. The
reporter redacts secrets on the way into a report, but a fixture is committed as
it stands.
