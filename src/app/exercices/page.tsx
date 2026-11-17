"use client";
import { BookOpen } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon icon={BookOpen} title="Bibliothèque d'exercices" step={6}
    coach={["Fiches complètes : objectif, organisation, consignes, critères de réussite, variantes, erreurs et corrections",
      "Catégories technique, tactique et physique (bandeja, vibora, sortie de vitre, transition…)",
      "Recherche et filtres multicritères (niveau, nombre de joueurs, durée, catégorie)",
      "Exercice privé ou partagé avec certains groupes",
      "Schéma tactique, image ou vidéo associés"]}
    player={["Les exercices que ton coach partage avec ton groupe", "Schémas et consignes pour revoir les situations travaillées"]} />;
}
