import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/apiError.js";
import * as sessionApi from "../api/session.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { LoginPage } from "./LoginPage.js";

vi.mock("../api/session.js");

function renderLoginPage(route = "/login") {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<p>The Light list</p>} />
      <Route path="/lights/:id" element={<p>A Light</p>} />
    </Routes>,
    { route },
  );
}

describe("signing in", () => {
  it("goes to the list on a correct password", async () => {
    vi.mocked(sessionApi.login).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/password/i), "correct-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("The Light list")).toBeInTheDocument();
    });
  });

  it("says a wrong password plainly, not as a shape error", async () => {
    vi.mocked(sessionApi.login).mockRejectedValue(
      new ApiError({
        code: "NOT_AUTHENTICATED",
        message: "You are not signed in.",
        correlationId: "c1",
      }),
    );
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/does not match/i);
    });
  });
});
