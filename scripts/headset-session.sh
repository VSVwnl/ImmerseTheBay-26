#!/usr/bin/env bash
# Wait until the Quest is awake, make sure the app tab is open, then record the headset and log the page.
#   bash scripts/headset-session.sh <name> [wait_minutes] [record_minutes]
export MSYS_NO_PATHCONV=1
name=${1:-session}; waitm=${2:-30}; recm=${3:-15}
cd "$(dirname "$0")/.."
mkdir -p data/headset
end=$((SECONDS + waitm * 60))
until adb shell "dumpsys power | grep -q 'mWakefulness=Awake'"; do
  [ $SECONDS -ge $end ] && { echo "headset never woke up in ${waitm} min"; exit 1; }
  sleep 3
done
echo "$(date +%H:%M:%S) headset awake"
adb reverse tcp:5173 tcp:5173 >/dev/null; adb reverse tcp:8765 tcp:8765 >/dev/null
for i in $(seq 1 20); do
  adb forward tcp:9333 localabstract:chrome_devtools_remote >/dev/null
  curl -s --max-time 3 http://127.0.0.1:9333/json/list | grep -q 'localhost:5173' && break
  [ "$i" = 5 ] && adb shell am start -a android.intent.action.VIEW -d "'http://localhost:5173/?orbis=0'" >/dev/null
  sleep 3
done
echo "$(date +%H:%M:%S) app tab: $(curl -s --max-time 3 http://127.0.0.1:9333/json/list | grep -o 'localhost:5173[^"]*' | head -n 1)"
node scripts/quest-watch.mjs $((recm * 60)) > "data/headset/watch-$name.log" 2>&1 &
segs=$(( (recm + 2) / 3 ))
for i in $(seq 1 $segs); do
  adb shell screenrecord --time-limit 180 --bit-rate 8000000 "/sdcard/backlot-$name-$i.mp4"
  echo "$(date +%H:%M:%S) segment $i done"
done
wait
echo "$(date +%H:%M:%S) session finished"
