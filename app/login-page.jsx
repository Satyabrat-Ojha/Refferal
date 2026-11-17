import { SignInButton } from '@clerk/nextjs';

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <h1 id="login-title">Employee referral assistance</h1>
        <p>
          This tool was created by employees to streamline referral requests.{' '}
          <strong>It is not Juspay’s official referral portal.</strong>
        </p>
        <p>
          Requests submitted here are reviewed and verified by the referring employee
          before being submitted through Juspay’s official referral portal.
        </p>
        <p>
          Please sign in with the email address you want to use for your application.{' '}
          <strong>
            Complete this form only if you have not already applied to Juspay using
            that email address.
          </strong>
        </p>
        <SignInButton mode="redirect" forceRedirectUrl="/" signUpForceRedirectUrl="/">
          <button className="submit-button login-sign-in" type="button">Sign in</button>
        </SignInButton>
      </section>
    </main>
  );
}
