"use client";
import { CoachDashboard } from "@/components/CoachDashboard";
import { CommunityFeed } from "@/components/Community";
import { useRole } from "@/lib/role";

export default function Home() {
  const { profile } = useRole();
  return profile.role === "coach" ? <CoachDashboard /> : <CommunityFeed home />;
}
