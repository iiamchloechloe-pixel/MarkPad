#!/bin/bash
# Offline packager: assembles MarkPad.app from the local Electron binary.
# Usage: bash build/make-app.sh   (run from project root)
set -e
cd "$(dirname "$0")/.."

SRC=node_modules/electron/dist/Electron.app
APP=dist/MarkPad.app
PB=/usr/libexec/PlistBuddy

[ -d "$SRC" ] || { echo "missing $SRC — run npm install first"; exit 1; }

echo "▸ copying Electron shell"
rm -rf "$APP"; mkdir -p dist
cp -R "$SRC" "$APP"
mv "$APP/Contents/MacOS/Electron" "$APP/Contents/MacOS/MarkPad"

echo "▸ icon"
cp build/icon.icns "$APP/Contents/Resources/icon.icns"
rm -f "$APP/Contents/Resources/electron.icns"

echo "▸ Info.plist"
P="$APP/Contents/Info.plist"
$PB -c "Set :CFBundleExecutable MarkPad" "$P"
$PB -c "Set :CFBundleIconFile icon" "$P"
$PB -c "Set :CFBundleName MarkPad" "$P"
$PB -c "Set :CFBundleIdentifier com.chloe.markpad" "$P"
$PB -c "Add :CFBundleDisplayName string MarkPad" "$P" 2>/dev/null || $PB -c "Set :CFBundleDisplayName MarkPad" "$P"
$PB -c "Set :CFBundleShortVersionString 1.0.0" "$P" 2>/dev/null || true
$PB -c "Set :CFBundleVersion 1.0.0" "$P" 2>/dev/null || true
# Document types (.md / .markdown / .txt)
$PB -c "Delete :CFBundleDocumentTypes" "$P" 2>/dev/null || true
$PB -c "Add :CFBundleDocumentTypes array" "$P"
$PB -c "Add :CFBundleDocumentTypes:0 dict" "$P"
$PB -c "Add :CFBundleDocumentTypes:0:CFBundleTypeName string Markdown Document" "$P"
$PB -c "Add :CFBundleDocumentTypes:0:CFBundleTypeRole string Editor" "$P"
$PB -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes array" "$P"
$PB -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes:0 string net.daringfireball.markdown" "$P"
$PB -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes:1 string public.plain-text" "$P"
$PB -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions array" "$P"
$PB -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:0 string md" "$P"
$PB -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:1 string markdown" "$P"
$PB -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:2 string txt" "$P"

echo "▸ app code (runtime deps only)"
RES="$APP/Contents/Resources/app"
rm -rf "$RES"; mkdir -p "$RES/node_modules/@highlightjs"
cp main.js preload.js package.json "$RES/"
cp build/dock-icon.png "$RES/icon.png"
cp -R renderer "$RES/"
cp -R node_modules/marked "$RES/node_modules/"
cp -R node_modules/dompurify "$RES/node_modules/"
cp -R node_modules/katex "$RES/node_modules/"
cp -R node_modules/@highlightjs/cdn-assets "$RES/node_modules/@highlightjs/"
mkdir -p "$RES/node_modules/@toast-ui/editor"
cp -R node_modules/@toast-ui/editor/dist "$RES/node_modules/@toast-ui/editor/"
rm -f "$APP/Contents/Resources/default_app.asar"

echo "▸ codesign (ad-hoc)"
codesign --force --deep --sign - "$APP"
codesign --verify --deep "$APP" && echo "✓ built $APP"
