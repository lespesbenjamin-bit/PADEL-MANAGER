"use client";
import { createContext, useContext } from "react";
import type { MyProfile } from "./types";

export interface RoleState {
  profile: MyProfile;
  email: string | null;
  refresh: () => Promise<void>;
}

export const RoleContext = createContext<RoleState | null>(null);

export function useRole(): RoleState {
  const v = useContext(RoleContext);
  if (!v) throw new Error("useRole doit être utilisé dans l'application connectée");
  return v;
}

export function useIsCoach() {
  return useContext(RoleContext)?.profile.role === "coach";
}
