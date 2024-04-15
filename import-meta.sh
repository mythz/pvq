# Copy the validation files from ./questions to ./meta using rsync
rsync -av --size-only --include="*.validation.*" --exclude="*.*" ./questions/ ./meta/
# find . -name "*.validation.*" -delete
aws s3 sync s3://pvq-meta/ ./meta --size-only --exclude "*" --include "*.validation.*" --endpoint-url https://b95f38ca3a6ac31ea582cd624e6eb385.r2.cloudflarestorage.com