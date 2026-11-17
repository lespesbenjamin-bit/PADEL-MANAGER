"use client";
import { Megaphone } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon icon={Megaphone} title="Fil d'actualité" step={5}
    coach={["Fil privé réservé aux joueurs invités : rien n'est public",
      "Annonces du coach, publications épinglées, résultats mis en avant",
      "Modération : masquer ou supprimer une publication, gérer les commentaires et signalements",
      "Photos stockées de façon privée (Supabase Storage)"]}
    player={["Publie tes photos de tournoi, podiums, moments d'entraînement",
      "J'aime, réactions et commentaires",
      "Publication proposée automatiquement quand tu saisis un résultat (tu confirmes avant diffusion)",
      "Communauté privée : visible uniquement par les joueurs du coach"]} />;
}
