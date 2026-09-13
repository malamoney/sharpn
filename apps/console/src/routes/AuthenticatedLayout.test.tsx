import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import * as eventStreamModule from "../events/eventStream.js";
import { handlersPassedIn, openEventStreamMock } from "../test/eventStreamTestSupport.js";
import { system } from "../theme.js";
import { AuthenticatedLayout } from "./AuthenticatedLayout.js";

vi.mock("../events/eventStream.js", async () => {
  const actual = await vi.importActual<typeof eventStreamModule>("../events/eventStream.js");
  return { ...actual, openEventStream: vi.fn() };
});

vi.mock("../api/session.js", () => ({ logout: vi.fn() }));

function renderLayout() {
  openEventStreamMock().mockReturnValue({ close: vi.fn() });

  const router = createMemoryRouter(
    [
      {
        element: <AuthenticatedLayout />,
        children: [{ path: "/", element: <div data-testid="child">child</div> }],
      },
    ],
    { initialEntries: ["/"] },
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ChakraProvider>,
  );
}

describe("establishing the SSE connection before fetching", () => {
  it("does not render a route's content until the live stream has connected or failed", () => {
    renderLayout();

    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("renders the route once the stream reports connected", async () => {
    renderLayout();

    handlersPassedIn().onConnectionStatus({ gateway: "connected", resyncing: false });

    await waitFor(() => {
      expect(screen.getByTestId("child")).toBeInTheDocument();
    });
  });

  it("still renders the route if the stream fails outright, rather than blocking forever", async () => {
    renderLayout();

    handlersPassedIn().onStreamDown();

    await waitFor(() => {
      expect(screen.getByTestId("child")).toBeInTheDocument();
    });
  });
});
