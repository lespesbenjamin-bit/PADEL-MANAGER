"use client";
import { CoachDashboard } from "@/components/CoachDashboard";
import { PlayerHome } from "@/components/PlayerHome";
import { useRole } from "@/lib/role";

export default function Home() {
  const { profile } = useRole();
  return profile.role === "coach" ? <CoachDashboard /> : <PlayerHome />;
}
