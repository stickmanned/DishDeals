"use client";
import { useState, type FormEvent } from "react";
import { draftSchema, type Draft } from "@/lib/frontend/draft";
import { Icon } from "./Icon";
export function DraftForm({
  value,
  onChange,
  onSave,
  onBack,
  editing = false,
}: {
  value: Draft;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onBack: () => void;
  editing?: boolean;
}) {
  const [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const update = (key: keyof Draft, text: string) => {
    onChange({ ...value, [key]: text });
    setConfirmed(false);
  };
  function save(e: FormEvent) {
    e.preventDefault();
    const result = draftSchema.safeParse(value);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    if (!confirmed) {
      setError("Check the offer details before finishing the preview.");
      return;
    }
    setError("");
    onSave();
  }
  return (
    <form className="form-stack" onSubmit={save}>
      <p className="step-label">02 / REVIEW YOUR PREVIEW</p>
      <div className="review-header">
        <Icon name="edit" size={28} />
        <div>
          <h2>{editing ? "Tidy up your find." : "Make the details clear."}</h2>
          <p className="quiet-note">
            This is a local draft. It won’t publish to the community.
          </p>
        </div>
      </div>
      <label className="field">
        Restaurant
        <input
          required
          value={value.restaurant}
          onChange={(e) => update("restaurant", e.target.value)}
          maxLength={200}
          placeholder="The place behind the offer"
        />
      </label>
      <label className="field">
        The offer
        <textarea
          required
          value={value.dealText}
          onChange={(e) => update("dealText", e.target.value)}
          maxLength={2000}
          placeholder="What’s on offer, and what’s included?"
        />
      </label>
      <div className="field-row">
        <label className="field">
          Price in CAD
          <input
            inputMode="decimal"
            value={value.price}
            onChange={(e) => update("price", e.target.value)}
            placeholder="Leave blank if unknown"
          />
          <small>Unknown prices show as “Price varies”.</small>
        </label>
        <label className="field">
          Expiry date
          <input
            type="text"
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
            maxLength={10}
            value={value.expiry}
            onChange={(e) => update("expiry", e.target.value)}
            onInput={(e) => update("expiry", e.currentTarget.value)}
          />
          <small>Leave blank if it’s not listed.</small>
        </label>
      </div>
      <label className="field">
        Address
        <input
          value={value.address}
          onChange={(e) => update("address", e.target.value)}
          placeholder="Use only what the source says"
          maxLength={500}
        />
      </label>
      <fieldset className="filter-fieldset" style={{ margin: 0 }}>
        <legend>Days it’s available</legend>
        <div className="weekdays">
          {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => (
            <button
              type="button"
              key={d}
              aria-pressed={value.days.includes(d)}
              onClick={() => {
                onChange({
                  ...value,
                  days: value.days.includes(d)
                    ? value.days.filter((v) => v !== d)
                    : [...value.days, d],
                });
                setConfirmed(false);
              }}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <p className="quiet-note" style={{ marginTop: 8 }}>
          No days selected means every day.
        </p>
      </fieldset>
      <div className="field-row">
        <label className="field">
          From
          <input
            type="time"
            value={value.start}
            onChange={(e) => update("start", e.target.value)}
            onInput={(e) => update("start", e.currentTarget.value)}
          />
        </label>
        <label className="field">
          Until
          <input
            type="time"
            value={value.end}
            onChange={(e) => update("end", e.target.value)}
            onInput={(e) => update("end", e.currentTarget.value)}
          />
        </label>
      </div>
      <p className="quiet-note">
        Vancouver local time. An end time before the start runs past midnight.
      </p>
      <label className="field">
        Conditions
        <textarea
          value={value.conditions}
          onChange={(e) => update("conditions", e.target.value)}
          maxLength={6000}
          placeholder="One condition per line"
        />
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          required
        />
        <span>
          I checked the offer details.
          <small>
            There’s no verified restaurant location in this local preview.
          </small>
        </span>
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={onBack}>
          Back
        </button>
        <button className="button primary draft-submit">
          {editing ? "Save preview" : "Finish preview"}
        </button>
      </div>
    </form>
  );
}
