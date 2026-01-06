import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to organizations - OnboardingGuard will handle auth
  redirect('/organizations');
}
