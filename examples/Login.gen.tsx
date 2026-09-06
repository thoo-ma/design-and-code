// Généré depuis Login.ir par ir-backend-css. Ne pas éditer : zone générée (spec §9).
import s from "./Login.gen.module.css";
import { Icon } from "./ir-support";

export function LoginLayout({ subtitle }: { subtitle: string }) {
  return (
    <div className={s.root} data-ir="root">
      <h1 className={s.title} data-ir="title">Bienvenue</h1>
      <p className={s.subtitle} data-ir="subtitle">{subtitle}</p>
      <div className={s.form} data-ir="form">
        <div className={s.email} data-ir="email" role="textbox" aria-label="Email" />
        <div className={s.password} data-ir="password" role="textbox" aria-label="Mot de passe" />
      </div>
      <div className={s.actions} data-ir="actions">
        <div className={s.primary} data-ir="primary" role="button">
          <span className={s.primaryLabel} data-ir="primaryLabel">Continuer</span>
        </div>
        <Icon name="help-circle" className={s.help} data-ir="help" />
      </div>
    </div>
  );
}
