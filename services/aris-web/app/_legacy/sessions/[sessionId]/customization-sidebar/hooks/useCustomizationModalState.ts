import { useCallback, useEffect, useState } from 'react';
import type { CustomizationModal } from '../types';

export function useCustomizationModalState() {
  const [activeModal, setActiveModal] = useState<CustomizationModal>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!activeModal) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveModal(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeModal]);

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  return {
    activeModal,
    activeModalKind: activeModal?.kind ?? null,
    closeModal,
    isMounted,
    setActiveModal,
  };
}
