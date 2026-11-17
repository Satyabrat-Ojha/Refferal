import { auth } from '@clerk/nextjs/server';
import LoginPage from './login-page.jsx';
import ReferralPage from './referral-page.jsx';

export default async function Home() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <ReferralPage />;
}
