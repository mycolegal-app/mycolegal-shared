"use client";

import { PlayCircle, Search } from "lucide-react";
import { NavLink as Link } from "./nav-link";
import { useI18n } from "../i18n/i18n-context";

const BTN_DISABLED =
  "flex h-8 w-8 items-center justify-center rounded text-white/30 cursor-not-allowed";

export function DefaultHelpButton({ manualHref = "/manual" }: { manualHref?: string }) {
  const { t } = useI18n();
  return (
    <Link
      href={manualHref}
      aria-label={t("ui.header.helpAria")}
      title={t("ui.header.helpTitle")}
      className="flex h-8 items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-2.5 text-xs font-medium text-white hover:bg-white/20"
    >
      <PlayCircle className="h-4 w-4" />
      <span className="hidden md:inline">{t("ui.header.helpButton")}</span>
    </Link>
  );
}

export function DefaultSearchButton() {
  const { t } = useI18n();
  return (
    <button
      type="button"
      disabled
      aria-label={t("ui.header.searchAria")}
      title={t("ui.header.searchUnavailable")}
      className={BTN_DISABLED}
    >
      <Search className="h-4 w-4" />
    </button>
  );
}
