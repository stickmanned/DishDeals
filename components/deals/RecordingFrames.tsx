"use client";

// Minimal screen-recording chooser, frame progress and cancel hint for the canonical post page (T-14B).
// Uses the existing Harry classes only. The pure ImageDraftFlow controller does all the work (decode via
// grabFrames, four owned uploads, one analysis); this component only shows its state. There is no reveal
// or animation here: the repo has no existing frame-reveal interface, which is recorded in
// docs/integration/recording-frame-bindings.md for the human frontend owners.
// Nothing here ran in a browser, on a phone, or on a real recording.

import type { ChangeEvent } from "react";
import { isRunning, type FlowSnapshot, type ImageDraftFlow } from "@/lib/imageDraftFlow";
import { RECORDING_COPY, RECORDING_FRAME_COUNT } from "@/lib/recordingFrameFlow";

export function RecordingPicker({ flow, snap }: { flow: ImageDraftFlow; snap: FlowSnapshot }) {
  const running = isRunning(snap.phase);
  const { recording, recordingError } = snap.source;

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same recording again; canceling the picker keeps the previous choice
    if (chosen) flow.selectRecording(chosen);
  }

  const status =
    snap.phase === "preparing" && recording
      ? RECORDING_COPY.decoding
      : snap.phase === "uploading" && snap.progress
        ? RECORDING_COPY.uploading(snap.progress.done, snap.progress.total)
        : snap.phase === "extracting" && recording
          ? RECORDING_COPY.extracting
          : null;

  return (
    <div className="form-stack" aria-label="Screen recording">
      <h3>{RECORDING_COPY.heading}</h3>
      <p className="muted">{RECORDING_COPY.explain}</p>
      <label className="field">
        Choose a screen recording (MP4, MOV or WebM, up to 20 MB)
        <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={pick} disabled={running} />
      </label>
      {recordingError && (
        <p role="alert" className="field-error">
          {recordingError}
        </p>
      )}
      {recording && (
        <p role="status">
          {recording.name} · {(recording.size / 1048576).toFixed(1)} MB · {RECORDING_FRAME_COUNT} frames{snap.uploaded ? " · uploaded" : ""}{" "}
          <button type="button" className="text-button" disabled={running} onClick={() => flow.selectRecording(null)}>
            Remove
          </button>
        </p>
      )}
      {status && (
        <p role="status" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  );
}
