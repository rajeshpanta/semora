#!/usr/bin/env python3
"""Host-side native probe for the navigation runner (read-only).

The UI test writes <out>/probe/<n>.req; this answers with <n>.resp after briefly
attaching lldb to the Semora process on the given simulator and reading native
state. It never changes anything in the app.

  rootstack  number of screens in the root UINavigationController (one per route
             in the app's root stack; presented modals are not counted) + classes
  backstate  userInteractionEnabled of the bar's back-button wrapper, as found by
             react-native-screens' own lookup (the view its iOS 26 code disables)
"""
import argparse, os, re, subprocess, sys, time

NC = ("(UINavigationController *)[[[[[[UIApplication sharedApplication] windows] firstObject] "
      "rootViewController] childViewControllers] firstObject]")
EXPR = {
    "rootstack": [
        f"expr -l objc -- (long)[[{NC} viewControllers] count]",
        f"expr -l objc -O -- [{NC} viewControllers]",
    ],
    "backstate": [
        f"expr -l objc -- (BOOL)[(UIView *)[[{NC} navigationBar] rnscreens_findBackButtonWrapperView] isUserInteractionEnabled]",
        f"expr -l objc -O -- (id)[[{NC} navigationBar] rnscreens_findBackButtonWrapperView]",
    ],
}


def semora_pid(udid):
    out = subprocess.run(["pgrep", "-f", f"CoreSimulator/Devices/{udid}/.*\\.app/Semora$"], capture_output=True, text=True).stdout.split()
    return out[0] if out else None


def answer(udid, cmd):
    pid = semora_pid(udid)
    if not pid:
        return "error=no-semora-process"
    if cmd not in EXPR:
        return f"error=unknown-command {cmd}"
    args = ["lldb", "-p", pid, "--batch"]
    for e in EXPR[cmd]:
        args += ["-o", e]
    args += ["-o", "process detach"]
    p = subprocess.run(args, capture_output=True, text=True, timeout=60)
    text = p.stdout
    if cmd == "rootstack":
        m = re.search(r"\(long\) \$\d+ = (\d+)", text)
        classes = re.findall(r"<(RNS\w+|UI\w+): 0x[0-9a-f]+>", text)
        return f"count={m.group(1) if m else -1} vcs={','.join(classes)}"
    if cmd == "backstate":
        m = re.search(r"\(BOOL\) \$\d+ = (YES|NO|true|false)", text)
        btn = re.search(r"<_UIButtonBarButton:? 0x[0-9a-f]+", text) or re.search(r"<\w+:? 0x[0-9a-f]+", text)
        return f"userInteractionEnabled={m.group(1) if m else '?'} view={btn.group(0) if btn else 'nil'}"
    return text[-400:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--udid", required=True)
    ap.add_argument("--dir", required=True, help="<out>/probe")
    a = ap.parse_args()
    os.makedirs(a.dir, exist_ok=True)
    done = set()
    while True:
        for f in sorted(os.listdir(a.dir)):
            if not f.endswith(".req") or f in done:
                continue
            n = f[:-4]
            cmd = open(os.path.join(a.dir, f)).read().strip()
            try:
                r = answer(a.udid, cmd)
            except Exception as e:  # never leave the test waiting
                r = f"error={e!r}"
            with open(os.path.join(a.dir, n + ".resp.tmp"), "w") as fh:
                fh.write(r + "\n")
            os.rename(os.path.join(a.dir, n + ".resp.tmp"), os.path.join(a.dir, n + ".resp"))
            done.add(f)
            print(f"probe {n} {cmd}: {r}", flush=True)
        time.sleep(0.2)


if __name__ == "__main__":
    sys.exit(main())
