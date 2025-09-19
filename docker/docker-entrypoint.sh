#!/bin/sh
set -e

BOT_ID="${1:-${BOT_ID:-01}}"

exec node /app/chatbot.js -b "$BOT_ID"
