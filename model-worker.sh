#!/bin/bash

while ! ./model-worker.mjs $1 $2 $3
do
  sleep 1
  echo "Restarting program..."
done
