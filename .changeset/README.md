# Changesets

Every pull request that changes a public package should include a changeset:

```sh
npm run changeset
```

Choose `@codelionapps/react-native`, `@codelionapps/server`, or both, select the SemVer bump, and
write a user-facing summary. Documentation and internal-only changes may omit a changeset.
