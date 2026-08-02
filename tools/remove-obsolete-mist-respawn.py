from pathlib import Path

path = Path("departments/weather/weather-module.js")
text = path.read_text()
old = '''      bank.age = 0;
      if (!initial) {
        const depthFlow = effectiveMistDepthFlow();
        const drift = APPROVED_MIST.drift + state.wind.x;
        if (depthFlow < -0.02) bank.z = bounds.far - randomBetween(0, 0.6);
        else if (depthFlow > 0.02) bank.z = bounds.near + randomBetween(0.15, 0.65);
        if (drift > 0.02) bank.x = -bounds.halfWidth - bank.width;
        else if (drift < -0.02) bank.x = bounds.halfWidth + bank.width;
      }
'''
new = '''      bank.age = 0;
'''
count = text.count(old)
if count != 1:
    raise RuntimeError(f"expected one obsolete respawn branch, found {count}")
path.write_text(text.replace(old, new, 1))
print("Removed obsolete combined mist respawn branch.")
