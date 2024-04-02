#!/bin/bash

countStart=$(find questions -name "*.a.$1.json" | wc -l)

while ! ./ask-dir-rev.mjs questions $1 $2 11434 $countStart
do
  sleep 1
  echo "Restarting program..."
done