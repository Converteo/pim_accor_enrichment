import { useTranslations } from "next-intl";
import { useEffect, useId, useState, type FormEvent } from "react";
import { fetchFieldValues } from "@/data/source";
import { isTime, joinCodes, splitCodes } from "@/domain/rules";
import type { EnrichmentValue, FieldValues } from "@/domain/types";
import { errorText } from "./labels";
import styles from "./CorrectionForm.module.css";

interface CorrectionFormProps {
  value: EnrichmentValue;
  busy: boolean;
  onCancel: () => void;
  /** `corrected` is in PIM format: list keys joined by |, True/False, HH:MM or a number. */
  onSubmit: (corrected: string) => void;
}

type Input = "boolean" | "number" | "time" | "text";

// PIM data types (raw.pim_model); hours are String fields whose values look like HH:MM.
function inputFor(field: FieldValues, current: string | null): Input {
  if (field.dataType === "Boolean") return "boolean";
  if (field.dataType === "Integer" || field.dataType === "Double") return "number";
  return isTime(current) ? "time" : "text";
}

/** Correct a value with the codes the PIM allows for this field, or a typed input when the field has no list. */
export function CorrectionForm({ value, busy, onCancel, onSubmit }: CorrectionFormProps) {
  const t = useTranslations("correct");
  const tRoot = useTranslations();
  const [field, setField] = useState<FieldValues | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [text, setText] = useState(value.value ?? "");
  const titleId = useId();

  useEffect(() => {
    let current = true;
    fetchFieldValues(value.pimField).then(
      (loaded) => {
        if (!current) return;
        setField(loaded);
        const keys = new Set(loaded.values.map((option) => option.key));
        setCodes(splitCodes(value.value).filter((code) => keys.has(code)));
      },
      (failure: unknown) => current && setError(failure),
    );
    return () => {
      current = false;
    };
  }, [value.pimField, value.value]);

  if (error) {
    return (
      <p className={styles.error} role="alert">
        {t("loadError")} {errorText(tRoot, error)}
      </p>
    );
  }
  // A list field whose codes are missing from the view: free text would only be refused by the back.
  if (field?.dataType === "CVL" && field.values.length === 0) {
    return (
      <p className={styles.error} role="alert">
        {t("loadError")}
      </p>
    );
  }
  if (!field) {
    return (
      <p className={styles.hint} role="status">
        {t("loading")}
      </p>
    );
  }

  const hasList = field.values.length > 0;
  const input = inputFor(field, value.value);
  // Codes in the list's order: the same selection always gives the same value.
  const corrected = hasList
    ? joinCodes(field.values.map((option) => option.key).filter((key) => codes.includes(key)))
    : input === "number" && text.trim() !== ""
      ? String(Number(text))
      : text.trim();
  const unchanged = hasList
    ? corrected === joinCodes(field.values.map((option) => option.key).filter((key) => splitCodes(value.value).includes(key)))
    : corrected === (value.value ?? "");

  function toggle(key: string, checked: boolean) {
    setCodes((current) => (checked ? [...current, key] : current.filter((code) => code !== key)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (corrected !== "" && !unchanged) onSubmit(corrected);
  }

  return (
    <form className={styles.form} aria-labelledby={titleId} onSubmit={submit}>
      <span id={titleId} className={styles.title}>
        {t("title", { label: value.label })}
      </span>
      {hasList && field.multivalue ? (
        <fieldset className={styles.options} aria-describedby={titleId}>
          <legend className={styles.hint}>{t("several")}</legend>
          {field.values.map((option) => (
            <label key={option.key} className={styles.option}>
              <input
                type="checkbox"
                checked={codes.includes(option.key)}
                onChange={(event) => toggle(option.key, event.target.checked)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      ) : hasList ? (
        <select
          className="field"
          aria-labelledby={titleId}
          value={codes[0] ?? ""}
          onChange={(event) => setCodes(event.target.value ? [event.target.value] : [])}
        >
          <option value="">{t("choose")}</option>
          {field.values.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      ) : input === "boolean" ? (
        <select
          className="field"
          aria-labelledby={titleId}
          value={text}
          onChange={(event) => setText(event.target.value)}
        >
          <option value="">{t("choose")}</option>
          <option value="True">{t("yes")}</option>
          <option value="False">{t("no")}</option>
        </select>
      ) : (
        <input
          className="field"
          type={input}
          min={input === "number" ? 0 : undefined}
          step={input === "number" ? (field.dataType === "Integer" ? 1 : "any") : undefined}
          aria-labelledby={titleId}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      )}
      <div className={styles.buttons}>
        <button type="button" className="btn btn-ghost btn-small" onClick={onCancel}>
          {t("cancel")}
        </button>
        <button type="submit" className="btn btn-primary btn-small" disabled={busy || corrected === "" || unchanged}>
          {t("submit")}
        </button>
      </div>
    </form>
  );
}
