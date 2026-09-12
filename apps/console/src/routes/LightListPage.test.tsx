import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/apiError.js";
import * as lightsApi from "../api/lights.js";
import type { Light } from "../api/types.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { LightListPage } from "./LightListPage.js";

vi.mock("../api/lights.js");

function aLight(overrides: Partial<Light>): Light {
  return {
    id: "id",
    name: "Light",
    archetype: "classic_bulb",
    on: true,
    capabilities: { dimming: false, colorTemperature: false, color: false },
    ...overrides,
  };
}

describe("the Light list", () => {
  it("shows loading, then the Lights sorted locale-aware by name", async () => {
    vi.mocked(lightsApi.listLights).mockResolvedValue([
      aLight({ id: "1", name: "banana" }),
      aLight({ id: "2", name: "Apple" }),
    ]);

    renderWithProviders(<LightListPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);

    await waitFor(() => {
      const names = screen.getAllByText(/apple|banana/i).map((el) => el.textContent);
      expect(names).toEqual(["Apple", "banana"]);
    });
  });

  it("shows an empty state when the Bridge reports no lights", async () => {
    vi.mocked(lightsApi.listLights).mockResolvedValue([]);

    renderWithProviders(<LightListPage />);

    await waitFor(() => {
      expect(screen.getByText(/no lights/i)).toBeInTheDocument();
    });
  });

  it("distinguishes a Bridge-side outage from a generic failure", async () => {
    vi.mocked(lightsApi.listLights).mockRejectedValue(
      new ApiError({
        code: "GATEWAY_NOT_PAIRED",
        message: "The Gateway is not paired with a Bridge.",
        detail: "press the link button on the Bridge",
        correlationId: "c1",
      }),
    );

    renderWithProviders(<LightListPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "press the link button on the Bridge",
      );
    });
  });
});
