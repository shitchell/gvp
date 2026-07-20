# Releasing cairn

## Versioning

As of **1.1.0**, cairn follows [Semantic Versioning](https://semver.org). Given a
version `A.B.C`:

| Segment | Bump when… |
|---------|------------|
| **A** (major) | a change is backwards-incompatible / breaking |
| **B** (minor) | a backwards-compatible feature or enhancement is added |
| **C** (patch) | a backwards-compatible bug fix is made |

The published `latest` dist-tag always points at a stable `A.B.C` release.
Prerelease suffixes (e.g. `1.2.0-rc.1`) may still be used for previews, published
under a non-`latest` tag.

This supersedes the earlier `1.0.X-beta` prerelease convention (GVP rule `gvp:R5`,
now deprecated). `1.1.0` is the first stable release; it carries the identity-lattice
reform (issues #6, #7, #8): the `user_requirement` and `exclusion` root types, the
mapping-anchor generalization, and decision `disposition` with top-side coverage.

## Publish steps

1. Bump `version` in `package.json` per the table above.
2. `npm run build` (also runs automatically via `prepublishOnly`).
3. `npm run test` — must be green.
4. `cairn validate` on `.gvp/` — no errors.
5. `npm publish`. For a stable `A.B.C`, npm updates `latest` by default; the
   `postpublish` script also pins the dist-tag as a belt-and-suspenders step.
6. Verify: `npm view @principled/cairn version` returns the new version.
