#!/usr/bin/env bash
# Builds the dashboard and status-page images for jg-vps on this Mac and hands them over
# by SSH. jg-vps needs 20+ minutes per Next.js build under its 3 GB builder cap and ran out
# of memory on 21.10.; here it takes minutes (amd64 through Rosetta in OrbStack).
#
# The key may only run jg-prebuild-receive on the host (authorized_keys `command=`), so this
# script can announce a build, load an image and read what it needs, nothing else. If it
# fails or the Mac is off, jg-deploy builds on the host after its wait (PREBUILD_WAIT).
#
#   ops/vps-prebuild.sh            builds HEAD
set -euo pipefail

KEY="${VPS_PREBUILD_KEY:-$HOME/.ssh/jg-vps-prebuild}"
HOST="${VPS_PREBUILD_HOST:-root@213.199.48.214}"
# Only this key: no ~/.ssh/config, no agent. An agent would offer a full root key first and
# the arguments would run as a plain shell command instead of the forced one.
vps() {
  ssh -F /dev/null -i "$KEY" -o IdentitiesOnly=yes -o IdentityAgent=none -o BatchMode=yes \
    -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$HOME/.ssh/known_hosts" "$HOST" "$@"
}

sha=$(git rev-parse HEAD)
info=$(vps info)
field() { sed -n "s/^$1=//p" <<<"$info"; }
deployed=$(field deployed)
ignore=$(field ignore)
site_key=$(field NEXT_PUBLIC_TURNSTILE_SITE_KEY)

if [ -n "$deployed" ] && git cat-file -e "$deployed^{commit}" 2>/dev/null; then
  changed=$(git diff --name-only "$deployed" "$sha" | grep -Ev "$ignore" || true)
else
  changed=.
fi

targets=()
grep -Eq "$(field watch_dashboard)" <<<"$changed" && targets+=(dashboard)
grep -Eq "$(field watch_status_page)" <<<"$changed" && targets+=(status-page)
if [ ${#targets[@]} -eq 0 ]; then
  echo "nothing for the Mac to build between ${deployed:0:7} and ${sha:0:7}"
  exit 0
fi

vps start "$sha"
trap 'vps abort || true' ERR

for svc in "${targets[@]}"; do
  case "$svc" in
    dashboard) image=oeffigo-status-dashboard ;;
    status-page) image=oeffigo-status-page ;;
  esac
  tag="$image:prebuilt-$sha"
  echo "building $svc for ${sha:0:7}"
  docker buildx build --platform linux/amd64 --load \
    -f "ops/$svc.Dockerfile" \
    --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY="$site_key" \
    --build-arg SOURCE_COMMIT_SHA="$sha" \
    -t "$tag" .
  echo "sending $svc"
  docker save "$tag" | gzip -1 | vps load "$tag"
  docker rmi "$tag" >/dev/null
done
echo "handed over: ${targets[*]}"
