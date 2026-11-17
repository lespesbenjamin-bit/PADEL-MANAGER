import {
  BookOpen, CalendarDays, Newspaper, ClipboardList, LayoutDashboard, LucideIcon, Megaphone, PenTool, RefreshCcw, Trophy, UserCircle, Users, UsersRound,
} from "lucide-react";
import type { Role } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  /** Étape de développement à laquelle le module arrive (absent = disponible) */
  step?: number;
}
export interface NavSection { title: string | null; items: NavItem[] }

export const COACH_NAV: NavSection[] = [
  { title: null, items: [
    { href: "/", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard },
    { href: "/planning", label: "Planning", short: "Planning", icon: CalendarDays },
  ] },
  { title: "Collectif", items: [
    { href: "/groupes", label: "Groupes", short: "Groupes", icon: UsersRound },
    { href: "/cycles", label: "Cycles", short: "Cycles", icon: RefreshCcw },
    { href: "/joueurs", label: "Joueurs & crédits", short: "Joueurs", icon: Users },
  ] },
  { title: "Compétition", items: [
    { href: "/tournois", label: "Tournois", short: "Tournois", icon: Trophy },
  ] },
  { title: "Communauté", items: [
    { href: "/communaute", label: "Fil d'actualité", short: "Communauté", icon: Megaphone },
  ] },
  { title: "Pédagogie", items: [
    { href: "/exercices", label: "Exercices", short: "Exercices", icon: BookOpen },
    { href: "/schemas", label: "Schémas tactiques", short: "Schémas", icon: PenTool },
    { href: "/programmes", label: "Séances types", short: "Séances types", icon: ClipboardList },
  ] },
];

/** Barre basse mobile du coach (le reste est dans « Plus ») */
export const COACH_MOBILE = ["/", "/planning", "/groupes", "/joueurs"];

export const PLAYER_NAV: NavSection[] = [
  { title: null, items: [
    { href: "/", label: "Fil d'actualité", short: "Fil", icon: Newspaper },
    { href: "/mon-espace", label: "Mon espace", short: "Mon espace", icon: LayoutDashboard },
    { href: "/tournois", label: "Mes tournois", short: "Tournois", icon: Trophy },
    { href: "/exercices", label: "Exercices partagés", short: "Exercices", icon: BookOpen },
    { href: "/mon-profil", label: "Mon profil", short: "Profil", icon: UserCircle },
  ] },
];
export const PLAYER_MOBILE = ["/", "/mon-espace", "/tournois", "/mon-profil"];

/** Pages accessibles à un joueur (le reste est réservé au coach) */
export const PLAYER_ALLOWED = ["/", "/mon-espace", "/tournois", "/communaute", "/exercices", "/mon-profil", "/rejoindre"];

export function navFor(role: Role) {
  return role === "coach" ? COACH_NAV : PLAYER_NAV;
}

export function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/") || (href === "/planning" && path.startsWith("/seances"));
}
