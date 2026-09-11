# The browser's session is a stateless signed cookie, and there is no way to revoke one

A browser needs to prove it was let in without the Console API remembering a
list of who it let in. There is one shared password and no user identity
behind it: nobody is being distinguished from anybody else, so a session names
nothing but itself — an id and an expiry, signed with an HMAC over a secret
this process reads once at startup (`auth/session.ts`), and verified by
recomputing the signature. There is no session store, no database row, and no
way to look one up.

The consequence that has to be deliberate: signing out clears the cookie a
browser holds and changes nothing else. A cookie copied out before signing
out — into another browser, or just remembered — still verifies, right up
until it expires on its own. `app.test.ts`'s "does not revoke the cookie
itself" asserts this rather than leaving it to be discovered.

## Considered Options

- **A session store (Redis, or a table in a database this project does not
  otherwise have).** Rejected. It would let sign-out revoke a specific cookie,
  which is the one thing a session store buys here — and there is no second
  thing it buys, because there is no second user to distinguish a session
  from. It would also be new infrastructure to run and back up for a LAN tool
  with one household using it.
- **A short-lived token with a refresh token behind it.** Rejected as
  complexity spent on a threat this deployment does not have: a stolen access
  token expiring quickly matters when many users share the API's blast radius
  unevenly. Here every session can already turn every light on and off, so a
  short-lived token limits nothing that a long-lived one does not also limit
  by simply expiring.
- **JWT-shaped claims, signed the same way.** Rejected as a heavier encoding
  for a payload that is two fields. The problem JWT solves — a standard way to
  carry many claims and an algorithm negotiation — is not a problem this
  cookie has one of.

## Consequences

- **Revoking one session is not an operation this service has.** The only way
  to invalidate a cookie before it expires is to change the password (a new
  hash file) and rotate the signing secret, which invalidates every cookie in
  the house at once — deliberately the coarsest possible grain, because it is
  the only grain a shared password has.
- **A stolen cookie is valid for up to thirty days**, or until the operator
  rotates the secret. There is no way to shorten that after the fact for one
  browser without shortening it for every browser. This is the same trade the
  shared password already makes at the login step, carried through to the
  session that follows it.
- **The expiry slides rather than being fixed to when a session was minted.**
  `requireSession` reissues the cookie with a fresh expiry on every request it
  lets through (`http/session.ts`), so a browser left open on a tablet in the
  kitchen stays signed in indefinitely and one abandoned is signed out thirty
  days after its last use, not its first. This is what makes thirty days a
  reasonable number rather than a nuisance: it is thirty days of *silence*,
  not thirty days total.
- **Nothing here answers "who is logged in right now."** There is no list to
  ask, because there is no identity to list — only cookies that either verify
  or do not. A future feature that needs to know how many browsers are
  currently signed in would need a different mechanism than this ADR chose,
  not an extension of it.
