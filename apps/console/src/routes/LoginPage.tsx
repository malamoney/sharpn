import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";

import { ApiError } from "../api/apiError.js";
import { login } from "../api/session.js";

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);

    try {
      await login(password);
      const from = (location.state as LocationState | null)?.from ?? "/";
      navigate(from, { replace: true });
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <h1>sharpn</h1>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          disabled={submitting}
          required
        />
        <button type="submit" disabled={submitting || password.length === 0}>
          Sign in
        </button>
        {error !== undefined && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}

function messageFor(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === "NOT_AUTHENTICATED") {
      return "That password does not match.";
    }
    if (cause.code === "TOO_MANY_REQUESTS") {
      return "Too many attempts. Wait a moment and try again.";
    }
    return cause.message;
  }

  // `fetch` rejects with a `TypeError` when it cannot complete the exchange
  // at all — the one failure `login` never answered. Anything else is a
  // fault this Console did not anticipate, not a claim about connectivity.
  if (cause instanceof TypeError) {
    return "Can't reach the Console API. Check the connection to this device.";
  }

  return "Something went wrong that this Console did not expect.";
}
