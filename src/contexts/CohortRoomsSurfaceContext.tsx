import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  useCohortRoomsSurface,
  type CohortRoomsSurfaceState,
} from "@/hooks/useCohortRoomsSurface";

const CohortRoomsSurfaceContext = createContext<CohortRoomsSurfaceState | null>(null);

export function CohortRoomsSurfaceProvider({ children }: { children: ReactNode }) {
  const { enabled, pending } = useCohortRoomsSurface();
  const value = useMemo(() => ({ enabled, pending }), [enabled, pending]);

  return (
    <CohortRoomsSurfaceContext.Provider value={value}>
      {children}
    </CohortRoomsSurfaceContext.Provider>
  );
}

/** The single resolved value consumed by both the route table and nav shell. */
// eslint-disable-next-line react-refresh/only-export-components -- provider and consumer must share this exact context
export function useCohortRoomsSurfaceValue(): CohortRoomsSurfaceState {
  const value = useContext(CohortRoomsSurfaceContext);
  if (value === null) {
    throw new Error("useCohortRoomsSurfaceValue must be used inside CohortRoomsSurfaceProvider");
  }
  return value;
}
