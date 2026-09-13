import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router";

import { PendingCommandsProvider } from "../pending/PendingCommandsProvider.js";
import { system } from "../theme.js";

export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  {
    route = "/",
    queryClient = testQueryClient(),
  }: { route?: string; queryClient?: QueryClient } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ChakraProvider value={system}>
        <QueryClientProvider client={queryClient}>
          <PendingCommandsProvider>
            <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
          </PendingCommandsProvider>
        </QueryClientProvider>
      </ChakraProvider>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper }) };
}
