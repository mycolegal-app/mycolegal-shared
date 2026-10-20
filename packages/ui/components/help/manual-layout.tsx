"use client";

import { useEffect, useState } from "react";
import { NavLink as Link } from "../shared/nav-link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  Printer,
  Search,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import { MANUAL_PROSE_CSS } from "./manual-prose-css";

export interface ManualSection {
  title: string;
  href: string;
  icon?: React.ElementType;
  children?: { title: string; href: string }[];
}

interface ManualLayoutProps {
  sections: ManualSection[];
  children: React.ReactNode;
  appName?: string;
  /**
   * #905 — Ruta de la vista de impresión del manual (`ManualPrintView`). Si se
   * da, la cabecera del índice lateral pinta un botón «Imprimir / PDF».
   */
  printHref?: string;
}

export function ManualLayout({ sections, children, appName = "Manual de Usuario", printHref }: ManualLayoutProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  // #29 (TEST) — «El índice debería reflejar la estructura del manual»: si una
  // sección no declara sus apartados (`children`), se sacan de la página abierta
  // (los `h2` de cada `<section id>` del contenido) y se listan bajo ella.
  const [autoChildren, setAutoChildren] = useState<{ title: string; href: string }[]>([]);
  useEffect(() => {
    const content = document.querySelector("[data-manual-content]");
    if (!content) return;
    const read = () => {
      const items: { title: string; href: string }[] = [];
      content.querySelectorAll<HTMLElement>("section[id]").forEach((sec) => {
        const h = sec.querySelector("h2");
        const title = h?.textContent?.trim();
        if (title && h!.closest("section[id]") === sec) items.push({ title, href: `${pathname}#${sec.id}` });
      });
      setAutoChildren((prev) =>
        prev.length === items.length && prev.every((p, i) => p.href === items[i].href && p.title === items[i].title)
          ? prev
          : items,
      );
    };
    read();
    // El contenido llega con `next/dynamic`: se vuelve a leer cuando se pinta.
    const mo = new MutationObserver(read);
    mo.observe(content, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [pathname]);

  const activeHref = sections
    .filter((s) => pathname === s.href || pathname.startsWith(s.href + "/"))
    .reduce<string | null>((best, s) => (!best || s.href.length > best.length ? s.href : best), null);

  const filteredSections = searchQuery
    ? sections.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.children?.some((c) =>
            c.title.toLowerCase().includes(searchQuery.toLowerCase())
          )
      )
    : sections;

  function handleChildClick(href: string) {
    const [path, hash] = href.split("#");

    if (hash && pathname === path) {
      // Same page: just scroll to the anchor
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else {
      // Different page: navigate (Next.js handles the hash after navigation)
      router.push(href);
    }
  }

  return (
    // Fixed-height shell so that only the content column scrolls. The aside
    // (index) and the page chrome (topbar, breadcrumb) stay in place. The
    // 8rem delta matches the other full-height pages in the app (topbar 3.5rem
    // + breadcrumb row + main's p-6 vertical padding).
    <div data-manual-layout className="flex h-[calc(100vh-8rem)] min-h-0 gap-0">
      {/* Manual sidebar — fixed column. Only its own content scrolls when the
          index grows longer than the viewport. */}
      <aside
        data-manual-sidebar
        className="w-64 shrink-0 border-r bg-gray-50 flex flex-col min-h-0"
      >
        <div className="bg-gray-50 p-4 border-b shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-5 w-5 text-cyan-600" />
            <h2 className="font-semibold text-gray-900">{appName}</h2>
          </div>

          {printHref && (
            <Link
              href={printHref}
              title={t("ui.manualPrint.printTitle")}
              className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              <Printer className="h-3.5 w-3.5" />
              {t("ui.manualPrint.printShort")}
            </Link>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en el manual..."
              className="w-full rounded-md border bg-white pl-8 pr-8 py-1.5 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
          {filteredSections.map((section) => {
            const isActive = pathname === section.href || pathname.startsWith(section.href + "/");
            const Icon = section.icon;
            // Los apartados leídos de la página van solo bajo la sección MÁS concreta que
            // casa con la ruta: `/manual` también «casa» con `/manual/x` y los repetía.
            const children = section.children ?? (isActive && section.href === activeHref ? autoChildren : undefined);

            return (
              <div key={section.href}>
                <Link
                  href={section.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-cyan-50 text-cyan-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4 shrink-0" />}
                  {section.title}
                </Link>

                {/* Subsections */}
                {children && children.length > 0 && isActive && (
                  <div className="ml-6 mt-1 space-y-0.5">
                    {children.map((child) => (
                      <button
                        key={child.href}
                        onClick={() => handleChildClick(child.href)}
                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-left transition-colors cursor-pointer text-gray-500 hover:text-gray-700"
                      >
                        <ChevronRight className="h-3 w-3 shrink-0" />
                        {child.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Content — the only scroll area of the manual. The outer <main> stays
          unscrolled because our shell height exactly matches main's content
          box. Spacing overrides live here so every manual page reads with more
          air between sections and subsections without touching each content
          file per language. */}
      <div data-manual-content className="flex-1 min-w-0 min-h-0 overflow-y-auto">
        <div
          className="manual-prose max-w-3xl mx-auto px-8 py-10 [&_section]:scroll-mt-6 [&_.space-y-8>*+*]:!mt-14 [&_h2]:!mt-2 [&_h2]:!mb-5 [&_h3]:!mt-1 [&_h3]:!mb-2.5 [&_section>*+*]:!mt-4"
        >
          <style>{MANUAL_PROSE_CSS}</style>
          {children}
        </div>
      </div>
    </div>
  );
}
