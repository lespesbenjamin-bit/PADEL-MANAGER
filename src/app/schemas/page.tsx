"use client";
import { PenTool } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon icon={PenTool} title="Éditeur de schémas tactiques" step={6}
    coach={["Terrain de padel vu de dessus : filet, vitres, grilles, lignes de service et zones",
      "Jusqu'à 4 joueurs déplaçables, balles, trajectoires, déplacements, flèches, zones cibles, plots, texte",
      "Couleurs, gomme, annuler / rétablir",
      "Enregistrer, dupliquer, associer à un exercice, partager avec un groupe",
      "Export PNG et PDF, puis séquences en plusieurs étapes"]} />;
}
