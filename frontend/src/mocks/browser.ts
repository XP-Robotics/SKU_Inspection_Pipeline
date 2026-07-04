import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

/**
 * Start the mock service worker. Called from main.tsx only when
 * VITE_USE_MOCKS=true. onUnhandledRequest="bypass" lets real assets (the Vite
 * dev server, HMR) through untouched.
 */
export async function startMocks(): Promise<void> {
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: true,
  });
}
