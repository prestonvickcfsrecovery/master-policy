export const dynamic = "force-dynamic";

const MESSAGES = {
  denied: "That account isn't on the coaching team's list. Ask the curriculum owner to add your work email, then try again.",
  state: "The sign-in attempt expired. Start again.",
  token: "Google wouldn't complete the sign-in. Check the app's Google credentials, then try again.",
  userinfo: "Google wouldn't share the account details needed to sign in. Try again.",
};

export default async function SignedOut({ searchParams }) {
  const sp = await searchParams;
  const error = sp?.error;
  return (
    <div className="signin">
      <span className="spectrum" aria-hidden="true" style={{ display: "flex", flexDirection: "column", borderRadius: 6, overflow: "hidden" }}>
        <i style={{ flex: 1, background: "#B03A2E" }} /><i style={{ flex: 1, background: "#C2611C" }} />
        <i style={{ flex: 1, background: "#A57C00" }} /><i style={{ flex: 1, background: "#1B7A45" }} />
      </span>
      <h1>Coaching Curriculum</h1>
      <p>{error ? MESSAGES[error] || "Sign-in didn't complete. Try again." : "You're signed out. Sign back in with your work Google account to reach the curriculum."}</p>
      <a className="gbtn" href="/api/auth/signin">Sign in with Google</a>
    </div>
  );
}
