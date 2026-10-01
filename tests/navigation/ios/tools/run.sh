#!/bin/zsh
# Run one navigation scenario against the Semora app installed on a simulator.
#
#   tests/navigation/ios/tools/run.sh --udid <SIMULATOR UDID> --scenario back-normal [--out <dir>] [--free-account]
#
# The simulator must already be booted, with Semora installed and signed in.
# Builds the runner once (Xcode's current toolchain is fine: the runner is not
# Semora) into $NAVGATE_BUILD (default: $TMPDIR/semora-navgate-build), starts the
# native probe, runs the scenario, prints summary.json. A failing expectation
# does not trigger Xcode's sysdiagnose collection (it times out after 10 min).
# Output defaults to $TMPDIR/semora-navgate/<scenario>-<udid>-<time>; nothing
# is written in the repo.
set -euo pipefail
HERE=${0:A:h}
IOS=${HERE:h}
UDID="" SCEN="" OUT="" FREE=0
while (( $# )); do
  case $1 in
    --udid) UDID=$2; shift 2;;
    --scenario) SCEN=$2; shift 2;;
    --out) OUT=$2; shift 2;;
    --free-account) FREE=1; shift;;
    *) echo "unknown argument $1" >&2; exit 2;;
  esac
done
[[ -z $UDID || -z $SCEN ]] && { echo "usage: run.sh --udid <UDID> --scenario <name|path> [--out <dir>] [--free-account]" >&2; exit 2; }
[[ -f $SCEN ]] || SCEN=$IOS/scenarios/$SCEN.nav
[[ -f $SCEN ]] || { echo "no scenario $SCEN" >&2; exit 2; }
SCEN=${SCEN:A}
TMPROOT=${TMPDIR:-/tmp}
BUILD=${NAVGATE_BUILD:-$TMPROOT/semora-navgate-build}
[[ -z $OUT ]] && OUT=$TMPROOT/semora-navgate/${SCEN:t:r}-${UDID[1,8]}-$(date +%Y%m%d-%H%M%S)
mkdir -p $OUT/probe $BUILD
rm -rf $OUT/result.xcresult   # xcodebuild refuses to overwrite one

# Build the runner if it is missing or older than its sources.
XCTESTRUN=$(ls $BUILD/dd/Build/Products/*.xctestrun 2>/dev/null | head -1 || true)
NEWEST_SRC=$(ls -t $IOS/project.yml $IOS/UITests/*.swift $IOS/Host/*.swift | head -1)
if [[ -z $XCTESTRUN || $NEWEST_SRC -nt $XCTESTRUN ]]; then
  echo "building runner into $BUILD ..."
  xcodegen generate --spec $IOS/project.yml --project $BUILD --quiet
  xcodebuild build-for-testing -project $BUILD/NavGate.xcodeproj -scheme NavGateUITests \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath $BUILD/dd -quiet
  XCTESTRUN=$(ls $BUILD/dd/Build/Products/*.xctestrun | head -1)
fi

python3 $HERE/native_probe.py --udid $UDID --dir $OUT/probe > $OUT/probe.log 2>&1 &
PROBE=$!
trap 'kill $PROBE 2>/dev/null || true' EXIT

echo "scenario ${SCEN:t}  simulator $UDID  out $OUT"
set +e
TEST_RUNNER_NAVGATE_SCENARIO=$SCEN TEST_RUNNER_NAVGATE_OUT=$OUT TEST_RUNNER_NAVGATE_FREE_ACCOUNT=$FREE \
  xcodebuild test-without-building -xctestrun $XCTESTRUN -destination "id=$UDID" \
  -only-testing:NavGateUITests/NavGateTests/testScenario \
  -collect-test-diagnostics never -resultBundlePath $OUT/result.xcresult > $OUT/xcodebuild.log 2>&1
RC=$?
set -e
grep -E "NAVGATE .*(cycle|rootstack|tabfreeze|expect|NOT FOUND|REFUSED|UNKNOWN|NOTE|skipped)" $OUT/xcodebuild.log | sed 's/^.*NAVGATE [0-9.]* //' || true
grep -E "Test Case .*(passed|failed|skipped)|error: -\[|\*\* TEST" $OUT/xcodebuild.log | tail -5 || true
[[ -f $OUT/summary.json ]] && cat $OUT/summary.json
exit $RC
