import { useContext } from 'react';
import { FeedbackContext } from './FeedbackProvider';

/** Imperative control over the built-in feedback modal. Must be used inside a FeedbackProvider. */
export function useFeedback(): {
  openFeedback: () => void;
  closeFeedback: () => void;
  isOpen: boolean;
} {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used within a <FeedbackProvider>.');
  }
  return { openFeedback: ctx.open, closeFeedback: ctx.close, isOpen: ctx.isOpen };
}
