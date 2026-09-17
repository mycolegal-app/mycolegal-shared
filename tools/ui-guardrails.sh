#!/usr/bin/env bash
# Guardarraíles de UI (UI_GUIDELINES.md §8 / PLAN_TECNICO_LINEA_PLATA F4).
# Uso: tools/ui-guardrails.sh <dir-app> [<dir-app>…]   (exit 1 si hay hallazgos)
# Pensado para CI o para el deploy.sh de cada app. Excluye content/manual y _obsolete_code.
set -u
fail=0
for app in "$@"; do
  src="$app/src"
  [ -d "$src" ] || { echo "skip $app (sin src/)"; continue; }
  echo "== $app"
  chk() { # $1 = descripción, $2… = grep args
    local desc="$1"; shift
    local out
    out=$(grep -rnE "$@" "$src" --include='*.tsx' 2>/dev/null | grep -vE '/content/manual/|_obsolete_code' || true)
    if [ -n "$out" ]; then
      fail=1
      echo "  ✗ $desc"
      echo "$out" | head -20 | sed 's/^/      /'
      local n; n=$(echo "$out" | wc -l | tr -d ' ')
      [ "$n" -gt 20 ] && echo "      … (+$((n-20)))"
    else
      echo "  ✓ $desc"
    fi
  }
  chk "acento a mano (usar mc-action-* / Button primary)" '(bg|text|border|ring)-(cyan|mc-primary)-[0-9]+|bg-mc-slate-700 text-white'
  chk "hex literal en clases" '(bg|text|border|ring|from|to)-\[#[0-9a-fA-F]{3,8}\]'
  chk "p-6 propio en páginas (el <main> del shell ya lo pone)" 'className="p-6"'
  out=$(grep -rnE '^\s*(return )?\(?<main\b' "$src/app" --include='*.tsx' 2>/dev/null | grep '/(dashboard)/' || true)
  if [ -n "$out" ]; then fail=1; echo "  ✗ <main> fuera del AppShell (páginas del dashboard)"; echo "$out" | head -20 | sed 's/^/      /'; else echo "  ✓ sin <main> anidado en el dashboard"; fi
  chk "fecha sin locale (usar formatDate/formatDateTime)" 'Date\([^)]*\)\.toLocale(Date)?String\(\)'
  chk "estados fuera de paleta (rose/indigo/purple/fuchsia/sky/orange)" '(bg|text|border)-(rose|indigo|purple|fuchsia|sky|orange)-[0-9]+'
  chk "rounded-xl (usar rounded-lg en tarjetas, rounded-md en controles)" '\brounded-xl\b'
  chk "confirm()/alert()/prompt() nativos (usar useConfirm/useAlert de ui)" '(^|[^A-Za-z0-9_.])(window\.)?(confirm|alert|prompt)\('
  out=$(grep -rnE '<LangToggle' "$src" --include='*.tsx' 2>/dev/null | grep -v '/layout.tsx:' | grep -v 'lang-toggle.tsx' || true)
  if [ -n "$out" ]; then fail=1; echo "  ✗ LangToggle fuera del layout"; echo "$out" | head -20 | sed 's/^/      /'; else echo "  ✓ LangToggle solo en el layout"; fi
  # h1 inline en página que ya monta PageTitle/PageShell
  out=""
  while IFS= read -r f; do
    if grep -q '<h1' "$f"; then out+="$f"$'\n'; fi
  done < <(grep -rlE '<PageTitle|<PageShell' "$src" --include='*.tsx' 2>/dev/null | grep -vE '/content/manual/|_obsolete_code')
  if [ -n "$out" ]; then fail=1; echo "  ✗ <h1> inline en página con PageTitle"; printf '%s' "$out" | sed 's/^/      /'; else echo "  ✓ sin <h1> duplicado"; fi
done
exit $fail
