'use client';

import { Stepper, Step, StepLabel } from '@mui/material';
import { useOnboardingProgress } from '../hooks/useOnboardingProgress';

const STEP_LABELS = {
  'create-organization': 'Create Organization',
  'connect-platforms': 'Connect Platforms',
  'invite-members': 'Invite Members',
};

export default function OnboardingProgress() {
  const { currentIndex, steps } = useOnboardingProgress();

  return (
    <Stepper activeStep={currentIndex} alternativeLabel>
      {steps.map((step) => (
        <Step key={step}>
          <StepLabel>{STEP_LABELS[step]}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}
