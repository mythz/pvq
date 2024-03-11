#!/bin/bash
while ! ./ask-dir.mjs questions/000 
do
  sleep 1
  echo "Restarting program..."
done