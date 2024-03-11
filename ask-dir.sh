#!/bin/bash

while ! ./ask-dir.mjs questions $1 $2
do
  sleep 1
  echo "Restarting program..."
done