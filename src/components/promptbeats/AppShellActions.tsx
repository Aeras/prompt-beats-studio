import { createContext, useContext, type ReactNode } from "react";

export type AppShellActions = {
  openTrackSubmission: () => void;
};

const AppShellActionsContext = createContext<AppShellActions | null>(null);

export function AppShellActionsProvider({
  actions,
  children,
}: {
  actions: AppShellActions;
  children: ReactNode;
}) {
  return <AppShellActionsContext.Provider value={actions}>{children}</AppShellActionsContext.Provider>;
}

export function useAppShellActions(): AppShellActions {
  const actions = useContext(AppShellActionsContext);
  if (!actions) throw new Error("useAppShellActions must be used inside AppShell.");
  return actions;
}
