# Releasing just-feedback

Public packages are independently versioned with Changesets. The server Docker image always uses
the version of `@codelionapps/server`.

## One-time bootstrap

1. Use the public npm organization `codelionapps` and enable mandatory 2FA for maintainers.
2. Configure the public repository `ljaworski/just-feedback` with `main` branch protection and
   required CI checks.
3. From a clean, reviewed `main` checkout, sign in to npm and run `npm ci` followed by
   `npm run release`; publish the initial `0.1.0` packages interactively with 2FA. The package names
   must still return 404 immediately before this step.
4. In each package's npm settings, configure GitHub Actions Trusted Publishing for organization
   `ljaworski`, repository `just-feedback`, workflow `release.yml`, action `npm publish`.
5. Verify one OIDC release, then set publishing access to require 2FA and disallow traditional
   tokens. Do not add an npm write token to GitHub.
6. Make the `ghcr.io/ljaworski/just-feedback` package public after its first workflow publication.

After the initial npm publication, run the Release workflow manually from the `0.1.0` tag to publish
the matching initial Docker image. Manual dispatch skips npm and publishes the server version found
in the selected Git ref.

## Normal release

1. Add a changeset to every pull request that changes a public package: `npm run changeset`.
2. Merge changes into `main`; the Release workflow creates or updates the release pull request.
3. Review the versions and changelogs in that pull request and merge it.
4. The same workflow publishes npm packages with OIDC and provenance, creates GitHub Releases, and
   publishes a multi-platform GHCR image when the server version changes.

Before merging a release pull request, `npm run verify:packages` and `npm run smoke:packages` must
pass from a clean checkout.
