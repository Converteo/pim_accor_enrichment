import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { fetchAutoValidation, saveAutoValidation } from "@/data/source";
import { parseThreshold, simulate, thresholdsValid, type Outcome } from "@/domain/rules";
import type { AutoValidation, AutoValidationStepState, Thresholds } from "@/domain/types";
import { errorText } from "./labels";
import styles from "./AutoValidationPanel.module.css";

interface AutoValidationPanelProps {
  /** Loaded each time the panel opens: the distribution follows the decisions taken meanwhile. */
  open: boolean;
  /** After a save: statuses changed, the lists and counters must be read again. */
  onSaved: (message: string) => void;
}

/** Thresholds of automatic validation, matches and attributes (validation.auto_validation_settings). */
export function AutoValidationPanel({ open, onSaved }: AutoValidationPanelProps) {
  const t = useTranslations("settings");
  const tRoot = useTranslations();
  const [state, setState] = useState<AutoValidation | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    let current = true;
    fetchAutoValidation().then(
      (loaded) => {
        if (!current) return;
        setState(loaded);
        setError(null);
      },
      (failure: unknown) => current && setError(failure),
    );
    return () => {
      current = false;
    };
  }, [open]);

  if (error && !state) {
    return (
      <p className={styles.note} role="alert">
        {t("error")} {errorText(tRoot, error)}
      </p>
    );
  }
  if (!state) {
    return (
      <p className={styles.note} role="status">
        {t("loading")}
      </p>
    );
  }
  return (
    <div className={styles.panel}>
      <p className={styles.intro}>{t("intro")}</p>
      {state.canEdit ? null : <p className={styles.readOnly}>{t("readOnly")}</p>}
      {state.steps.map((step) => (
        <StepSettings
          // A new state (after a save) resets the draft to what is now in force.
          key={`${step.step}|${step.history[0]?.setAt ?? "default"}`}
          step={step}
          canEdit={state.canEdit}
          onSaved={(next) => {
            setState(next);
            onSaved(t("saved"));
          }}
        />
      ))}
    </div>
  );
}

interface Draft {
  approveOn: boolean;
  approve: string;
  rejectOn: boolean;
  reject: string;
}

function draftOf(step: AutoValidationStepState): Draft {
  return {
    approveOn: step.approveThreshold !== null,
    approve: String(step.approveThreshold ?? 90),
    rejectOn: step.rejectThreshold !== null,
    reject: String(step.rejectThreshold ?? 30),
  };
}

/** undefined while a typed threshold is not an integer from 0 to 100. */
function thresholdsOf(draft: Draft): Thresholds | undefined {
  const approve = draft.approveOn ? parseThreshold(draft.approve) : null;
  const reject = draft.rejectOn ? parseThreshold(draft.reject) : null;
  return approve === undefined || reject === undefined
    ? undefined
    : { approveThreshold: approve, rejectThreshold: reject };
}

interface StepSettingsProps {
  step: AutoValidationStepState;
  canEdit: boolean;
  onSaved: (state: AutoValidation) => void;
}

function StepSettings({ step, canEdit, onSaved }: StepSettingsProps) {
  const t = useTranslations("settings");
  const tRoot = useTranslations();
  const format = useFormatter();
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => draftOf(step));
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current: Thresholds = { approveThreshold: step.approveThreshold, rejectThreshold: step.rejectThreshold };
  const next = thresholdsOf(draft);
  const valid = next !== undefined && thresholdsValid(next);
  const changed =
    next !== undefined &&
    (next.approveThreshold !== current.approveThreshold || next.rejectThreshold !== current.rejectThreshold);
  const now = simulate(step.distribution, current);
  const simulated = valid ? simulate(step.distribution, next) : null;
  const total = step.distribution.reduce((sum, bucket) => sum + bucket.total, 0);
  const shown = (value: number | null) => (value === null ? t("off") : String(value));

  async function save() {
    if (!next || !valid || !changed || saving) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveAutoValidation(step.step, next, comment));
    } catch (failure) {
      setError(errorText(tRoot, failure));
    } finally {
      setSaving(false);
    }
  }

  function patch(change: Partial<Draft>) {
    setDraft((currentDraft) => ({ ...currentDraft, ...change }));
  }

  return (
    <section className={styles.step} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.stepTitle}>
        {t(`steps.${step.step}`)}
      </h3>
      <p className={styles.rule}>{t(`rules.${step.step}`)}</p>
      <p className={styles.current}>
        {t("current", {
          approve: shown(step.approveThreshold),
          reject: shown(step.rejectThreshold),
        })}
        {step.isDefault ? <span className={styles.tag}>{t("isDefault")}</span> : null}
      </p>

      <div className={styles.fields}>
        <ThresholdField
          label={t("approve")}
          enabledLabel={t("enabled")}
          on={draft.approveOn}
          value={draft.approve}
          disabled={!canEdit || saving}
          onToggle={(on) => patch({ approveOn: on })}
          onChange={(value) => patch({ approve: value })}
        />
        <ThresholdField
          label={t("reject")}
          enabledLabel={t("enabled")}
          on={draft.rejectOn}
          value={draft.reject}
          disabled={!canEdit || saving}
          onToggle={(on) => patch({ rejectOn: on })}
          onChange={(value) => patch({ reject: value })}
        />
      </div>
      {next !== undefined && !valid ? (
        <p className={styles.error} role="alert">
          {t("invalid")}
        </p>
      ) : null}

      <table className={styles.simulation}>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">{t("autoApproved")}</th>
            <th scope="col">{t("autoRejected")}</th>
            <th scope="col">{t("toValidate")}</th>
          </tr>
        </thead>
        <tbody>
          <OutcomeRow label={t("now")} outcome={now} />
          {simulated && changed ? <OutcomeRow label={t("simulated")} outcome={simulated} compare={now} /> : null}
        </tbody>
      </table>
      <p className={styles.scope}>{t("scope", { count: total })}</p>

      {canEdit ? (
        <div className={styles.save}>
          <input
            className={`field ${styles.comment}`}
            type="text"
            value={comment}
            maxLength={500}
            placeholder={t("comment")}
            aria-label={t("comment")}
            disabled={saving}
            onChange={(event) => setComment(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid || !changed || saving}
            onClick={() => void save()}
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <details className={styles.history}>
        <summary>{t("history")}</summary>
        {step.history.length === 0 ? (
          <p className={styles.note}>{t("noHistory")}</p>
        ) : (
          <ul>
            {step.history.slice(0, 10).map((change) => (
              <li key={change.setAt}>
                {t("change", {
                  date: format.dateTime(new Date(change.setAt), { dateStyle: "short", timeStyle: "short" }),
                  author: change.author,
                  approve: shown(change.approveThreshold),
                  reject: shown(change.rejectThreshold),
                })}
                {change.comment ? <span className={styles.changeComment}> — {change.comment}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}

interface ThresholdFieldProps {
  label: string;
  enabledLabel: string;
  on: boolean;
  value: string;
  disabled: boolean;
  onToggle: (on: boolean) => void;
  onChange: (value: string) => void;
}

function ThresholdField({ label, enabledLabel, on, value, disabled, onToggle, onChange }: ThresholdFieldProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          id={id}
          className={`field ${styles.number}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={disabled || !on}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className={styles.unit}>/100</span>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={on}
            disabled={disabled}
            onChange={(event) => onToggle(event.target.checked)}
          />
          {enabledLabel}
        </label>
      </div>
    </div>
  );
}

function OutcomeRow({ label, outcome, compare }: { label: string; outcome: Outcome; compare?: Outcome }) {
  const tRoot = useTranslations();
  const cell = (key: keyof Outcome) => {
    const delta = compare ? outcome[key] - compare[key] : 0;
    return (
      <td>
        {tRoot("number", { value: outcome[key] })}
        {delta !== 0 ? (
          <span className={delta > 0 ? styles.up : styles.down}>
            {" "}
            ({delta > 0 ? "+" : "−"}
            {tRoot("number", { value: Math.abs(delta) })})
          </span>
        ) : null}
      </td>
    );
  };
  return (
    <tr className={compare ? styles.simulatedRow : undefined}>
      <th scope="row">{label}</th>
      {cell("autoApproved")}
      {cell("autoRejected")}
      {cell("toValidate")}
    </tr>
  );
}
