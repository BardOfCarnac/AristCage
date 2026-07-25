(async () => {
  "use strict";

  const results = document.getElementById("results");
  const target = document.getElementById("target");
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  function report(name, passed, detail = "") {
    const item = document.createElement("li");
    item.className = passed ? "pass" : "fail";
    item.textContent = `${passed ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`;
    results.append(item);
    if (!passed) console.error(name, detail);
  }

  const overlays = () => document.querySelectorAll(".ncn-effect-overlay").length;
  await NCNEffects.init();
  NCNViewerLifecycle.transition(NCNViewerLifecycle.STATES.READY, { force: true, reason: "effects-test" });

  try {
    const handle = NCNEffects.play("glow-pulse", target, { duration: 80, seed: 1 });
    const result = await handle.finished;
    report("play by registered name", result.status === "completed");
    report("normal completion leaves no overlay", overlays() === 0, `overlays=${overlays()}`);
  } catch (error) { report("play by registered name", false, error.message); }

  try {
    const handle = NCNEffects.play("signal-fault", target, { duration: 500, seed: 2 });
    await sleep(70);
    handle.cancel("test");
    const result = await handle.finished;
    await sleep(20);
    report("cancel halfway", result.status === "cancelled");
    report("cancel cleans every overlay", overlays() === 0, `overlays=${overlays()}`);
  } catch (error) { report("cancel halfway", false, error.message); }

  try {
    for (let index = 0; index < 8; index += 1) {
      NCNEffects.play("static-burst", target, {
        duration: 90,
        seed: index,
        concurrency: "replace"
      });
      await sleep(15);
    }
    await sleep(180);
    report("rapid replay leaves no duplicate wrappers", overlays() === 0, `overlays=${overlays()}`);
  } catch (error) { report("rapid replay", false, error.message); }

  try {
    const order = [];
    NCNEffects.register("queue-test", {
      duration: 65,
      maxFps: 60,
      create({ options }) {
        order.push(`start-${options.marker}`);
        return { cleanup: () => order.push(`end-${options.marker}`) };
      }
    });
    const first = NCNEffects.play("queue-test", target, { marker: 1, channel: "queue", concurrency: "queue" });
    const second = NCNEffects.play("queue-test", target, { marker: 2, channel: "queue", concurrency: "queue" });
    const third = NCNEffects.play("queue-test", target, { marker: 3, channel: "queue", concurrency: "queue" });
    await Promise.all([first.finished, second.finished, third.finished]);
    report("queued effects start and end in order", order.join(",") === "start-1,end-1,start-2,end-2,start-3,end-3", order.join(","));
  } catch (error) { report("queued effects", false, error.message); }

  try {
    const low = NCNEffects.play("displacement", target, { duration: 500, priority: 1, concurrency: "replace" });
    await sleep(30);
    const high = NCNEffects.play("displacement", target, { duration: 70, priority: 99, concurrency: "replace" });
    const [lowResult, highResult] = await Promise.all([low.finished, high.finished]);
    report("higher-priority replacement cancels lower effect", lowResult.reason === "replaced" && highResult.status === "completed");
  } catch (error) { report("priority replacement", false, error.message); }

  try {
    const handle = NCNEffects.play("relay-scan", target, { duration: 260 });
    await sleep(50);
    NCNEffects.suspend();
    const suspended = NCNEffects.snapshot().active[0]?.state;
    await sleep(140);
    NCNEffects.resume();
    const result = await handle.finished;
    report("suspend exposes suspended state", suspended === "suspended", String(suspended));
    report("resume permits normal completion", result.status === "completed");
  } catch (error) { report("suspend and resume", false, error.message); }

  try {
    NCNEffects.setReducedMotion(true);
    const result = await NCNEffects.play("displacement", target, { duration: 90 }).finished;
    NCNEffects.setReducedMotion(false);
    report("reduced-motion substitute completes", result.status === "completed");
  } catch (error) { report("reduced-motion substitute", false, error.message); }

  try {
    const active = NCNEffects.play("relay-scan", target, { duration: 1000, channel: "fault" });
    const queuedOne = NCNEffects.play("relay-scan", target, { duration: 1000, channel: "fault", concurrency: "queue" });
    const queuedTwo = NCNEffects.play("relay-scan", target, { duration: 1000, channel: "fault", concurrency: "queue" });
    await sleep(30);
    NCNEffects.clear("fault");
    const cleared = await Promise.all([active.finished, queuedOne.finished, queuedTwo.finished]);
    await sleep(20);
    report("clear cancels active and queued effects", cleared.every(result => result.reason === "cleared"));
    report("clear leaves runtime and overlays empty", NCNViewerRuntime.snapshot().taskCount === 0 && overlays() === 0);
  } catch (error) { report("clear active and queued", false, error.message); }

  try {
    const sequences = [];
    NCNEffects.register("seed-test", {
      duration: 50,
      maxFps: 60,
      create({ random }) {
        const sequence = [];
        sequences.push(sequence);
        return { frame: () => sequence.push(Number(random().toFixed(8))) };
      }
    });
    const first = NCNEffects.play("seed-test", target, { seed: 123, channel: "seed-a" });
    const second = NCNEffects.play("seed-test", target, { seed: 123, channel: "seed-b" });
    await Promise.all([first.finished, second.finished]);
    report("identical seeds reproduce random sequence", JSON.stringify(sequences[0]) === JSON.stringify(sequences[1]));
  } catch (error) { report("deterministic seed", false, error.message); }

  try {
    NCNEffects.setProfile({ ambient: true, interaction: true });
    const result = await NCNEffects.pulseEntry(target, { force: true, duration: 60 }).finished;
    report("legacy pulseEntry wrapper remains available", result.status === "completed");
  } catch (error) { report("legacy wrapper", false, error.message); }

  try {
    NCNEffects.destroy();
    await sleep(20);
    report("destroy clears registry and active handles", NCNEffects.snapshot().destroyed && NCNEffects.snapshot().active.length === 0);
    report("destroy leaves no runtime task or overlay", NCNViewerRuntime.snapshot().taskCount === 0 && overlays() === 0);
  } catch (error) { report("destroy", false, error.message); }
})();
