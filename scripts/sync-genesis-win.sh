#!/usr/bin/env bash
# Sync auth + workbench shell from WSL ~/genesis into the Windows run tree
# C:\Users\Jason\genesis-win (the copy Next often serves on port 4721).
set -euo pipefail
SRC="${SRC:-/home/jason/genesis}"
DST="${DST:-/mnt/c/Users/Jason/genesis-win}"
if [[ ! -d "$SRC/app" || ! -d "$DST/app" ]]; then
  echo "Missing SRC ($SRC) or DST ($DST)" >&2
  exit 1
fi
mkdir -p "$DST/app/login" "$DST/app/signup" "$DST/components/auth" "$DST/lib/auth" \
  "$DST/components/ui" "$DST/components/desk"
cp "$SRC/app/login/page.tsx" "$DST/app/login/"
cp "$SRC/app/signup/page.tsx" "$DST/app/signup/"
mkdir -p "$DST/app/pricing" "$DST/components/pricing"
cp "$SRC/app/pricing/page.tsx" "$DST/app/pricing/"
cp "$SRC/components/pricing/pricing-cards.tsx" "$DST/components/pricing/"
cp "$SRC/components/auth/auth-form.tsx" "$DST/components/auth/"
cp "$SRC/lib/auth/"*.ts "$DST/lib/auth/"
cp "$SRC/components/ui/input.tsx" "$DST/components/ui/"
cp "$SRC/components/ui/label.tsx" "$DST/components/ui/"
cp "$SRC/components/ui/card-hover-effect.tsx" "$DST/components/ui/" 2>/dev/null || true
cp "$SRC/components/desk/workbench-rail.tsx" "$DST/components/desk/"
cp "$SRC/components/desk/home-cards.tsx" "$DST/components/desk/"
cp "$SRC/components/desk/desk-app.tsx" "$DST/components/desk/"
cp "$SRC/app/globals.css" "$DST/app/globals.css"
echo "Synced auth + desk shell -> $DST"
echo "Hard-refresh http://localhost:4721/login and /signup"
