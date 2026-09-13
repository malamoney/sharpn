import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import * as lightsApi from "../api/lights.js";
import type { Acknowledgement, Light } from "../api/types.js";
import { lightDetailKey } from "../queries/queryKeys.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { LightDetailPage } from "./LightDetailPage.js";

vi.mock("../api/lights.js");

function aLight(overrides: Partial<Light>): Light {
  return {
    id: "l1",
    name: "Hallway",
    archetype: "classic_bulb",
    on: true,
    capabilities: { dimming: false, colorTemperature: false, color: false },
    ...overrides,
  };
}

function renderDetail(light: Light) {
  vi.mocked(lightsApi.getLight).mockResolvedValue(light);

  return renderWithProviders(
    <Routes>
      <Route path="/lights/:id" element={<LightDetailPage />} />
    </Routes>,
    { route: `/lights/${light.id}` },
  );
}

describe("capability-aware controls", () => {
  it("shows only the on/off switch for a light with no other Capabilities", async () => {
    renderDetail(aLight({}));

    await waitFor(() => {
      expect(screen.getByText("Hallway")).toBeInTheDocument();
    });

    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.queryByLabelText(/brightness/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/colour temperature/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^colour$/i)).not.toBeInTheDocument();
  });

  it("shows every control a fully-capable light reports", async () => {
    renderDetail(
      aLight({
        brightness: 80,
        colorTemperatureMirek: 300,
        colorXy: { x: 0.4, y: 0.4 },
        colorGamut: {
          red: { x: 0.69, y: 0.31 },
          green: { x: 0.17, y: 0.7 },
          blue: { x: 0.15, y: 0.05 },
        },
        capabilities: { dimming: true, colorTemperature: true, color: true },
      }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/brightness/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/colour temperature/i)).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /^colour$/i })).toBeInTheDocument();
  });

  it("surfaces that renaming is not possible, honestly rather than silently", async () => {
    renderDetail(aLight({}));

    await waitFor(() => {
      expect(screen.getByText(/can't be changed here/i)).toBeInTheDocument();
    });
  });

  it("falls back to the HSV wheel when a colour light reports no gamut", async () => {
    renderDetail(
      aLight({
        colorXy: { x: 0.4, y: 0.4 },
        capabilities: { dimming: false, colorTemperature: false, color: true },
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("slider", { name: /^colour$/i })).toBeInTheDocument();
    });

    expect(document.querySelector(".hsv-wheel")).not.toBeNull();
    expect(document.querySelector(".gamut-picker")).toBeNull();
  });
});

describe("the header's state line", () => {
  it("names the Light's on/off state beside its fitting, and follows a fresher read", async () => {
    const light = aLight({ on: true, archetype: "table_shade" });
    vi.mocked(lightsApi.updateLight).mockResolvedValue({
      outcome: "success",
      updated: [{ rid: light.id, rtype: "light" }],
      errors: [],
      correlationId: "corr-0",
    });

    const user = userEvent.setup();
    const { queryClient } = renderDetail(light);

    await waitFor(() => screen.getByRole("switch"));
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent("On · Table shade");

    await user.click(screen.getByRole("switch"));

    // A Pending Command belongs to the switch, marked as such; the header
    // states what is known to be true, so it is unmoved until a fresher read
    // (ADR 0001).
    expect(header).toHaveTextContent("On · Table shade");
    await waitFor(() => expect(lightsApi.updateLight).toHaveBeenCalled());
    expect(header).toHaveTextContent("On · Table shade");

    queryClient.setQueryData(lightDetailKey(light.id), { ...light, on: false });

    await waitFor(() => {
      expect(header).toHaveTextContent("Off · Table shade");
    });
  });
});

describe("a Pending Command", () => {
  it("shows what was asked for, distinctly, until a fresher read settles it", async () => {
    const light = aLight({ on: true });
    vi.mocked(lightsApi.getLight).mockResolvedValue(light);

    const acknowledgement: Acknowledgement = {
      outcome: "success",
      updated: [{ rid: light.id, rtype: "light" }],
      errors: [],
      correlationId: "corr-1",
    };
    let resolveUpdate: (value: Acknowledgement) => void = () => undefined;
    vi.mocked(lightsApi.updateLight).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(
      <Routes>
        <Route path="/lights/:id" element={<LightDetailPage />} />
      </Routes>,
      { route: `/lights/${light.id}` },
    );

    await waitFor(() => {
      expect(screen.getByRole("switch")).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch") as HTMLInputElement;
    expect(toggle.closest(".on-off")).not.toHaveClass("pending");

    await user.click(toggle);

    // What was asked for, shown before the Console API has said anything at
    // all: "Off", and marked as a Pending Command rather than as the truth.
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(toggle.closest(".on-off")).toHaveClass("pending");

    // The Acknowledgement arrives — an Outcome, never a Light (ADR 0001) —
    // and the Pending Command is still what is shown, unmoved by it.
    resolveUpdate(acknowledgement);
    await waitFor(() => expect(lightsApi.updateLight).toHaveBeenCalled());
    expect(toggle.closest(".on-off")).toHaveClass("pending");

    // Only a fresher read settles it — here, the Invalidation-driven refetch
    // an SSE `light.changed` frame would cause.
    queryClient.setQueryData(lightDetailKey(light.id), { ...light, on: false });

    await waitFor(() => {
      expect(toggle.closest(".on-off")).not.toHaveClass("pending");
    });
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("clears immediately on a rejection, since nothing was applied to wait for", async () => {
    const light = aLight({ on: true });
    vi.mocked(lightsApi.getLight).mockResolvedValue(light);
    vi.mocked(lightsApi.updateLight).mockResolvedValue({
      outcome: "rejected",
      updated: [],
      errors: [{ description: "the Bridge said no" }],
      correlationId: "corr-2",
    });

    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/lights/:id" element={<LightDetailPage />} />
      </Routes>,
      { route: `/lights/${light.id}` },
    );

    await waitFor(() => screen.getByRole("switch"));
    const toggle = screen.getByRole("switch") as HTMLInputElement;

    await user.click(toggle);

    await waitFor(() => {
      expect(toggle.closest(".on-off")).not.toHaveClass("pending");
    });
    // Reverted to the last confirmed value — the Command never applied.
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/would not/i);
  });
});

describe("a partial or unknown Outcome", () => {
  it("clears the Pending Command and surfaces the Bridge's own diagnostic verbatim, for partial", async () => {
    const light = aLight({ on: true });
    vi.mocked(lightsApi.getLight).mockResolvedValue(light);
    vi.mocked(lightsApi.updateLight).mockResolvedValue({
      outcome: "partial",
      updated: [{ rid: light.id, rtype: "light" }],
      errors: [{ description: "the Bridge rejected the colour" }],
      correlationId: "corr-3",
    });

    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/lights/:id" element={<LightDetailPage />} />
      </Routes>,
      { route: `/lights/${light.id}` },
    );

    await waitFor(() => screen.getByRole("switch"));
    const toggle = screen.getByRole("switch") as HTMLInputElement;

    await user.click(toggle);

    await waitFor(() => {
      expect(toggle.closest(".on-off")).not.toHaveClass("pending");
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "the Bridge rejected the colour",
    );
  });

  it("clears the Pending Command and shows a transient couldn't-confirm notice for an unknown outcome", async () => {
    const light = aLight({ on: true });
    vi.mocked(lightsApi.getLight).mockResolvedValue(light);
    vi.mocked(lightsApi.updateLight).mockResolvedValue({
      outcome: "unknown",
      updated: [],
      errors: [],
      correlationId: "corr-4",
    });

    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/lights/:id" element={<LightDetailPage />} />
      </Routes>,
      { route: `/lights/${light.id}` },
    );

    await waitFor(() => screen.getByRole("switch"));
    const toggle = screen.getByRole("switch") as HTMLInputElement;

    await user.click(toggle);

    await waitFor(() => {
      expect(toggle.closest(".on-off")).not.toHaveClass("pending");
    });
    expect(screen.getByRole("status")).toHaveTextContent(/couldn't confirm/i);
  });
});
