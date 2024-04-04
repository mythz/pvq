#!/bin/bash

while ! ./rank-dir-rev.mjs ./questions $1 $2
do
  sleep 1
  echo "Restarting program..."
done