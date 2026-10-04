"""Installed Android smoke check; all tap coordinates come from fresh UI XML bounds."""
import pathlib
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PACKAGE = "io.github.stickmanned.dishdeals"
SERIAL = "emulator-5554"
OUT = pathlib.Path("android-qa")
OUT.mkdir(exist_ok=True)


def adb(*args, binary=False, check=True):
    return subprocess.run(["adb", "-s", SERIAL, *args], capture_output=True,
                          text=not binary, check=check, timeout=25).stdout


def tree(label):
    result = adb("exec-out", "uiautomator", "dump", "/dev/tty")
    start = result.find("<?xml")
    end = result.rfind("</hierarchy>") + len("</hierarchy>")
    if start < 0 or end < start:
        raise RuntimeError("Android UI tree unavailable: " + result[:200])
    xml = result[start:end]
    (OUT / (label + ".xml")).write_text(xml, encoding="utf-8")
    return ET.fromstring(xml)


def visible(label, expected, timeout=40):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        root = tree(label)
        for node in root.iter("node"):
            if any(expected in node.get(key, "") for key in ("text", "content-desc")):
                return node
        time.sleep(1)
    raise AssertionError(f"Missing {expected!r} in {label}")


def tap(label, expected):
    node = visible(label, expected)
    bounds = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
    assert len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1]
    adb("shell", "input", "tap", str((bounds[0] + bounds[2]) // 2), str((bounds[1] + bounds[3]) // 2))
    time.sleep(1)


def screenshot(name):
    (OUT / (name + ".png")).write_bytes(adb("exec-out", "screencap", "-p", binary=True))


def share(url):
    adb("shell", "am", "start", "-a", "android.intent.action.SEND", "-t", "text/plain",
        "-n", PACKAGE + "/.MainActivity", "--es", "android.intent.extra.TEXT", url)


try:
    subprocess.run(["adb", "start-server"], check=True, capture_output=True)
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        try:
            if adb("shell", "getprop", "sys.boot_completed", check=False).strip() == "1":
                break
        except subprocess.TimeoutExpired:
            pass
        time.sleep(2)
    else:
        raise RuntimeError("Android emulator did not boot")
    adb("shell", "input", "keyevent", "82")
    adb("shell", "settings", "put", "global", "window_animation_scale", "0")
    adb("shell", "settings", "put", "global", "transition_animation_scale", "0")
    adb("install", "-r", sys.argv[1])
    adb("logcat", "-c")
    adb("shell", "am", "start", "-n", PACKAGE + "/.MainActivity")
    visible("discover", "Find your next good meal.")
    screenshot("discover")
    # Exercise a cold-launch share, then the warm-launch draft protection path.
    adb("shell", "am", "force-stop", PACKAGE)
    first = "https://www.instagram.com/reel/AndroidShareTest/"
    share(first)
    visible("cold-share", "Open shared text?")
    screenshot("incoming-share")
    tap("accept-share", "Use shared text")
    visible("post", first)
    visible("post-button", "Find the offer")
    screenshot("post")
    share("https://example.com/second-offer")
    visible("warm-share", "This replaces your current source")
    tap("keep-draft", "Keep current draft")
    visible("preserved-draft", first)
    # Back returns to Discover without losing the source in the active app session.
    adb("shell", "input", "keyevent", "4")
    visible("back", "Find your next good meal.")
    screenshot("back-to-discover")
    crashes = adb("logcat", "-b", "crash", "-d")
    assert "FATAL EXCEPTION" not in crashes, crashes
    (OUT / "result.txt").write_text("PASS: installed APK, Discover, cold/warm text shares, draft protection, Back, no native crash. No offers submitted.\n")
finally:
    (OUT / "logcat.txt").write_text(adb("logcat", "-d", check=False), encoding="utf-8")
    (OUT / "crashes.txt").write_text(adb("logcat", "-b", "crash", "-d", check=False), encoding="utf-8")
