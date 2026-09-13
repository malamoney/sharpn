import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/apiError.js";
import * as lightsApi from "../api/lights.js";
import type { Light } from "../api/types.js";
import * as eventStreamModule from "../events/eventStream.js";
import { LiveLightsProvider } from "../events/LiveLightsProvider.js";
import { handlersPassedIn, openEventStreamMock } from "../test/eventStreamTestSupport.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { LightListPage } from "./LightListPage.js";

vi.mock("../api/lights.js");
vi.mock("../events/eventStream.js", async () => {
  const actual = await vi.importActual<typeof eventStreamModule>("../events/eventStream.js");
  return { ...actual, openEventStream: vi.fn() };
});

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

describe("the header's count, live", () => {
  it("follows a toggle once the Bridge's Invalidation lands, and the card's Pending Command settles with it", async () => {
    const bedroom = aLight({ id: "b", name: "Bedroom", on: false });
    vi.mocked(lightsApi.listLights).mockResolvedValue([bedroom]);
    vi.mocked(lightsApi.updateLight).mockResolvedValue({
      outcome: "success",
      updated: [{ rid: "b", rtype: "light" }],
      errors: [],
      correlationId: "corr-1",
    });
    openEventStreamMock().mockReturnValue({ close: vi.fn() });

    const user = userEvent.setup();
    renderWithProviders(
      <LiveLightsProvider>
        <LightListPage />
      </LiveLightsProvider>,
    );

    const header = await screen.findByRole("banner");
    await waitFor(() => expect(header).toHaveTextContent("1 light paired · 0 on"));

    const toggle = screen.getByRole("switch");
    await user.click(toggle);
    await waitFor(() => expect(lightsApi.updateLight).toHaveBeenCalled());

    // The Acknowledgement is not a Light (ADR 0001): the count still says
    // what was last read, and the card still shows a Pending Command.
    expect(header).toHaveTextContent("1 light paired · 0 on");
    expect(toggle.closest(".on-off")).toHaveClass("pending");

    // The list is the Console's copy of this Light here — there is no detail
    // query on this page — so its Invalidation has to re-read the list.
    vi.mocked(lightsApi.listLights).mockResolvedValue([{ ...bedroom, on: true }]);
    handlersPassedIn().onLightNotice({ id: "b", change: "changed" });

    await waitFor(() => expect(header).toHaveTextContent("1 light paired · 1 on"));
    expect(toggle.closest(".on-off")).not.toHaveClass("pending");
  });
});
