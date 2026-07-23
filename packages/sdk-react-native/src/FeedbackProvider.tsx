import React, { createContext, useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { FeedbackConfig } from './types';
import { FeedbackModal } from './FeedbackModal';

export interface FeedbackContextValue {
  /** Config with auto platform/osVersion merged in (dev-supplied fields win). */
  config: FeedbackConfig;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider(props: {
  config: FeedbackConfig;
  children?: React.ReactNode;
}): React.ReactElement {
  const { config, children } = props;
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo<FeedbackContextValue>(
    () => ({
      config: {
        ...config,
        // Auto metadata first; developer-supplied fields take precedence.
        metadata: {
          platform: Platform.OS,
          osVersion: String(Platform.Version),
          ...config.metadata,
        },
      },
      isOpen,
      open,
      close,
    }),
    [config, isOpen, open, close],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackModal visible={isOpen} onClose={close} />
    </FeedbackContext.Provider>
  );
}
