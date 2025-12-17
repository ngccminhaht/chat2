'use client';

import { usePathname } from 'next/navigation';
import { ONBOARDING_STEPS, OnboardingStep } from '../types/onboarding.types';

export function useOnboardingProgress() {
  const pathname = usePathname();

  const getCurrentStep = (): OnboardingStep | null => {
    if (pathname.includes('create-organization')) return 'create-organization';
    if (pathname.includes('connect-platforms')) return 'connect-platforms';
    if (pathname.includes('invite-members')) return 'invite-members';
    return null;
  };

  const currentStep = getCurrentStep();
  const currentIndex = currentStep ? ONBOARDING_STEPS.indexOf(currentStep) : -1;

  return {
    currentStep,
    currentIndex,
    totalSteps: ONBOARDING_STEPS.length,
    steps: ONBOARDING_STEPS,
    isFirstStep: currentIndex === 0,
    isLastStep: currentIndex === ONBOARDING_STEPS.length - 1,
  };
}
