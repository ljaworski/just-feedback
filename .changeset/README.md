# Changesets

Every pull request that changes a public package should include a changeset:

```sh
npm run changeset
```

Choose `@codelionapps/just-feedback-react-native`, `@codelionapps/just-feedback-server`, or both, select the SemVer bump, and
write a user-facing summary. Documentation and internal-only changes may omit a changeset.
