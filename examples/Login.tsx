// Zone préservée (spec §9) : écrit une seule fois par ir-backend-css, jamais réécrit. Votre logique va ici.
import { LoginLayout } from "./Login.gen";

export function Login() {
  return <LoginLayout subtitle={"Connectez-vous pour continuer"} />;
}
