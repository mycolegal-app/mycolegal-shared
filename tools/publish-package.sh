#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────
# publish-package.sh <ui|sharedlib> [--dry-run] [--since <ref>]
#
# Publish (o re-sincronizar) un paquete compartido DESDE el monorepo
# mycolegal-shared, y re-sincronizar SOLO las apps consumidoras AFECTADAS
# por el cambio (vía tools/affected.mjs). Unifica los antiguos
# publish-ui.sh + publish-sharedlib.sh (un repo, dos paquetes).
#
# Base de comparación de "afectadas" = tag git anterior `<pkg>-v*`.
# Tras publicar con éxito se crea/pushea el tag `<pkg>-v<version>`.
# Sin tag base (primer publish del monorepo) → conservador: TODAS.
#
# Flags:
#   --dry-run       No publica, no pushea, no bumpea; imprime qué haría.
#   --since <ref>   Override de la base (para pruebas / recomputar).
# ─────────────────────────────────────────────────────────────────────

PKG="${1:-}"; shift || true
DRY_RUN=false; SINCE_OVERRIDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --since) SINCE_OVERRIDE="${2:-}"; shift ;;
  esac; shift
done
case "$PKG" in ui|sharedlib) ;; *) echo "uso: publish-package.sh <ui|sharedlib> [--dry-run] [--since <ref>]"; exit 2 ;; esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"        # mycolegal-shared (repo raíz)
ROOT_DIR="$(cd "$SHARED_DIR/.." && pwd)"          # mycolegal-app/ (siblings)
PLATFORM_DIR="$ROOT_DIR/mycolegal-platform"

red()    { printf "\e[31m%s\e[0m\n" "$*"; }
green()  { printf "\e[32m%s\e[0m\n" "$*"; }
yellow() { printf "\e[33m%s\e[0m\n" "$*"; }
cyan()   { printf "\e[36m%s\e[0m\n" "$*"; }
dim()    { printf "\e[2m%s\e[0m\n" "$*"; }
die()    { red "  ✗ $*"; exit 1; }
run()    { if $DRY_RUN; then dim "    [dry-run] $*"; else eval "$@"; fi; }

# common.sh: listas de consumidores (apps.json), markers, _src_fingerprint
[ -f "$PLATFORM_DIR/scripts/common.sh" ] || die "no encuentro common.sh en $PLATFORM_DIR/scripts"
source "$PLATFORM_DIR/scripts/common.sh"

PKG_SCOPED="@mycolegal-app/$PKG"
PKG_DIR="$SHARED_DIR/packages/$PKG"
[ -d "$PKG_DIR" ] || die "no existe $PKG_DIR (¿monorepo montado?)"

if [ "$PKG" = "ui" ]; then
  CONSUMERS="$UI_CONSUMER_APPS"; MARKER="$PUBLISHED_UI_MARKER"; PUB_PATHS="$UI_PUBLISHED_PATHS"; FORCE_ADOPT=true
else
  CONSUMERS="$SHAREDLIB_CONSUMER_APPS"; MARKER="$PUBLISHED_SHAREDLIB_MARKER"; PUB_PATHS="$SHAREDLIB_PUBLISHED_PATHS"; FORCE_ADOPT=false
fi

$DRY_RUN && yellow "  «DRY-RUN» — no se publica, pushea ni bumpea nada."
cyan "── publish-package: $PKG (monorepo mycolegal-shared) ──"

# ── 1. Versión objetivo ──────────────────────────────────────────────
VERSION=$(node -e "console.log(require('$PKG_DIR/package.json').version)")
[ -n "$VERSION" ] || die "no pude leer la versión de packages/$PKG/package.json"

already_published=false
npm view "$PKG_SCOPED@$VERSION" version --registry=https://npm.pkg.github.com >/dev/null 2>&1 && already_published=true

# ── 2. ¿Hay cambios sin publicar en ESTE paquete? ────────────────────
# Working tree sucio bajo packages/<pkg>, o commits posteriores al último
# bump de este paquete ("<pkg>: versión X").
last_ver_commit=$(git -C "$SHARED_DIR" log --grep="^$PKG: versión " --format=%H -1 -- "packages/$PKG" 2>/dev/null || true)
commits_since_ver=""
[ -n "$last_ver_commit" ] && commits_since_ver=$(git -C "$SHARED_DIR" rev-list "${last_ver_commit}..HEAD" -- "packages/$PKG" 2>/dev/null || true)
dirty=$(git -C "$SHARED_DIR" status --porcelain -- "packages/$PKG")
has_local_changes=false
{ [ -n "$dirty" ] || [ -n "$commits_since_ver" ]; } && has_local_changes=true

WILL_PUBLISH=true
$already_published && ! $has_local_changes && WILL_PUBLISH=false

# ── 2b. Guard: publicar sólo desde main (el CI dispara on push main) ──
if $WILL_PUBLISH && ! $DRY_RUN; then
  branch=$(git -C "$SHARED_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
  [ "$branch" = "main" ] || die "publish-package debe correr desde 'main' (estás en '$branch')."
fi

# ── 3. Auto-bump patch si ya publicada y hay cambios ─────────────────
if $already_published && $has_local_changes; then
  yellow "  ⚠ $PKG_SCOPED@$VERSION ya publicada y hay cambios — auto-bump patch."
  run "( cd '$PKG_DIR' && npm version patch --no-git-tag-version >/dev/null )"
  $DRY_RUN || VERSION=$(node -e "console.log(require('$PKG_DIR/package.json').version)")
  green "  ✓ Nueva versión: $PKG_SCOPED@$VERSION"
  already_published=false
fi

# ── 3a-c. Commit + push + esperar CI + verificar en registry ─────────
if $already_published; then
  yellow "  ⚠ $PKG_SCOPED@$VERSION ya está en el registry — salto publish."
else
  if [ -n "$(git -C "$SHARED_DIR" status --porcelain -- "packages/$PKG")" ]; then
    run "git -C '$SHARED_DIR' add 'packages/$PKG'"                     # SOLO este paquete (repo compartido)
    run "git -C '$SHARED_DIR' commit -m '$PKG: versión $VERSION'"
  else
    dim "  · sin cambios pendientes en packages/$PKG — sólo push"
  fi
  run "git -C '$SHARED_DIR' push origin main"
  green "  ✓ Pushed mycolegal-shared @ $PKG $VERSION"

  if ! $DRY_RUN; then
    yellow "  ⏳ Esperando el workflow de publish (GitHub Actions)…"
    head_sha=$(git -C "$SHARED_DIR" rev-parse HEAD); run_id=""
    for _ in 1 2 3 4 5 6; do
      run_id=$(gh run list --repo mycolegal-app/mycolegal-shared --limit 5 --json databaseId,headSha \
                 --jq ".[] | select(.headSha==\"$head_sha\") | .databaseId" 2>/dev/null | head -1 || true)
      [ -n "$run_id" ] && break; sleep 5
    done
    [ -n "$run_id" ] && gh run watch "$run_id" --repo mycolegal-app/mycolegal-shared --exit-status >/dev/null 2>&1 \
      && green "  ✓ workflow OK" || yellow "  ⚠ sin run/verificable — compruebo el registry."
    verified=false
    for a in $(seq 1 10); do
      npm view "$PKG_SCOPED@$VERSION" version --registry=https://npm.pkg.github.com >/dev/null 2>&1 && { verified=true; break; }
      yellow "  ⏳ propagando en registry… ($a/10)"; sleep 5
    done
    $verified || die "no pude verificar $PKG_SCOPED@$VERSION en el registry. Revisa el workflow."
    green "  ✓ Verified: $PKG_SCOPED@$VERSION"
  fi
fi

# ── 3d. Tag <pkg>-v<version> (base para el próximo cálculo de afectadas) ──
if ! $DRY_RUN; then
  if ! git -C "$SHARED_DIR" rev-parse "refs/tags/${PKG}-v${VERSION}" >/dev/null 2>&1; then
    git -C "$SHARED_DIR" tag "${PKG}-v${VERSION}" || true
    git -C "$SHARED_DIR" push origin "refs/tags/${PKG}-v${VERSION}" 2>/dev/null || yellow "  ⚠ push del tag falló (no crítico)."
  fi
fi

# ── 4. Calcular AFECTADAS (base = tag anterior) ──────────────────────
if [ -n "$SINCE_OVERRIDE" ]; then
  SINCE="$SINCE_OVERRIDE"
else
  # tag <pkg>-v* anterior al HEAD, EXCLUYENDO el que acabamos de crear
  SINCE=$(git -C "$SHARED_DIR" describe --tags --match "${PKG}-v*" --abbrev=0 "HEAD^" 2>/dev/null || \
          git -C "$SHARED_DIR" describe --tags --match "${PKG}-v*" --abbrev=0 HEAD 2>/dev/null || true)
  [ "$SINCE" = "${PKG}-v${VERSION}" ] && SINCE=""   # si sólo existe el tag actual, no hay base
fi

AFFECTED="__ALL__"
if [ -n "$SINCE" ]; then
  if AFF_JSON=$(node "$SHARED_DIR/tools/affected.mjs" --since "$SINCE" --scope "packages/$PKG" --json 2>/dev/null); then
    AFFECTED=" $(printf '%s' "$AFF_JSON" | jq -r '.affected | join(" ")') "
    cyan "  ↻ Afectadas desde $SINCE:${AFFECTED}"
  else
    yellow "  ⚠ affected.mjs falló → conservador: TODAS."
  fi
else
  yellow "  ↻ Sin tag base → conservador: re-sincronizo TODAS las consumidoras."
fi

is_affected() { [ "$AFFECTED" = "__ALL__" ] && return 0; case "$AFFECTED" in *" mycolegal-$1 "*) return 0 ;; *) return 1 ;; esac; }

# ── 5. Re-sync del pin SOLO en las afectadas ─────────────────────────
PUBLISHED_INTEGRITY=$(npm view "$PKG_SCOPED@$VERSION" dist.integrity --registry=https://npm.pkg.github.com 2>/dev/null || true)
NAME_W=0; for app in $CONSUMERS; do [ ${#app} -gt $NAME_W ] && NAME_W=${#app}; done
FAILED=""
for app in $CONSUMERS; do
  app_dir="$ROOT_DIR/mycolegal-${app}"
  [ -f "$app_dir/package.json" ] || continue
  if ! is_affected "$app"; then
    dim "$(printf '    · %-*s  no afectada — skip (recogerá por caret en su próximo deploy)' "$NAME_W" "$app")"
    continue
  fi
  current=$(node -e "const p=require('$app_dir/package.json');console.log((p.dependencies&&p.dependencies['$PKG_SCOPED'])||(p.devDependencies&&p.devDependencies['$PKG_SCOPED'])||'')" 2>/dev/null || true)
  # sharedlib: no forzar adopción a apps que aún no lo declaran
  if [ -z "$current" ] && ! $FORCE_ADOPT; then
    dim "$(printf '    · %-*s  no declara %s — skip' "$NAME_W" "$app" "$PKG_SCOPED")"; continue
  fi
  reason=""
  if [ "$current" != "^${VERSION}" ]; then reason="bump"
  elif [ -n "$PUBLISHED_INTEGRITY" ] && [ -f "$app_dir/package-lock.json" ]; then
    lock_integrity=$(node -e "try{const l=require('$app_dir/package-lock.json');const e=l.packages&&l.packages['node_modules/$PKG_SCOPED'];process.stdout.write(e&&e.integrity?e.integrity:'')}catch(_){}" 2>/dev/null || true)
    if [ -z "$lock_integrity" ]; then reason="missing-lock-entry"; elif [ "$lock_integrity" != "$PUBLISHED_INTEGRITY" ]; then reason="drift"; fi
  fi
  if [ -z "$reason" ]; then dim "$(printf '    · %-*s  ya en ^%s — skip' "$NAME_W" "$app" "$VERSION")"; continue; fi
  if [ "$reason" = "drift" ] || [ "$reason" = "missing-lock-entry" ]; then run "rm -rf '$app_dir/node_modules/$PKG_SCOPED'"; fi
  if $DRY_RUN; then
    green "$(printf '    ✓ %-*s  %-12s → ^%s  [%s]  (dry-run)' "$NAME_W" "$app" "${current:-(sin pin)}" "$VERSION" "$reason")"
  elif ( cd "$app_dir" && npm install "$PKG_SCOPED@^${VERSION}" --save --silent ); then
    green "$(printf '    ✓ %-*s  %-12s → ^%s  [%s]' "$NAME_W" "$app" "${current:-(sin pin)}" "$VERSION" "$reason")"
  else
    yellow "$(printf '    ⚠ %-*s  npm install falló' "$NAME_W" "$app")"; FAILED="${FAILED:+$FAILED }$app"
  fi
done
[ -n "$FAILED" ] && die "bump falló en: $FAILED"

# ── 6. Fingerprint marker (para el staleness-check del deploy) ───────
if ! $DRY_RUN; then
  echo "$(_src_fingerprint "$PKG_DIR" "${PUB_PATHS/package.json/}")" > "$MARKER"
fi

green ""
green "  publish-package($PKG) completado. Consumidoras afectadas re-sincronizadas; el resto intactas."
