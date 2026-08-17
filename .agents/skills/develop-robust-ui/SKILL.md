---
name: develop-robust-ui
description: Build, refactor, fix, or review concise and regression-resistant frontend/UI code. Use for browser interfaces involving DOM or component state, CSS and responsive layout, pointer or keyboard input, text selection, focus and dialogs, animations, persistence, virtualization, loading states, or rendering performance.
---

# Develop Robust UI

Treat UI work as preserving behavioral invariants across input methods, layout changes, async transitions, and browser-native behavior. Prefer the smallest model that makes invalid states impossible.

## 1. Establish the contract

Before editing:

1. Trace the current event, state, render, and cleanup paths involved in the change.
2. State the target user flow and the invariant that must remain true.
3. List adjacent behavior that must not change.
4. Identify native browser behavior at risk: selection, focus, scrolling, dragging, navigation, form input, or accessibility semantics.
5. Separate facts known immediately from values derived after measurement, layout, or async work.

Do not start by adding a listener or flag. First find the existing owner of the behavior.

## 2. Keep one canonical model

- Give every behavior one owner and one source of truth.
- Store the minimal canonical state; derive labels, geometry, progress, and visual classes from it.
- Never let measured geometry overwrite semantic state unless the user performed an action that changes that state.
- Distinguish persistent, session, transient interaction, and derived render state.
- Use an enum or discriminated union when booleans could form contradictory states.
- Represent a queued interaction by its intended target, not only its currently rendered frame.
- Use stable semantic identity for persisted positions. Add precise offsets or quote context when an item can span multiple views; keep a documented fallback.
- Define cleanup for cancel, Escape, outside click, navigation, replacement, unmount, and failed async work.

If two values must be kept synchronized manually, remove one or appoint a single update boundary.

## 3. Arbitrate interactions explicitly

For any global click, tap, drag, swipe, or key handler, decide whether it yields to:

- an interactive or editable descendant;
- an active text selection;
- a dialog, popover, or pinned mode;
- another pointer type or non-primary button;
- a gesture that exceeded the tap threshold;
- browser scrolling, zooming, dragging, or navigation.

Then apply these rules:

- Classify Pointer Events by `pointerType`, pointer identity, button, movement, and cancellation.
- Keep mouse text selection available; enable swipe only for intended pointer types.
- Handle `pointercancel` and interrupted gestures.
- Scope `preventDefault()` and `touch-action` narrowly. Preserve native behavior by default.
- Distinguish internal content dragging from external file dropping by origin and `DataTransfer` payload.
- Treat DOM selection and element focus as separate state. If a selection must remain visible after focus moves, clone its `Range` and render a temporary preview; remove it on cancel.
- Do not infer a click from `pointerup` alone when selection or dragging may have occurred.
- Keep keyboard focus visible with `:focus-visible`; do not use pressed, selected, open, hover, and focus as synonyms.

## 4. Preserve layout and motion invariants

- Decide which geometry must remain fixed before choosing CSS.
- Reserve stable space or use an overlay when transient chrome must not move content.
- Animate `transform` and `opacity` where practical; avoid geometry-changing animation.
- Give fixed controls explicit dimensions, `box-sizing`, and non-shrinking flex/grid behavior.
- Treat rest, hover, active press, keyboard focus, open/selected, and disabled as separate visual states.
- During rapid repeated input, accumulate the destination and animate from the current visual position toward it; do not restart from stale state.
- Honor `prefers-reduced-motion` without breaking the final state.
- Test responsive breakpoints just below, at, and just above the boundary, plus content wrapping and browser zoom.

## 5. Make the critical path fast and honest

- Measure before optimizing; identify parsing, scripting, style, layout, paint, and network costs separately.
- Render the first useful or restored state before secondary totals and metadata.
- Mark unknown values as unknown. Do not expose guesses as exact UI state.
- Bound large DOM work with chunking, virtualization, containment, or progressive rendering.
- Coalesce resize and observer work to a frame. Batch DOM reads before DOM writes.
- Prevent observer feedback loops and stale async results.
- Cancel timers, animation frames, observers, workers, and requests when their owner ends.
- Feature-detect newer browser APIs and provide a fallback when the supported browser range requires one.

## 6. Keep the implementation concise

- Make the smallest change that restores the invariant across all relevant paths.
- Put policy in small pure functions; keep DOM mutation and side effects at the boundary.
- Prefer platform semantics and existing project primitives over new abstractions.
- Do not create a wrapper used once, duplicate a state machine, or add a timeout where an event or explicit transition exists.
- Remove superseded listeners, branches, styles, flags, and compatibility code in the same change.
- Name states and transitions after user-visible meaning.
- Comment only the non-obvious invariant, browser quirk, or cleanup reason.

After editing, ask whether deleting a flag, listener, DOM pass, or special case would make the behavior clearer without losing coverage.

## 7. Verify behavior, not implementation

For each changed invariant, cover:

1. the successful flow;
2. the inverse flow that must not trigger;
3. interruption or cancellation;
4. rapid repetition or re-entry;
5. a relevant boundary such as resize, reload, breakpoint, long content, or missing target.

Add the narrowest stable regression test for every fixed bug. Test pure decisions without a browser, component behavior through accessible controls, and browser-dependent selection, focus, animation, geometry, drag/drop, and performance in a real browser.

For rendered changes, verify the exact user flow, console health, keyboard path, desktop and mobile geometry, and the closest neighboring interaction. A passing build alone is not UI evidence. Report anything the available automation could not reproduce.

## Regression prompts

Before declaring completion, answer:

- Can this handler steal a native interaction?
- Can derived layout overwrite canonical user state?
- Can two state fields disagree?
- What happens when input repeats before the transition finishes?
- What survives focus change, resize, reload, or content replacement?
- What removes transient state after cancel or failure?
- Can showing or hiding UI move the user's content?
- Are loading values exact, pending, stale, or unavailable?
- Did the test prove both activation and suppression?
