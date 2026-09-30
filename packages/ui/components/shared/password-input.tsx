"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "../ui/input";
import { useI18n } from "../i18n/i18n-context";

// #26 — "permitir visualizar la contraseña de acceso al escribirla".
//
// Se teclea a ciegas en seis o siete sitios de la casa (entrar, contraseña
// caducada ×3, cambio de contraseña, diálogo de cuenta) y en ninguno había
// forma de comprobar lo escrito. En una sala con gente delante, o con una
// contraseña generada que se pega a medias, eso es un intento fallido y una
// llamada a soporte.
//
// Lo que hace de más que un <input type="password">:
//  · el ojo NO entra en el orden de tabulación — quien navega con teclado va del
//    campo al botón de entrar, que es lo que quiere hacer;
//  · conserva el `autoComplete` que reciba también mientras está visible:
//    cambiarlo en caliente rompe el llavero del navegador a media escritura;
//  · el estado vuelve a "oculta" en cada montaje: no se recuerda entre sesiones
//    ni entre pantallas, que sería justo lo contrario de lo que pide una
//    contraseña.

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /**
   * Clases del campo. Con `className` se pinta un <input> pelado y manda quien
   * llama — es lo que necesita la pantalla de acceso, que tiene su propio
   * lenguaje visual (tokens `mc-*`) y no el del panel. Sin `className` se usa el
   * <Input> del sistema de diseño, que es lo que había en los diálogos de
   * cuenta: así ninguno de los dos mundos cambia de aspecto al ganar el ojo.
   */
  className?: string;
};

export function PasswordInput({ className, ...props }: Props) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const auto = useId();
  const id = props.id ?? auto;
  const tipo = visible ? "text" : "password";

  return (
    <div className="relative">
      {className === undefined ? (
        // Hueco a la derecha para el ojo, sin pisar el texto tecleado.
        <Input {...props} id={id} type={tipo} className="pr-10" />
      ) : (
        <input {...props} id={id} type={tipo} className={`${className} pr-10`} />
      )}
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("ui.password.hide") : t("ui.password.show")}
        title={visible ? t("ui.password.hide") : t("ui.password.show")}
        aria-controls={id}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-mc-slate-400 transition-colors hover:text-mc-slate-700 focus:outline-none focus-visible:text-mc-slate-700"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}
