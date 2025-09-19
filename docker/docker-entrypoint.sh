#!/bin/sh
set -e

CONFIG_FILE="/app/config.ini"
CONFIG_TEMPLATE="/app/config.ini.tpl"
MOUNTED_CONFIG="/config/config.ini"

if [ -f "$MOUNTED_CONFIG" ]; then
    echo "Loading configuration from $MOUNTED_CONFIG."
    cp "$MOUNTED_CONFIG" "$CONFIG_FILE"
elif [ ! -f "$CONFIG_FILE" ] && [ -f "$CONFIG_TEMPLATE" ]; then
    echo "No external config.ini provided; using template defaults."
    cp "$CONFIG_TEMPLATE" "$CONFIG_FILE"
fi

if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: config.ini not found. Provide one in ../config or include it in the image." >&2
    exit 1
fi

BOT_ID="${1:-${BOT_ID:-01}}"

exec node /app/chatbot.js -b "$BOT_ID"
