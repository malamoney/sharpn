/**
 * Signing in and out (`http/session.ts`). There is one password and no
 * identity to name alongside it, so there is nothing here beyond the two
 * calls.
 */
import { del, post } from "./client.js";

export function login(password: string): Promise<void> {
  return post<void>("/session", { password });
}

export function logout(): Promise<void> {
  return del<void>("/session");
}
