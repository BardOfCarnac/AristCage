from pathlib import Path
import os
import subprocess


def replace_once(path, old, new):
    source = Path(path).read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one replacement, found {count}')
    Path(path).write_text(source.replace(old, new, 1))


replace_once('js/dripfeed-chamber-integration.js', """    target.style.removeProperty?.('max-height');
    target.style.removeProperty?.('transform-origin');
    delete target.dataset.chamberReaderFit;
""", """    target.style.removeProperty?.('max-height');
    target.style.removeProperty?.('transform-origin');
    target.style.removeProperty?.('align-self');
    delete target.dataset.chamberReaderFit;
""")

replace_once('js/dripfeed-chamber-integration.js', """    target.style.setProperty('max-height', `${layoutMaxHeight}px`);
    target.style.setProperty('transform-origin', '50% 0');
    target.dataset.chamberReaderFit = 'contained';
""", """    target.style.setProperty('max-height', `${layoutMaxHeight}px`);
    target.style.setProperty('transform-origin', '50% 0');
    target.style.setProperty('align-self', 'start');
    target.dataset.chamberReaderFit = 'contained';
""")

replace_once('tests/dripfeed-fixed-band-contract.test.js', """  "target.style.setProperty('max-height'",
  "target.style.setProperty('transform-origin', '50% 0')"
""", """  "target.style.setProperty('max-height'",
  "target.style.setProperty('transform-origin', '50% 0')",
  "target.style.setProperty('align-self', 'start')"
""")

replace_once('docs/DRIPFEED-CHAMBER-INTEGRATION.md', """- the target scales from `50% 0`, keeping its upper controls below the shared rail;
- before applying the camera-derived foreground scale, Integration inversely fits the reader's layout width and maximum height to the overlay content box;
""", """- the target scales from `50% 0` and aligns to the top of the overlay grid, keeping its upper controls below the shared rail;
- before applying the camera-derived foreground scale, Integration inversely fits the reader's layout width and maximum height to the overlay content box;
""")

subprocess.run(['git', 'config', 'user.name', 'AristCage Integration'], check=True)
subprocess.run(['git', 'config', 'user.email', 'integration@aristcage.invalid'], check=True)
subprocess.run([
    'git', 'add',
    'js/dripfeed-chamber-integration.js',
    'tests/dripfeed-fixed-band-contract.test.js',
    'docs/DRIPFEED-CHAMBER-INTEGRATION.md'
], check=True)
subprocess.run(['git', 'commit', '-m', 'Top-align the scaled Dripfeed reader'], check=True)
subprocess.run(['git', 'push', 'origin', f"HEAD:{os.environ['HEAD_REF']}"], check=True)
