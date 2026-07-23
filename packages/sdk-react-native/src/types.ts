import type { TextStyle, ViewStyle } from 'react-native';

export interface FeedbackMetadata {
  appVersion?: string;
  platform?: string;
  osVersion?: string;
  deviceModel?: string;
  userRef?: string;
}

export interface FeedbackCopy {
  title?: string;
  placeholder?: string;
  cta?: string;
  cancel?: string;
  successMessage?: string;
  errorMessage?: string;
}

export interface FeedbackStyles {
  overlay?: ViewStyle;
  container?: ViewStyle;
  title?: TextStyle;
  input?: TextStyle;
  ctaButton?: ViewStyle;
  ctaButtonText?: TextStyle;
  cancelText?: TextStyle;
}

export interface FeedbackConfig {
  /** Instance base URL, no trailing `/api` (e.g. `https://feedback.example.com`). */
  url: string;
  apiKey: string;
  metadata?: FeedbackMetadata;
  copy?: FeedbackCopy;
  styles?: FeedbackStyles;
}

/** Thrown by `sendFeedback` on any non-2xx response or network/timeout failure. */
export class JustFeedbackError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'JustFeedbackError';
    this.status = status;
  }
}
