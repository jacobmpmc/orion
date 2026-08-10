/**
 * Strips credentials out of a remote URL.
 *
 * This is not hypothetical: a GitLab runner rewrites `remote.origin.url` to
 * `https://gitlab-ci-token:<job token>@gitlab.example.com/...`, and plenty of
 * pipelines clone with `https://oauth2:$TOKEN@...` by hand. A report is a file
 * people share, so the token must not ride along in it.
 *
 * Best-effort by design: an unrecognised URL is returned unchanged rather than
 * dropped, since the remote is useful context and this function cannot be the
 * only thing standing between a pipeline and a leaked secret.
 */

/** Matches `git@host:owner/repo.git`, which is scp syntax rather than a URL. */
const SCP_LIKE = /^[^/@\s]+@[^:/\s]+:[^\s]+$/;

/** A `scheme://` followed by anything up to an `@`, which is userinfo. */
const USERINFO = /^([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/@]*@/;

export function redactRemoteUrl(url: string): string {
  // A bare `git@github.com:acme/orion.git` names a user, not a secret, and has
  // no password field at all. Checked first because `new URL` rejects it and
  // the userinfo fallback would mangle it into `git@***`.
  if (SCP_LIKE.test(url)) return url;

  try {
    const parsed = new URL(url);
    if (parsed.username === "" && parsed.password === "") return url;
    parsed.username = "***";
    parsed.password = "";
    return parsed.toString();
  } catch {
    // Not a URL Node can parse -- fall through to the textual rule, which is
    // conservative enough to be safe on something we do not understand.
  }

  return url.replace(USERINFO, "$1***@");
}
