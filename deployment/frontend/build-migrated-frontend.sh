#!/bin/bash
# =============================================================
# Frontend Migration Script: Supabase → Azure API Client
# =============================================================
# This script copies the main project's src/ to deployment/frontend/src/
# and applies all necessary replacements automatically.
#
# Usage: cd <project-root> && bash deployment/frontend/build-migrated-frontend.sh
# =============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET="$SCRIPT_DIR/src"

echo "=== Frontend Migration Script ==="
echo "Source: $PROJECT_ROOT/src"
echo "Target: $TARGET"
echo ""

# 1. Clean target (except already-prepared files)
echo "[1/6] Cleaning target directory..."
rm -rf "$TARGET/pages" "$TARGET/components" "$TARGET/hooks" "$TARGET/lib" "$TARGET/assets" "$TARGET/i18n"
rm -f "$TARGET/App.tsx" "$TARGET/App.css" "$TARGET/main.tsx" "$TARGET/index.css" "$TARGET/vite-env.d.ts"

# 2. Copy entire src/ from main project
echo "[2/6] Copying src/ from main project..."
cp -r "$PROJECT_ROOT/src/pages" "$TARGET/pages"
cp -r "$PROJECT_ROOT/src/components" "$TARGET/components"
cp -r "$PROJECT_ROOT/src/lib" "$TARGET/lib"
cp -r "$PROJECT_ROOT/src/assets" "$TARGET/assets"
cp -r "$PROJECT_ROOT/src/i18n" "$TARGET/i18n"
cp "$PROJECT_ROOT/src/App.tsx" "$TARGET/App.tsx"
cp "$PROJECT_ROOT/src/App.css" "$TARGET/App.css"
cp "$PROJECT_ROOT/src/main.tsx" "$TARGET/main.tsx"
cp "$PROJECT_ROOT/src/index.css" "$TARGET/index.css"
cp "$PROJECT_ROOT/src/vite-env.d.ts" "$TARGET/vite-env.d.ts"

# Don't copy integrations/ - we use api/ instead
# The api/ directory already exists with client.ts and auth.ts

# 3. Copy hooks directory but we'll overwrite useAuth.tsx
echo "[3/6] Copying hooks..."
cp -r "$PROJECT_ROOT/src/hooks" "$TARGET/hooks"

# 4. Overwrite with Azure-specific files
echo "[4/6] Overwriting Azure-specific files..."
cp "$SCRIPT_DIR/src/hooks/useAuth.tsx" "$TARGET/hooks/useAuth.tsx"
cp "$SCRIPT_DIR/src/pages/Auth.tsx" "$TARGET/pages/Auth.tsx"

# 5. Apply find & replace across all .ts and .tsx files
echo "[5/6] Applying Supabase → API replacements..."

# macOS vs Linux sed compatibility
if [[ "$OSTYPE" == "darwin"* ]]; then
  SED_CMD="sed -i ''"
else
  SED_CMD="sed -i"
fi

find "$TARGET" -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/api/*" | while read file; do
  # Replace import statement
  $SED_CMD "s|import { supabase } from '@/integrations/supabase/client';|import { api } from '@/api/client';|g" "$file"
  $SED_CMD 's|import { supabase } from "@/integrations/supabase/client";|import { api } from "@/api/client";|g' "$file"
  
  # Replace supabase.from( → api.from(
  $SED_CMD 's|supabase\.from(|api.from(|g' "$file"
  
  # Replace supabase.functions.invoke( → api.functions.invoke(
  $SED_CMD 's|supabase\.functions\.invoke(|api.functions.invoke(|g' "$file"
  
  # Replace supabase.channel( → api.channel(
  $SED_CMD 's|supabase\.channel(|api.channel(|g' "$file"
  
  # Replace supabase.removeChannel( → api.removeChannel(
  $SED_CMD 's|supabase\.removeChannel(|api.removeChannel(|g' "$file"
  
  # Replace supabase.auth.getUser() → (handled by useAuth hook, but keep for compatibility)
  $SED_CMD 's|supabase\.auth\.getUser()|api.auth.getUser()|g' "$file"
  
  # Remove Supabase type imports (Json type)
  $SED_CMD "s|import type { Json } from '@/integrations/supabase/types';|// Json type - use 'any' or define locally|g" "$file"
  $SED_CMD "s|import { Json } from '@/integrations/supabase/types';|// Json type - use 'any' or define locally|g" "$file"
  
  # Remove Supabase auth imports
  $SED_CMD "s|import { User, Session } from '@supabase/supabase-js';|// Types handled by Azure AD auth|g" "$file"
done

# 6. Remove integrations directory if accidentally copied
rm -rf "$TARGET/integrations"

echo "[6/6] Done!"
echo ""
echo "=== Migration Complete ==="
echo "Next steps:"
echo "  1. Review the generated files in $TARGET"
echo "  2. Add 'type Json = any;' where needed in files that used Json type"
echo "  3. Run: npm install @azure/msal-browser @azure/msal-react"
echo "  4. Run: npm uninstall @supabase/supabase-js"
echo "  5. Update .env with Azure variables"
echo ""
