"use client";
import { ClipboardList } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon icon={ClipboardList} title="Construction des séances" step={7}
    coach={["Construire une séance à partir de la bibliothèque d'exercices, dans l'ordre voulu (glisser-déposer)",
      "Durée par exercice et durée totale, schémas, consignes et variantes",
      "Rattacher la séance à un groupe et à une date du planning",
      "Historique pédagogique : thèmes abordés, observations, prochains axes de travail",
      "Dupliquer une séance ou l'enregistrer comme modèle"]} />;
}
