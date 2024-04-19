#!/bin/bash

while ! ./ranking-worker.ts $1 $2
do
  sleep 1
  echo "Restarting program..."
done