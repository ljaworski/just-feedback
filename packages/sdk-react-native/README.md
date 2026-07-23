# @codelionapps/react-native

Drop-in feedback collection for React Native and Expo apps, backed by a self-hosted
[just-feedback](https://github.com/ljaworski/just-feedback) server. The SDK is written entirely in
TypeScript and JavaScript, requires no native linking, and works in Expo Go.

## Install

```sh
npm install @codelionapps/react-native
# or
yarn add @codelionapps/react-native
```

React 18 or newer and React Native 0.72 or newer are required.

## Quick start

```tsx
import { FeedbackProvider, useFeedback } from '@codelionapps/react-native';

export default function Root() {
  return (
    <FeedbackProvider
      config={{
        url: 'https://feedback.example.com',
        apiKey: 'jf_...',
      }}
    >
      <App />
    </FeedbackProvider>
  );
}

function ReportButton() {
  const { openFeedback } = useFeedback();
  return <Button title="Send feedback" onPress={openFeedback} />;
}
```

The provider automatically adds the platform and OS version to feedback metadata. Copy, styles,
metadata, and the request timeout can be customized through the exported types and components.

## Public write key

The `apiKey` is embedded in the mobile application and must be treated as a public, write-only
project key—not as a secret. It authorizes feedback submission only. Do not reuse an administrative
credential or any secret with broader access.

## Exports

- `FeedbackProvider` and `useFeedback` for the drop-in flow.
- `FeedbackModal` for custom placement.
- `sendFeedback` for a custom UI.
- `JustFeedbackError` and all public configuration types.

## License

MIT
