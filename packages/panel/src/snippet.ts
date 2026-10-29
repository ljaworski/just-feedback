/** Ready-to-paste SDK config snippet shown next to a freshly created key. */
export function sdkSnippet(origin: string, apiKey: string): string {
  return `import { FeedbackProvider } from '@codelionapps/just-feedback-react-native';

<FeedbackProvider
  config={{
    url: '${origin}',
    apiKey: '${apiKey}',
  }}
>
  <App />
</FeedbackProvider>`;
}
