from pathlib import Path
import os
import subprocess


def replace_once(path, old, new):
    source = Path(path).read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one replacement, found {count}')
    Path(path).write_text(source.replace(old, new, 1))


replace_once('tests/dripfeed-chamber-integration.test.js', """  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  append(...nodes) {
    nodes.forEach(node => {
      node.parent = this;
      node.isConnected = true;
      this.children.push(node);
    });
  }
""", """  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  matches(selector) {
    if (selector === '[data-reader-target]') return Object.prototype.hasOwnProperty.call(this.dataset, 'readerTarget');
    if (selector.startsWith('.')) return this.className.split(/\\s+/).includes(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    return false;
  }
  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches?.(selector)) return current;
      current = current.parentElement || current.parent || null;
    }
    return null;
  }
  append(...nodes) {
    nodes.forEach(node => {
      node.parent = this;
      node.parentElement = this;
      node.isConnected = true;
      this.children.push(node);
    });
  }
""")

replace_once('tests/dripfeed-chamber-integration.test.js', """  querySelector(selector) {
    if (selector.startsWith('#')) return this.children.find(child => child.id === selector.slice(1)) || null;
    return null;
  }
""", """  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches?.(selector)) return child;
      const nested = child.querySelector?.(selector);
      if (nested) return nested;
    }
    return null;
  }
""")

replace_once('tests/dripfeed-chamber-integration.test.js', """reader = new FakeElement('', 'reader-card');
reader.rect = { left: 160, top: 120, right: 840, bottom: 700, width: 680, height: 580 };
reader.computedTransform = 'matrix(1.08, 0, 0, 1.08, 0, 0)';
root.dispatchEvent(new CustomEvent('dripfeed:open-transmission-ready', {
""", """const readerOverlay = new FakeElement('', 'reader-overlay');
readerOverlay.clientWidth = 1000;
readerOverlay.clientHeight = 736;
readerOverlay.rect = { left: 0, top: 64, right: 1000, bottom: 800, width: 1000, height: 736 };
const readerTargetElement = new FakeElement('', 'reader-target');
readerTargetElement.dataset.readerTarget = '';
readerTargetElement.offsetWidth = 680;
readerTargetElement.rect = { left: 160, top: 64, right: 840, bottom: 644, width: 680, height: 580 };
reader = new FakeElement('', 'reader-card');
reader.rect = { left: 160, top: 64, right: 840, bottom: 644, width: 680, height: 580 };
reader.computedTransform = 'matrix(1.08, 0, 0, 1.08, 0, 0)';
root.append(readerOverlay);
readerOverlay.append(readerTargetElement);
readerTargetElement.append(reader);
root.dispatchEvent(new CustomEvent('dripfeed:open-transmission-ready', {
""")

replace_once('tests/dripfeed-chamber-integration.test.js', """root.dispatchEvent(new CustomEvent('dripfeed:close-transmission', { detail: { token: 8, postId: 'B' } }));
assert.equal(bridge.snapshot().readingState, 'idle');

application = 'redwire';
""", """root.dispatchEvent(new CustomEvent('dripfeed:close-transmission', { detail: { token: 8, postId: 'B' } }));
assert.equal(bridge.snapshot().readingState, 'idle');
assert.equal(readerTargetElement.style.getPropertyValue('width'), '', 'close must clear target width');
assert.equal(readerTargetElement.style.getPropertyValue('transform-origin'), '', 'close must clear target origin');
assert.equal(readerTargetElement.style.getPropertyValue('align-self'), '', 'close must clear target alignment');
assert.equal(reader.style.getPropertyValue('max-height'), '', 'close must clear the scrolling-card height cap');
assert.equal(readerTargetElement.dataset.chamberReaderFit, undefined);
assert.equal(reader.dataset.chamberReaderFit, undefined);

application = 'redwire';
""")

subprocess.run(['git', 'config', 'user.name', 'AristCage Integration'], check=True)
subprocess.run(['git', 'config', 'user.email', 'integration@aristcage.invalid'], check=True)
subprocess.run(['git', 'add', 'tests/dripfeed-chamber-integration.test.js'], check=True)
subprocess.run(['git', 'commit', '-m', 'Model retained reader references in the chamber harness'], check=True)
subprocess.run(['git', 'push', 'origin', f"HEAD:{os.environ['HEAD_REF']}"], check=True)
