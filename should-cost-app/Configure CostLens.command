#!/bin/bash
# ================================================================
# CostLens — Configure
# Double-click to update your API key and other settings.
# No need to restart — settings take effect on next Start.
# ================================================================

cd "$(dirname "$0")"

# Create .env if it doesn't exist yet
if [ ! -f ".env" ]; then
  echo "# CostLens environment" > .env
  echo "ANTHROPIC_API_KEY=" >> .env
  echo "ANTHROPIC_MODEL=claude-sonnet-4-6" >> .env
  echo "SMTP_HOST=" >> .env
  echo "SMTP_PORT=587" >> .env
  echo "SMTP_USER=" >> .env
  echo "SMTP_PASS=" >> .env
  echo "SMTP_FROM=costlens@no-reply.local" >> .env
fi

CURRENT_KEY=$(grep '^ANTHROPIC_API_KEY=' .env 2>/dev/null | cut -d= -f2- | tr -d '[:space:]"'"'" )
KEY_DISPLAY=""
if [ -n "$CURRENT_KEY" ]; then
  KEY_DISPLAY="Current key: ${CURRENT_KEY:0:16}..."
else
  KEY_DISPLAY="No API key set (using demo AI mode)"
fi

CHOICE=$(osascript <<APPLESCRIPT
set theResult to display dialog "CostLens Configuration\n\n${KEY_DISPLAY}\n\nWhat would you like to do?" buttons {"Close", "Remove API Key", "Update API Key"} default button "Update API Key" with title "CostLens — Configure" with icon note
return button returned of theResult
APPLESCRIPT
)

if [ "$CHOICE" = "Update API Key" ]; then
  NEW_KEY=$(osascript <<'APPLESCRIPT'
set theResult to display dialog "Paste your Anthropic API key.\n\nGet one free at: https://console.anthropic.com/\n(Starts with sk-ant-...)" default answer "" with hidden answer with title "CostLens — Update API Key" buttons {"Cancel", "Save"} default button "Save"
if button returned of theResult is "Cancel" then return ""
return text returned of theResult
APPLESCRIPT
  )

  NEW_KEY=$(echo "$NEW_KEY" | tr -d '[:space:]')
  if [ -n "$NEW_KEY" ]; then
    if grep -q '^ANTHROPIC_API_KEY=' .env; then
      sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${NEW_KEY}|" .env
    else
      echo "ANTHROPIC_API_KEY=${NEW_KEY}" >> .env
    fi
    osascript -e 'display dialog "API key saved!\n\nRestart CostLens for the change to take effect:\n• Double-click \"Stop CostLens.command\"\n• Then double-click \"Start CostLens.command\"" buttons {"OK"} default button "OK" with title "CostLens — Key Saved" with icon note'
  else
    osascript -e 'display dialog "No key entered — nothing was changed." buttons {"OK"} default button "OK" with title "CostLens" with icon note'
  fi

elif [ "$CHOICE" = "Remove API Key" ]; then
  CONFIRM=$(osascript -e 'display dialog "Remove the API key?\n\nAI buttons will switch to demo mode." buttons {"Cancel","Remove"} default button "Remove" with title "CostLens" with icon caution' | grep -o 'button returned:[^,]*' | cut -d: -f2 | tr -d ' ')
  if [ "$CONFIRM" = "Remove" ]; then
    sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=|" .env
    osascript -e 'display dialog "Key removed. Restart CostLens for the change to take effect." buttons {"OK"} default button "OK" with title "CostLens" with icon note'
  fi
fi
