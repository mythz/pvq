#!/bin/bash

while ! ./rank-dir.mjs ./questions $1 $2
do
  sleep 1
  echo "Restarting program..."
done