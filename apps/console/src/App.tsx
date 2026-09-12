import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RouterProvider } from "react-router";

import { PendingCommandsProvider } from "./pending/PendingCommandsProvider.js";
import { createQueryClient } from "./queries/queryClient.js";
import { router } from "./router.js";

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <PendingCommandsProvider>
        <RouterProvider router={router} />
      </PendingCommandsProvider>
    </QueryClientProvider>
  );
}
