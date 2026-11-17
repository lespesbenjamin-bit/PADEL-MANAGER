"use client";
import { Trophy } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon icon={Trophy} title="Calendrier des tournois" step={4}
    coach={["Calendrier mensuel et liste chronologique des compétitions de tous tes joueurs",
      "Filtres par joueur, catégorie (P25 → P1000…) et statut",
      "Vue des tournois où plusieurs joueurs sont inscrits",
      "Demandes d'accompagnement en coaching à traiter",
      "Résultats saisis par les joueurs (matchs, victoires, commentaire, photos)"]}
    player={["Ajoute tes tournois : date, club, catégorie, partenaire, statut, objectif",
      "Demande un accompagnement en coaching sur une compétition",
      "Renseigne tes résultats après le tournoi",
      "Propose ton résultat au fil de la communauté (avec ta confirmation)"]} />;
}
