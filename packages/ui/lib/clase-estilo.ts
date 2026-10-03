// Estilo por CLASE de la Biblioteca Legal: color de la pastilla, borde, acento de
// categoría e icono. Lo consumen el modal de Fuentes (`/sources`) y las citas del
// rail de MycoBot, que hasta ahora llevaban cada uno su propia copia del mapa.
//
// POR QUÉ EXISTE. Las copias se quedaban a medias en cada clase nueva: #905 añadió
// SISTEMA_REGISTRAL a la leyenda del Consultor pero no al rail ni al modal, que la
// pintaban en gris y sin icono; a INSTRUCCIONES_DGSJFP y APORTACION_ORG les pasaba
// lo mismo desde que nacieron, y LEGISLACION_AUTONOMICA y GUIAS seguían con el
// color de antes de #911b (emerald y amber), que el Consultor ya había cambiado a
// teal y stone precisamente para que dos categorías no compartieran banda. Un
// mismo documento se veía de un color en la Biblioteca y de otro en la cita.
//
// La definición CANÓNICA es la leyenda de la Biblioteca del Consultor
// (`mycolegal-consultor/src/app/(dashboard)/resoluciones/page.tsx`): este fichero
// es su espejo para el resto de la flota. Al añadir una clase hay que tocar los
// dos; el enum vive en Prisma y la lista blanca del filtro en
// `mycolegal-consultor/src/lib/validators/resoluciones.ts` (ver #946).
//
// Las clases de Tailwind van ESCRITAS enteras a propósito —nada de
// `bg-${color}-100`—: el compilador tiene que verlas literales para generarlas.
// Las apps escanean este paquete ya compilado (`node_modules/@mycolegal-app/ui/
// dist/**/*.js` en su `tailwind.config.ts`), así que basta con declararlas aquí.

import {
  Gavel,
  Building2,
  Car,
  ClipboardList,
  Stamp,
  BookMarked,
  BookOpen,
  Scale,
  ScrollText,
  Landmark,
  Globe,
  ShieldCheck,
  Library,
  FileQuestion,
  type LucideIcon,
} from "lucide-react";

export interface ClaseEstilo {
  /** Relleno + texto de la pastilla/badge (`bg-… text-…`). */
  pastilla: string;
  /** Borde de la pastilla, para los sitios que la dibujan con borde. */
  borde: string;
  /** Acento de categoría de la banda derecha de la pastilla (#911b). */
  acento: string;
  Icon: LucideIcon;
  /** Color del icono cuando va FUERA de la pastilla (badge de la tabla). */
  iconColor: string;
}

/** Clase no mapeada (incluidas las huérfanas del enum: DESCONOCIDA, etc.). */
export const CLASE_ESTILO_FALLBACK: ClaseEstilo = {
  pastilla: "bg-gray-100 text-gray-600",
  borde: "border-gray-300",
  acento: "after:bg-gray-400",
  Icon: FileQuestion,
  iconColor: "text-gray-400",
};

export const CLASE_ESTILO: Record<string, ClaseEstilo> = {
  // Los `iconColor` que no casan con el relleno (slate en DGRN, teal en DOCTRINA,
  // violet en JURISPRUDENCIA) vienen así de la leyenda del Consultor; se copian
  // tal cual para no desalinear lo que ya ve el usuario.
  RESOLUCIONES_DGRN: {
    pastilla: "bg-cyan-100 text-cyan-800",
    borde: "border-cyan-300",
    acento: "after:bg-cyan-600",
    Icon: Gavel,
    iconColor: "text-slate-600",
  },
  RESOLUCIONES_DGDEJ: {
    pastilla: "bg-red-100 text-red-800",
    borde: "border-red-300",
    acento: "after:bg-red-600",
    Icon: Gavel,
    iconColor: "text-red-600",
  },
  FUNDACIONES: {
    pastilla: "bg-orange-100 text-orange-800",
    borde: "border-orange-300",
    acento: "after:bg-orange-600",
    Icon: Building2,
    iconColor: "text-orange-600",
  },
  BIENES_MUEBLES: {
    pastilla: "bg-lime-100 text-lime-800",
    borde: "border-lime-300",
    acento: "after:bg-lime-600",
    Icon: Car,
    iconColor: "text-lime-600",
  },
  INSTRUCCIONES_DGSJFP: {
    pastilla: "bg-sky-100 text-sky-800",
    borde: "border-sky-300",
    acento: "after:bg-sky-600",
    Icon: ClipboardList,
    iconColor: "text-sky-600",
  },
  SISTEMA_NOTARIAL: {
    pastilla: "bg-indigo-100 text-indigo-800",
    borde: "border-indigo-300",
    acento: "after:bg-indigo-600",
    Icon: Stamp,
    iconColor: "text-indigo-600",
  },
  // #905 — paralelo a Sistema Notarial y separado de las resoluciones del BOE,
  // así que color propio y no un tono del índigo.
  SISTEMA_REGISTRAL: {
    pastilla: "bg-rose-100 text-rose-800",
    borde: "border-rose-300",
    acento: "after:bg-rose-600",
    Icon: BookMarked,
    iconColor: "text-rose-600",
  },
  DOCTRINA: {
    pastilla: "bg-violet-100 text-violet-800",
    borde: "border-violet-300",
    acento: "after:bg-violet-600",
    Icon: BookOpen,
    iconColor: "text-teal-600",
  },
  JURISPRUDENCIA: {
    pastilla: "bg-amber-100 text-amber-800",
    borde: "border-amber-300",
    acento: "after:bg-amber-600",
    Icon: Scale,
    iconColor: "text-violet-600",
  },
  LEGISLACION: {
    pastilla: "bg-emerald-100 text-emerald-800",
    borde: "border-emerald-300",
    acento: "after:bg-emerald-600",
    Icon: ScrollText,
    iconColor: "text-emerald-600",
  },
  // #911b — antes compartía `emerald` con LEGISLACION; con el color de categoría
  // en una banda de 5 px, dos bandas iguales se leen como la misma categoría.
  LEGISLACION_AUTONOMICA: {
    pastilla: "bg-teal-100 text-teal-800",
    borde: "border-teal-300",
    acento: "after:bg-teal-600",
    Icon: Landmark,
    iconColor: "text-teal-600",
  },
  LEGISLACION_UE: {
    pastilla: "bg-blue-100 text-blue-800",
    borde: "border-blue-300",
    acento: "after:bg-blue-600",
    Icon: Globe,
    iconColor: "text-blue-600",
  },
  // #911b — antes compartía `amber` con JURISPRUDENCIA.
  GUIAS: {
    pastilla: "bg-stone-100 text-stone-700",
    borde: "border-stone-300",
    acento: "after:bg-stone-500",
    Icon: ShieldCheck,
    iconColor: "text-stone-500",
  },
  // Biblioteca particular del propio despacho. Nunca la de otro: el listado solo
  // trae el fondo común y lo de la organización que mira.
  APORTACION_ORG: {
    pastilla: "bg-fuchsia-100 text-fuchsia-800",
    borde: "border-fuchsia-300",
    acento: "after:bg-fuchsia-600",
    Icon: Library,
    iconColor: "text-fuchsia-600",
  },
  OTROS: CLASE_ESTILO_FALLBACK,
};

/** Estilo de una clase, con el gris de cortesía si no está mapeada. */
export function claseEstilo(clase: string | null | undefined): ClaseEstilo {
  return (clase && CLASE_ESTILO[clase]) || CLASE_ESTILO_FALLBACK;
}
